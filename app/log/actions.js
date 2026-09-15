"use server";

import { revalidatePath } from "next/cache";
import { query } from "../../lib/db";
import { rebuildRecords } from "../../lib/records";

const BGB_OPTIONS = {
  no_response: 0,
  decline: 0.5,
  accept: 1,
  no_show: 0,
};

function buildRows(eventType, value, reason) {
  if (eventType === "poll") {
    if (value === 0)
      return [{ measure: "poll_response", value: 0, reason: null }];
    return [
      { measure: "poll_response", value: 1, reason: null },
      { measure: "car_cp", value: value, reason: null },
    ];
  }

  return [{ measure: eventType, value: value, reason: reason || null }];
}

export async function logEvent(formData) {
  const eventType = formData.get("event_type");
  const eventDate = formData.get("event_date");

  if (!eventType || !eventDate) return;

  const players = await query("SELECT id FROM players WHERE status = 'active'");

  const eventRows = await query(
    `INSERT INTO events (event_type, event_date)
     VALUES ($1, $2)
     ON CONFLICT (event_type, event_date)
     DO UPDATE SET event_type = EXCLUDED.event_type
     RETURNING id`,
    [eventType, eventDate],
  );

  const eventId = eventRows[0].id;

  // Kill Event accumulates: rows are created once, then ticks only ever
  // flip a 1 to a 0. Earlier ticks are never undone by a later save.
  if (eventType === "kill_event") {
    await query(
      `INSERT INTO scores (player_id, event_id, measure, value)
              SELECT p.id, $1, 'kill_event', 1 FROM players p WHERE p.status = 'active'
       ON CONFLICT (player_id, event_id, measure) DO NOTHING`,
      [eventId],
    );

    const ticked = players
      .filter((p) => formData.get(`p_${p.id}`) !== null)
      .map((p) => p.id);

    if (ticked.length > 0) {
      await query(
        `UPDATE scores SET value = 0
         WHERE event_id = $1 AND measure = 'kill_event'
           AND player_id = ANY($2::int[])`,
        [eventId, ticked],
      );
    }

    const counts = await query(
      `SELECT
         COUNT(*) FILTER (WHERE value = 0)::int AS unshielded,
         COUNT(*)::int AS total
       FROM scores WHERE event_id = $1 AND measure = 'kill_event'`,
      [eventId],
    );

    revalidatePath("/log");
    revalidatePath("/rankings");
    revalidatePath("/");

    return {
      unshielded: counts[0].unshielded,
      total: counts[0].total,
    };
  }

  // Saving never removes what is already there. A player with no row gets
  // one, using the form value or zero if they were left blank. A player who
  // already has a row is only updated when the form actually carried a
  // value for them, so a second save can add to a first without wiping it.
  let inserted = 0;
  let updated = 0;

  for (const player of players) {
    const raw = formData.get(`p_${player.id}`);
    const blank = raw === null || String(raw).trim() === "";

    let value;
    let reason = null;

    if (eventType === "black_gold") {
      const choice = blank ? "no_response" : String(raw);
      value = BGB_OPTIONS[choice] ?? 0;
      reason = choice;
    } else {
      const trimmed = blank ? "" : String(raw).trim();
      const parsed = trimmed === "" ? 0 : Number(trimmed);
      value = Number.isFinite(parsed) ? parsed : 0;

      if (eventType === "vs" && formData.get(`h_${player.id}`) !== null) {
        reason = "holiday";
      }
    }

    for (const row of buildRows(eventType, value, reason)) {
      // DO UPDATE is guarded by the WHERE clause: with nothing entered for
      // this player the conflicting row is left exactly as it was.
      const result = await query(
        `INSERT INTO scores (player_id, event_id, measure, value, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id, event_id, measure)
         DO UPDATE SET value = EXCLUDED.value, reason = EXCLUDED.reason
         WHERE $6
         RETURNING (xmax = 0) AS was_insert`,
        [player.id, eventId, row.measure, row.value, row.reason, !blank],
      );

      if (result.length === 0) continue;
      if (result[0].was_insert) inserted += 1;
      else updated += 1;
    }
  }

  if (eventType === "vs") await rebuildRecords();

  revalidatePath("/log");
  revalidatePath("/rankings");
  revalidatePath("/");

  return { inserted, updated };
}

// Writes a parsed VS CSV. Dates already logged are skipped whole, so a
// second upload of the same week only adds the days that are missing.
export async function importVs(entries, dates) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { error: "Nothing to import." };
  }

  if (!Array.isArray(dates) || dates.length === 0) {
    return { error: "No dates supplied." };
  }

  const existing = await query(
    `SELECT event_date::text AS event_date
     FROM events
     WHERE event_type = 'vs' AND event_date = ANY($1::date[])`,
    [dates],
  );

  const skip = new Set(existing.map((e) => e.event_date));
  const toWrite = dates.filter((d) => !skip.has(d));

  if (toWrite.length === 0) {
    return { error: "Every date in this file has already been logged." };
  }

  // Renames and new players first, so every entry has an id to write against.
  const resolved = [];

  for (const entry of entries) {
    if (entry.target === "new") {
      const created = await query(
        `INSERT INTO players (name, status, status_date)
         VALUES ($1, 'active', CURRENT_DATE)
         ON CONFLICT (name) DO UPDATE
           SET status = 'active', status_date = CURRENT_DATE
         RETURNING id`,
        [entry.csvName.trim()],
      );
      resolved.push({ playerId: created[0].id, cells: entry.cells });
      continue;
    }

    const playerId = Number(entry.target);
    if (!Number.isInteger(playerId) || playerId <= 0) continue;

    if (entry.rename) {
      await query("UPDATE players SET name = $1 WHERE id = $2", [
        entry.csvName.trim(),
        playerId,
      ]);
    }

    resolved.push({ playerId, cells: entry.cells });
  }

  let written = 0;

  for (const date of toWrite) {
    const eventRows = await query(
      `INSERT INTO events (event_type, event_date)
       VALUES ('vs', $1)
       ON CONFLICT (event_type, event_date)
       DO UPDATE SET event_type = EXCLUDED.event_type
       RETURNING id`,
      [date],
    );

    const eventId = eventRows[0].id;

    for (const player of resolved) {
      const cell = player.cells.find((c) => c.date === date);

      // No value means no row: the player was not in the alliance that day,
      // which is different from being present and scoring nothing.
      if (!cell || cell.value === null || cell.value === undefined) continue;

      await query(
        `INSERT INTO scores (player_id, event_id, measure, value, reason)
         VALUES ($1, $2, 'vs', $3, $4)
         ON CONFLICT (player_id, event_id, measure)
         DO UPDATE SET value = EXCLUDED.value, reason = EXCLUDED.reason`,
        [player.playerId, eventId, cell.value, cell.holiday ? "holiday" : null],
      );

      written += 1;
    }
  }

  await rebuildRecords();

  revalidatePath("/log");
  revalidatePath("/rankings");
  revalidatePath("/");

  return {
    written,
    events: toWrite.length,
    skippedDates: skip.size,
  };
}
