import Link from "next/link";
import { query } from "../../lib/db";
import { weekBounds, weekDays, iso, pretty } from "../../lib/window";

export const dynamic = "force-dynamic";

const TARGET = 10;

const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default async function LeaguePage({ searchParams }) {
  const params = await searchParams;
  const requested = Number(params?.week);
  const weeksBack =
    Number.isInteger(requested) && requested >= -1 ? requested : 0;

  // -1 is the week in progress. It has no complete data, so the page says
  // so rather than showing a total that is only part of a week.
  const inProgress = weeksBack === -1;

  const { start, end } = weekBounds(inProgress ? 0 : weeksBack);
  const days = weekDays(start);

  let records = [];
  let rows = [];
  let earliest = null;

  if (!inProgress) {
    records = await query(
      "SELECT key, rank, value, week_start::text AS week_start, player_name FROM records ORDER BY key, rank",
    );

    rows = await query(
      `SELECT p.name, s.value, s.reason, e.event_date::text AS event_date
       FROM scores s
       JOIN events e ON e.id = s.event_id
       JOIN players p ON p.id = s.player_id
       WHERE s.measure = 'vs'
         AND e.event_date >= $1 AND e.event_date <= $2`,
      [iso(start), iso(end)],
    );

    const first = await query(
      `SELECT MIN(e.event_date)::text AS first_date
       FROM scores s
       JOIN events e ON e.id = s.event_id
       WHERE s.measure = 'vs'`,
    );
    earliest = first[0]?.first_date || null;
  } else {
    records = await query(
      "SELECT key, rank, value, week_start::text AS week_start, player_name FROM records ORDER BY key, rank",
    );
  }

  const alliance = records.find((r) => r.key === "alliance_week");
  const topPlayers = records.filter((r) => r.key === "player_week");

  // Daily totals across every player, and per-player totals for the list.
  const dailyTotals = new Map(days.map((d) => [d, 0]));
  const byPlayer = new Map();
  const eventDates = new Set();

  for (const row of rows) {
    const value = Number(row.value);
    eventDates.add(row.event_date);

    if (dailyTotals.has(row.event_date)) {
      dailyTotals.set(row.event_date, dailyTotals.get(row.event_date) + value);
    }

    if (!byPlayer.has(row.name)) {
      byPlayer.set(row.name, { total: 0, days: 0, holiday: false });
    }

    const entry = byPlayer.get(row.name);
    entry.total += value;
    entry.days += 1;
    if (row.reason === "holiday") entry.holiday = true;
  }

  const weekTotal = Array.from(dailyTotals.values()).reduce((a, b) => a + b, 0);
  const playerCount = byPlayer.size;
  const average = playerCount > 0 ? weekTotal / playerCount : 0;

  const missing = Array.from(byPlayer.entries())
    .filter(([, e]) => e.total < TARGET)
    .map(([name, e]) => ({
      name,
      total: e.total,
      partial: e.days < eventDates.size,
      holiday: e.holiday,
    }))
    .sort((a, b) => a.total - b.total);

  // The left arrow stops once there is no earlier VS data.
  const atOldest = earliest ? iso(start) <= earliest : true;

  function prettyWeek(weekStart) {
    const s = new Date(`${weekStart}T00:00:00Z`);
    const e = new Date(s);
    e.setUTCDate(e.getUTCDate() + 5);
    return `${pretty(s)} — ${pretty(e)}`;
  }

  return (
    <>
      <div className="page-title">VS League</div>
      <div className="page-sub">
        {inProgress ? "Current week" : `${pretty(start)} — ${pretty(end)}`}
      </div>

      <div className="section-label">All-time records</div>

      <div className="panel scroll-x" style={{ marginBottom: "28px" }}>
        <table className="data">
          <tbody>
            <tr>
              <td>Highest weekly alliance score</td>
              <td className="num">
                {alliance ? `${Number(alliance.value).toFixed(1)}m` : "—"}
              </td>
              <td className="mono">
                {alliance ? prettyWeek(alliance.week_start) : "—"}
              </td>
            </tr>
            {topPlayers.map((r) => (
              <tr key={r.rank}>
                <td>
                  {r.rank === 1
                    ? "Highest weekly player score"
                    : `Player score #${r.rank}`}
                </td>
                <td className="num">{Number(r.value).toFixed(1)}m</td>
                <td className="mono">
                  {r.player_name} · {prettyWeek(r.week_start)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {atOldest && !inProgress ? (
          <span className="mono" style={{ opacity: 0.35, padding: "9px 17px" }}>
            ‹
          </span>
        ) : (
          <Link
            href={`/league?week=${inProgress ? 0 : weeksBack + 1}`}
            className="mono"
            style={{
              padding: "9px 17px",
              border: "1px solid var(--border)",
              borderRadius: "5px",
              color: "var(--text-dim)",
            }}
          >
            ‹
          </Link>
        )}

        <span className="mono" style={{ letterSpacing: "2px" }}>
          {inProgress ? "In progress" : `${weeksBack} week(s) back`}
        </span>

        {inProgress ? (
          <span className="mono" style={{ opacity: 0.35, padding: "9px 17px" }}>
            ›
          </span>
        ) : (
          <Link
            href={`/league?week=${weeksBack - 1}`}
            className="mono"
            style={{
              padding: "9px 17px",
              border: "1px solid var(--border)",
              borderRadius: "5px",
              color: "var(--text-dim)",
            }}
          >
            ›
          </Link>
        )}
      </div>

      {inProgress ? (
        <div className="msg-warn">
          This week is still in progress. Scores are added once the week ends —
          check back on Monday.
        </div>
      ) : rows.length === 0 ? (
        <div className="msg-warn">No VS data logged for this week.</div>
      ) : (
        <>
          <div className="stat-row two" style={{ marginBottom: "12px" }}>
            <div className="card" style={{ "--bcolor": "#606aff" }}>
              <div className="mono" style={{ marginBottom: "8px" }}>
                Weekly total
              </div>
              <div
                className="mono"
                style={{ fontSize: "26px", color: "#606aff" }}
              >
                {weekTotal.toFixed(1)}m
              </div>
            </div>

            <div className="card" style={{ "--bcolor": "#30d4a0" }}>
              <div className="mono" style={{ marginBottom: "8px" }}>
                Average player score
              </div>
              <div
                className="mono"
                style={{ fontSize: "26px", color: "#30d4a0" }}
              >
                {average.toFixed(1)}m
              </div>
              <div className="mono" style={{ marginTop: "4px" }}>
                across {playerCount} players
              </div>
            </div>
          </div>

          <div className="section-label">Daily totals</div>

          <div className="panel scroll-x" style={{ marginBottom: "24px" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Alliance total</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d, i) => (
                  <tr key={d}>
                    <td>{DAY_LABELS[i]}</td>
                    <td className="num">
                      {eventDates.has(d)
                        ? `${dailyTotals.get(d).toFixed(1)}m`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-label">
            Players missing the {TARGET}m weekly target · {missing.length}
          </div>

          <div className="panel scroll-x" style={{ marginBottom: "24px" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">Week total</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {missing.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="mono">
                      Everyone hit the target
                    </td>
                  </tr>
                ) : (
                  missing.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="num">{p.total.toFixed(1)}m</td>
                      <td className="mono" style={{ color: "var(--warn)" }}>
                        {[
                          p.partial ? "Partial week" : null,
                          p.holiday ? "Holiday" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mrfox-sig">
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </>
  );
}
