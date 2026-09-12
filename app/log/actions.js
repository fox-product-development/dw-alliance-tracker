"use server";

import { revalidatePath } from "next/cache";
import { query } from "../../lib/db";

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

  // Every other event type replaces the whole event
  await query("DELETE FROM scores WHERE event_id = $1", [eventId]);

  for (const player of players) {
    const raw = formData.get(`p_${player.id}`);
    let value;
    let reason = null;

    if (eventType === "black_gold") {
      const choice = raw === null ? "no_response" : String(raw);
      value = BGB_OPTIONS[choice] ?? 0;
      reason = choice;
    } else {
      const trimmed = raw === null ? "" : String(raw).trim();
      const parsed = trimmed === "" ? 0 : Number(trimmed);
      value = Number.isFinite(parsed) ? parsed : 0;

      if (eventType === "vs" && formData.get(`h_${player.id}`) !== null) {
        reason = "holiday";
      }
    }

    for (const row of buildRows(eventType, value, reason)) {
      await query(
        `INSERT INTO scores (player_id, event_id, measure, value, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [player.id, eventId, row.measure, row.value, row.reason],
      );
    }
  }

  revalidatePath("/log");
  revalidatePath("/rankings");
  revalidatePath("/");
}
