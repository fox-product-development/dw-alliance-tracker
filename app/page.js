import Link from "next/link";
import { query } from "../lib/db";
import { windowBounds, iso } from "../lib/window";

export const dynamic = "force-dynamic";

const TYPE_LABELS = {
  frankie: "Frankie",
  zombies: "Zombies",
  war: "War Event",
};

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatShort(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

const card = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "16px",
  position: "relative",
  overflow: "hidden",
};

const statValue = {
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: "26px",
  fontWeight: 700,
  lineHeight: 1.2,
};

const statLabel = {
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: "11px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: "var(--text-dim)",
  marginBottom: "8px",
};

function Sparkline({ points, colour }) {
  if (!points || points.length < 2) return null;

  const width = 100;
  const height = 28;
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.value - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: "48px", display: "block" }}
      role="img"
      aria-label={`VS trend across ${points.length} days`}
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={colour}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default async function Home() {
  const { start, end } = windowBounds(28);

  let playerCount = 0;
  let lastEvent = null;
  const stats = {};
  const lastSeven = {};
  const mostRecent = {};
  let vsTrend = [];
  let bgb = null;
  let error = null;

  try {
    const counts = await query(
      "SELECT COUNT(*)::int AS count FROM players WHERE status = 'active'",
    );
    playerCount = counts[0].count;

    const recent = await query(
      `SELECT e.id, e.event_type, e.event_date,
              COUNT(*) FILTER (WHERE s.value > 0)::int AS participants
       FROM events e
       LEFT JOIN scores s ON s.event_id = e.id AND s.measure = e.event_type
       WHERE e.event_type IN ('frankie', 'zombies', 'war')
       GROUP BY e.id
       ORDER BY e.event_date DESC, e.id DESC
       LIMIT 1`,
    );
    lastEvent = recent[0] || null;

    const rows = await query(
      `SELECT s.measure,
              COUNT(DISTINCT e.id)::int AS events,
              SUM(s.value) AS total,
              COUNT(*) FILTER (WHERE s.value > 0)::int AS positives
       FROM scores s
       JOIN events e ON e.id = s.event_id
       JOIN players p ON p.id = s.player_id AND p.status = 'active'
       WHERE e.event_date >= $1 AND e.event_date <= $2
       GROUP BY s.measure`,
      [iso(start), iso(end)],
    );

    for (const r of rows) {
      stats[r.measure] = {
        events: r.events,
        total: Number(r.total),
        positives: r.positives,
      };
    }

    const sevenRows = await query(
      `WITH last_dates AS (
         SELECT s.measure, MAX(e.event_date) AS last_date
         FROM scores s
         JOIN events e ON e.id = s.event_id
         WHERE e.event_date >= $1 AND e.event_date <= $2
         GROUP BY s.measure
       )
       SELECT s.measure, ld.last_date,
              COUNT(DISTINCT e.id)::int AS events,
              SUM(s.value) AS total,
              COUNT(*) FILTER (WHERE s.value > 0)::int AS positives
       FROM scores s
       JOIN events e ON e.id = s.event_id
       JOIN players p ON p.id = s.player_id AND p.status = 'active'
       JOIN last_dates ld ON ld.measure = s.measure
       WHERE e.event_date > ld.last_date - 7
         AND e.event_date <= ld.last_date
       GROUP BY s.measure, ld.last_date`,
      [iso(start), iso(end)],
    );

    for (const r of sevenRows) {
      lastSeven[r.measure] = {
        lastDate: r.last_date,
        events: r.events,
        total: Number(r.total),
        positives: r.positives,
      };
    }

    const recentRows = await query(
      `SELECT DISTINCT ON (s.measure)
              s.measure, e.event_date,
              SUM(s.value) OVER (PARTITION BY s.event_id, s.measure) AS total,
              COUNT(*) FILTER (WHERE s.value > 0)
                OVER (PARTITION BY s.event_id, s.measure)::int AS positives
       FROM scores s
       JOIN events e ON e.id = s.event_id
       JOIN players p ON p.id = s.player_id AND p.status = 'active'
       WHERE e.event_date >= $1 AND e.event_date <= $2
       ORDER BY s.measure, e.event_date DESC`,
      [iso(start), iso(end)],
    );

    for (const r of recentRows) {
      mostRecent[r.measure] = {
        date: r.event_date,
        total: Number(r.total),
        positives: r.positives,
      };
    }

    const trendRows = await query(
      `SELECT e.event_date, SUM(s.value) AS total
       FROM scores s
       JOIN events e ON e.id = s.event_id
       JOIN players p ON p.id = s.player_id AND p.status = 'active'
       WHERE s.measure = 'vs'
         AND e.event_date >= $1 AND e.event_date <= $2
       GROUP BY e.event_date
       ORDER BY e.event_date ASC`,
      [iso(start), iso(end)],
    );

    vsTrend = trendRows.map((r) => ({
      date: r.event_date,
      value: playerCount > 0 ? Number(r.total) / playerCount : 0,
    }));

    const bgbRows = await query(
      `SELECT e.event_date, s.reason, COUNT(*)::int AS count
       FROM scores s
       JOIN events e ON e.id = s.event_id
       JOIN players p ON p.id = s.player_id AND p.status = 'active'
       WHERE s.measure = 'black_gold'
         AND e.event_date = (
           SELECT MAX(e2.event_date) FROM events e2
           WHERE e2.event_type = 'black_gold'
         )
       GROUP BY e.event_date, s.reason`,
      [],
    );

    if (bgbRows.length > 0) {
      const breakdown = {};
      for (const r of bgbRows) breakdown[r.reason || "no_response"] = r.count;
      bgb = { date: bgbRows[0].event_date, breakdown };
    }
  } catch (err) {
    error = err.message;
  }

  function buildCard(measure, label, colour, kind) {
    const s = stats[measure];

    if (!s || s.events === 0) return { label, colour, empty: true };

    const isValue = kind === "value";

    let average;
    let averageSuffix;

    if (measure === "vs") {
      average = (s.total / playerCount / 4).toFixed(1);
      averageSuffix = "average weekly score over 4 weeks";
    } else if (isValue) {
      average = (s.total / s.events / playerCount).toFixed(1);
      averageSuffix = "average weekly score over 4 weeks";
    } else {
      average = String(Math.round(s.positives / s.events));
      averageSuffix = `of ${playerCount} per event, over 4 weeks`;
    }

    let lowerValue = null;
    let lowerSuffix = null;

    if (["vs", "war", "contribution", "kill_event"].includes(measure)) {
      const w = lastSeven[measure];

      if (w && w.events > 0) {
        lowerValue = isValue
          ? (w.total / playerCount).toFixed(1)
          : String(Math.round(w.positives / w.events));
        lowerSuffix = `average for last 7 days from ${formatDate(w.lastDate)}`;
      }
    } else {
      const r = mostRecent[measure];

      if (r) {
        lowerValue = String(r.positives);
        lowerSuffix = `of ${playerCount} on ${formatShort(r.date)}`;
      }
    }

    return { label, colour, average, averageSuffix, lowerValue, lowerSuffix };
  }

  const vsCard = buildCard("vs", "VS score", "#606aff", "value");
  const warCard = buildCard("war", "War attendance", "#f02906", "attendance");
  const shieldCard = buildCard(
    "kill_event",
    "Kill Event shields",
    "#ff9060",
    "attendance",
  );

  const bottomRow = [
    buildCard("frankie", "Frankie attendance", "#ff7060", "attendance"),
    buildCard("zombies", "Zombies attendance", "#80ff90", "attendance"),
    buildCard("contribution", "Contribution", "#c080ff", "value"),
  ];

  return (
    <>
      <header
        style={{
          textAlign: "center",
          padding: "32px 0 20px",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: "32px", right: 0 }}>
          <Link
            href="/settings"
            className="mono"
            style={{ color: "var(--text-dim)" }}
          >
            ⚙ Settings
          </Link>
        </div>
        <div className="game-title">
          DW <span>ALLIANCE</span>
        </div>
        <div className="subtitle">Participation Tracker</div>
        <div
          style={{
            height: "1px",
            background:
              "linear-gradient(90deg, transparent, var(--border-glow), var(--accent), var(--border-glow), transparent)",
            marginTop: "20px",
            opacity: 0.5,
          }}
        />
      </header>

      {error && <div className="msg-err">Database error: {error}</div>}

      <div className="section-label">Overview</div>

      <div className="stat-row two" style={{ marginBottom: "28px" }}>
        <div style={card}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "2px",
              background: "var(--accent3)",
              opacity: 0.85,
            }}
          />
          <div style={statLabel}>Roster</div>
          <div style={{ ...statValue, color: "var(--accent3)" }}>
            {playerCount}
          </div>
          <div
            className="mono"
            style={{ marginTop: "4px", letterSpacing: "1px" }}
          >
            players tracked
          </div>
          <div
            style={{
              marginTop: "14px",
              paddingTop: "10px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <Link
              href="/players"
              className="mono"
              style={{ color: "var(--accent3)", letterSpacing: "2px" }}
            >
              Roster management →
            </Link>
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "2px",
              background: "var(--accent)",
              opacity: 0.85,
            }}
          />
          <div style={statLabel}>Last event</div>
          {lastEvent ? (
            <>
              <div style={{ ...statValue, color: "var(--accent)" }}>
                {TYPE_LABELS[lastEvent.event_type] || lastEvent.event_type}
              </div>
              <div
                className="mono"
                style={{ marginTop: "4px", letterSpacing: "1px" }}
              >
                {formatShort(lastEvent.event_date)} · {lastEvent.participants}{" "}
                participants
              </div>
            </>
          ) : (
            <>
              <div style={{ ...statValue, color: "var(--text-dim)" }}>—</div>
              <div
                className="mono"
                style={{ marginTop: "4px", letterSpacing: "1px" }}
              >
                nothing logged yet
              </div>
            </>
          )}
          <div
            style={{
              marginTop: "14px",
              paddingTop: "10px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: "16px",
            }}
          >
            <Link
              href="/log"
              className="mono"
              style={{ color: "var(--accent)", letterSpacing: "2px" }}
            >
              Manual entry →
            </Link>
            <Link
              href="/upload"
              className="mono"
              style={{ color: "var(--accent)", letterSpacing: "2px" }}
            >
              Image entry →
            </Link>
          </div>
        </div>
      </div>

      <div className="section-label">Last 28 days</div>

      <div style={{ marginBottom: "12px" }}>
        <Link href="/league" className="card-link">
          <StatCard {...vsCard} trend={vsTrend} />
        </Link>
      </div>

      <div className="stat-row two">
        <StatCard {...warCard} />
        <StatCard {...shieldCard} />
      </div>

      <div style={{ marginBottom: "12px" }}>
        <BgbCard data={bgb} playerCount={playerCount} />
      </div>

      <div className="stat-row three">
        {bottomRow.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <p style={{ marginTop: "24px", textAlign: "center" }}>
        <Link
          href="/rankings"
          className="mono"
          style={{ color: "var(--accent3)", letterSpacing: "3px" }}
        >
          View full rankings →
        </Link>
      </p>

      <div className="mrfox-sig">
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </>
  );
}

