import Link from "next/link";
import { query } from "../../lib/db";
import { windowBounds, iso, pretty } from "../../lib/window";

export const dynamic = "force-dynamic";

const PRESETS = [28, 56, 84];

function convertVs(avg, settings) {
  const floor = settings.vs_floor;
  const cap = settings.vs_cap;
  const exp = settings.vs_curve_exponent;

  if (avg >= floor) {
    return 0.5 + (0.5 * (Math.min(avg, cap) - floor)) / (cap - floor);
  }
  return 0.5 * Math.pow(avg / floor, exp);
}

function convert(measure, values, settings) {
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;

  if (measure === "vs") return convertVs(avg, settings);
  if (measure === "contribution")
    return Math.min(avg, settings.contribution_cap) / settings.contribution_cap;
  if (measure === "car_cp") return Math.max(0, 1 - (avg - 1) * 0.16);
  return avg;
}

function bandColour(score) {
  if (score >= 9) return "#80ff90";
  if (score >= 7) return "#30d4a0";
  if (score >= 5) return "#ffd060";
  if (score >= 3) return "#ff9060";
  return "#ff7060";
}

const WEIGHT_KEYS = {
  vs: "weight_vs",
  poll_response: "weight_poll",
  frankie: "weight_frankie",
  zombies: "weight_zombies",
  war: "weight_war",
  car_cp: "weight_car_cp",
  contribution: "weight_contribution",
};

export default async function RankingsPage({ searchParams }) {
  const params = await searchParams;
  const days = PRESETS.includes(Number(params?.days))
    ? Number(params.days)
    : 28;

  const { start, end } = windowBounds(days);

  const settingRows = await query("SELECT key, value FROM settings");
  const settings = {};
  for (const r of settingRows) settings[r.key] = Number(r.value);

  const players = await query("SELECT id, name FROM players ORDER BY name ASC");

  const rows = await query(
    `SELECT s.player_id, s.measure, s.value
     FROM scores s
     JOIN events e ON e.id = s.event_id
     WHERE e.event_date >= $1 AND e.event_date <= $2`,
    [iso(start), iso(end)],
  );

  const byPlayer = new Map();
  for (const r of rows) {
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, {});
    const m = byPlayer.get(r.player_id);
    if (!m[r.measure]) m[r.measure] = [];
    m[r.measure].push(Number(r.value));
  }

  const ranked = players.map((p) => {
    const measures = byPlayer.get(p.id);

    if (!measures || Object.keys(measures).length === 0) {
      return { ...p, score: null, detail: {} };
    }

    let weighted = 0;
    let activeWeight = 0;
    const detail = {};

    for (const [measure, values] of Object.entries(measures)) {
      const weight = settings[WEIGHT_KEYS[measure]];
      if (!weight) continue;

      weighted += convert(measure, values, settings) * weight;
      activeWeight += weight;

      const sum = values.reduce((a, b) => a + b, 0);
      detail[measure] = { avg: sum / values.length, count: values.length };
    }

    const score = activeWeight > 0 ? (weighted / activeWeight) * 10 : null;
    return { ...p, score, detail };
  });

  ranked.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });

  const scored = ranked.filter((p) => p.score !== null);
  const average =
    scored.length > 0
      ? scored.reduce((s, p) => s + p.score, 0) / scored.length
      : null;

  function rate(d) {
    if (!d) return "—";
    return `${Math.round(d.avg * d.count)}/${d.count}`;
  }

  return (
    <>
      <div className="page-title">Rankings</div>
      <div className="page-sub">
        {pretty(start)} — {pretty(end)}
        {average !== null && ` · alliance average ${average.toFixed(1)}`}
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
        {PRESETS.map((d) => (
          <Link
            key={d}
            href={`/rankings?days=${d}`}
            className="mono"
            style={{
              padding: "8px 16px",
              borderRadius: "5px",
              border:
                d === days
                  ? "1px solid rgba(232,160,32,0.35)"
                  : "1px solid var(--border)",
              background:
                d === days ? "rgba(232,160,32,0.1)" : "rgba(96,112,160,0.05)",
              color: d === days ? "var(--accent)" : "var(--text-dim)",
            }}
          >
            {d} days
          </Link>
        ))}
      </div>

      <div className="panel scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th className="lock-1">#</th>
              <th className="lock-2">Player</th>
              <th className="num">VS avg</th>
              <th className="num">Poll</th>
              <th className="num">Frankie</th>
              <th className="num">Zombies</th>
              <th className="num">War</th>
              <th className="num">Car</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => (
              <tr key={p.id}>
                <td
                  className="lock-1 num dim"
                  style={{ textAlign: "left", paddingRight: 0 }}
                >
                  {p.score === null ? "" : i + 1}
                </td>
                <td className="lock-2">{p.name}</td>

                {p.score === null ? (
                  <td
                    colSpan={7}
                    className="mono"
                    style={{ textAlign: "right" }}
                  >
                    No records
                  </td>
                ) : (
                  <>
                    <td className="num">
                      {p.detail.vs ? p.detail.vs.avg.toFixed(1) : "—"}
                    </td>
                    <td className="num">{rate(p.detail.poll_response)}</td>
                    <td className="num">{rate(p.detail.frankie)}</td>
                    <td className="num">{rate(p.detail.zombies)}</td>
                    <td className="num">{rate(p.detail.war)}</td>
                    <td className="num">
                      {p.detail.car_cp ? p.detail.car_cp.avg.toFixed(1) : "—"}
                    </td>
                    <td
                      className="num"
                      style={{
                        fontWeight: 700,
                        fontSize: "16px",
                        color: bandColour(p.score),
                        textShadow: `0 0 10px ${bandColour(p.score)}55`,
                      }}
                    >
                      {p.score.toFixed(1)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mrfox-sig">
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </>
  );
}
