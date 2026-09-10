"use server";

import { revalidatePath } from "next/cache";
import { query } from "../../lib/db";

function buildRows(eventType, value) {
  if (eventType === "poll") {
    if (value === 0) {
      return [{ measure: "poll_response", value: 0 }];
    }
    return [
      { measure: "poll_response", value: 1 },
      { measure: "car_cp", value: value },
    ];
  }

  return [{ measure: eventType, value: value }];
}

export async function logEvent(formData) {
  const eventType = formData.get("event_type");
  const eventDate = formData.get("event_date");

  if (!eventType || !eventDate) {
    return;
  }

  const players = await query("SELECT id FROM players");

  const eventRows = await query(
    `INSERT INTO events (event_type, event_date)
     VALUES ($1, $2)
     ON CONFLICT (event_type, event_date)
     DO UPDATE SET event_type = EXCLUDED.event_type
     RETURNING id`,
    [eventType, eventDate],
  );

  const eventId = eventRows[0].id;

  await query("DELETE FROM scores WHERE event_id = $1", [eventId]);

  for (const player of players) {
    const raw = formData.get(`p_${player.id}`);
    const trimmed = raw === null ? "" : String(raw).trim();
    const parsed = trimmed === "" ? 0 : Number(trimmed);
    const value = Number.isFinite(parsed) ? parsed : 0;

    for (const row of buildRows(eventType, value)) {
      await query(
        `INSERT INTO scores (player_id, event_id, measure, value)
         VALUES ($1, $2, $3, $4)`,
        [player.id, eventId, row.measure, row.value],
      );
    }
  }

  revalidatePath("/log");
}