function BgbCard({ data, playerCount }) {
  const colour = "#e6b515";

  const items = [
    { key: "accept", label: "accepted" },
    { key: "decline", label: "declined" },
    { key: "no_show", label: "no show" },
    { key: "no_response", label: "no response" },
  ];

  return (
    <div style={card}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: colour,
          opacity: 0.85,
        }}
      />
      <div style={statLabel}>Black Gold Battlefield</div>

      {!data ? (
        <>
          <div style={{ ...statValue, color: "var(--text-dim)" }}>—</div>
          <div
            className="mono"
            style={{ marginTop: "4px", letterSpacing: "1px" }}
          >
            no events logged yet
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "12px",
              marginTop: "4px",
            }}
          >
            {items.map((item) => (
              <div key={item.key}>
                <div
                  style={{
                    ...statValue,
                    color: colour,
                    textShadow: `0 0 10px ${colour}44`,
                  }}
                >
                  {data.breakdown[item.key] || 0}
                </div>
                <div
                  className="mono"
                  style={{ marginTop: "2px", letterSpacing: "1px" }}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "14px",
              paddingTop: "10px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <span className="mono" style={{ letterSpacing: "1px" }}>
              last event {formatShort(data.date)} · {playerCount} on roster
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  colour,
  empty,
  average,
  averageSuffix,
  lowerValue,
  lowerSuffix,
  trend,
}) {
  return (
    <div style={card}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: colour,
          opacity: 0.85,
        }}
      />
      <div style={statLabel}>{label}</div>

      {empty ? (
        <>
          <div style={{ ...statValue, color: "var(--text-dim)" }}>—</div>
          <div
            className="mono"
            style={{ marginTop: "4px", letterSpacing: "1px", lineHeight: 1.5 }}
          >
            No data in last 28 days
            <br />
            please upload
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              ...statValue,
              color: colour,
              textShadow: `0 0 10px ${colour}44`,
            }}
          >
            {average}
          </div>
          <div
            className="mono"
            style={{ marginTop: "4px", letterSpacing: "1px", lineHeight: 1.5 }}
          >
            {averageSuffix}
          </div>

          {trend && trend.length > 1 && (
            <div style={{ marginTop: "14px" }}>
              <Sparkline points={trend} colour={colour} />
              <div
                className="mono"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "4px",
                  letterSpacing: "1px",
                }}
              >
                <span>{formatShort(trend[0].date)}</span>
                <span>{trend.length} days</span>
                <span>{formatShort(trend[trend.length - 1].date)}</span>
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: "14px",
              paddingTop: "12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            {lowerValue === null ? (
              <div className="mono" style={{ letterSpacing: "1px" }}>
                No recent data
              </div>
            ) : (
              <>
                <div
                  style={{
                    ...statValue,
                    color: colour,
                    textShadow: `0 0 10px ${colour}44`,
                  }}
                >
                  {lowerValue}
                </div>
                <div
                  className="mono"
                  style={{
                    marginTop: "4px",
                    letterSpacing: "1px",
                    lineHeight: 1.5,
                  }}
                >
                  {lowerSuffix}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
