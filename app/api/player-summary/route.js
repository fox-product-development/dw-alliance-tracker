import { query } from "../../../lib/db";
import { weekBounds, weekDays, weekOffsetFor, iso } from "../../../lib/window";

export const dynamic = "force-dynamic";

const DAY_LABELS = ["Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"];

const ATTENDANCE = ["frankie", "zombies", "war", "poll_response"];

const BLACK_GOLD_REASONS = ["no_response", "decline", "accept", "no_show"];

export async function GET(request) {
  const params = request.nextUrl.searchParams;

  const playerId = Number(params.get("playerId"));
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return Response.json({ error: "Bad player id" }, { status: 400 });
  }

  const weeksBack = Number(params.get("weeksBack") || 0);
  if (!Number.isInteger(weeksBack) || weeksBack < 0) {
    return Response.json({ error: "Bad week offset" }, { status: 400 });
  }

  const found = await query(
    "SELECT id, name FROM players WHERE id = $1 AND status = 'active'",
    [playerId],
  );
  if (found.length === 0) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }

  // event_date is cast to text in the query itself so Postgres returns
  // the plain YYYY-MM-DD string. Letting `pg` build a JS Date from it
  // instead applies the server process's local timezone, which shifts
  // the date by however far that timezone sits from UTC — this was the
  // cause of every VS value showing under the previous day.
  const rows = await query(
    `SELECT s.measure, s.value, s.reason, e.event_date::text AS event_date
     FROM scores s
     JOIN events e ON e.id = s.event_id
     WHERE s.player_id = $1
     ORDER BY e.event_date ASC`,
    [playerId],
  );

  // VS rows keyed by date, so a missing date can be told from a zero.
  const vsByDate = new Map();
  let earliestVs = null;

  const blackGold = {};
  for (const r of BLACK_GOLD_REASONS) blackGold[r] = 0;

  const attendance = {};
  for (const m of ATTENDANCE) attendance[m] = { attended: 0, events: 0 };

  // A kill_event row holds 1 for shielded and 0 for unshielded, so the
  // count of zeros is the number of times they were caught unshielded.
  let unshielded = 0;

  for (const row of rows) {
    const value = Number(row.value);
    const date = row.event_date;

    if (row.measure === "vs") {
      vsByDate.set(date, { value, holiday: row.reason === "holiday" });
      if (earliestVs === null) earliestVs = date;
      continue;
    }

    if (row.measure === "black_gold") {
      if (Object.hasOwn(blackGold, row.reason)) blackGold[row.reason] += 1;
      continue;
    }

    if (row.measure === "kill_event") {
      if (value === 0) unshielded += 1;
      continue;
    }

    if (Object.hasOwn(attendance, row.measure)) {
      attendance[row.measure].events += 1;
      attendance[row.measure].attended += value;
    }
  }

  const { start, end } = weekBounds(weeksBack);

  const days = weekDays(start).map((date, i) => {
    const entry = vsByDate.get(date);
    return {
      label: DAY_LABELS[i],
      date,
      value: entry ? entry.value : null,
      holiday: entry ? entry.holiday : false,
    };
  });

  const total = days.reduce((sum, d) => sum + (d.value || 0), 0);

  return Response.json({
    player: found[0].name,
    week: {
      start: iso(start),
      end: iso(end),
      days,
      total,
    },
    maxWeeksBack:
      earliestVs === null ? 0 : Math.max(0, weekOffsetFor(earliestVs)),
    blackGold,
    attendance,
    unshielded,
  });
}
