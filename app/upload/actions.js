"use server";

import { revalidatePath } from "next/cache";
import { query } from "../../lib/db";

export async function saveAttendance(
  eventType,
  eventDate,
  presentIds,
  renames,
) {
  if (!eventType || !eventDate) {
    return { error: "Event type and date are required." };
  }

  for (const rename of renames || []) {
    if (!rename.id || !rename.name) continue;
    await query("UPDATE players SET name = $1 WHERE id = $2", [
      rename.name.trim(),
      rename.id,
    ]);
  }

  const eventRows = await query(
    `INSERT INTO events (event_type, event_date)
     VALUES ($1, $2)
     ON CONFLICT (event_type, event_date)
     DO UPDATE SET event_type = EXCLUDED.event_type
     RETURNING id`,
    [eventType, eventDate],
  );

  const eventId = eventRows[0].id;

  await query(
    `INSERT INTO scores (player_id, event_id, measure, value)
         SELECT p.id, $1, $2, 0 FROM players p WHERE p.status = 'active'
     ON CONFLICT (player_id, event_id, measure) DO NOTHING`,
    [eventId, eventType],
  );

  if (presentIds.length > 0) {
    await query(
      `UPDATE scores SET value = 1
       WHERE event_id = $1 AND measure = $2 AND player_id = ANY($3::int[])`,
      [eventId, eventType, presentIds],
    );
  }

  const counts = await query(
    `SELECT
       COUNT(*) FILTER (WHERE value = 1)::int AS present,
       COUNT(*) FILTER (WHERE value = 0)::int AS absent
     FROM scores
     WHERE event_id = $1 AND measure = $2`,
    [eventId, eventType],
  );

  revalidatePath("/upload");
  revalidatePath("/rankings");

  return {
    present: counts[0].present,
    absent: counts[0].absent,
  };
}

export async function addPlayerByName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;

  const rows = await query(
    `INSERT INTO players (name, status, status_date)
     VALUES ($1, 'active', CURRENT_DATE)
     ON CONFLICT (name) DO UPDATE
       SET status = 'active', status_date = CURRENT_DATE
     RETURNING id, name`,
    [trimmed],
  );

  return rows[0];
}
