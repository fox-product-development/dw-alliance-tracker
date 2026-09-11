import Link from "next/link";
import { query } from "../lib/db";

export const dynamic = "force-dynamic";

const TYPE_LABELS = {
  vs: "VS",
  poll: "Poll",
  frankie: "Frankie",
  zombies: "Zombies",
  war: "War Event",
  contribution: "Contribution",
};

function windowBounds(weeks) {
  const now = new Date();
  const day = now.getUTCDay();
  const sinceMonday = day === 0 ? 6 : day - 1;

  const thisMonday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  thisMonday.setUTCDate(thisMonday.getUTCDate() - sinceMonday);

  const start = new Date(thisMonday);
  start.setUTCDate(start.getUTCDate() - weeks * 7);

  const end = new Date(thisMonday);
  end.setUTCDate(end.getUTCDate() - 1);

  const lastWeekStart = new Date(thisMonday);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    lastWeekStart: lastWeekStart.toISOString().slice(0, 10),
    lastWeekEnd: end.toISOString().slice(0, 10),
  };
}

function formatDate(d) {
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
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: "var(--text-dim)",
  marginBottom: "8px",
};

const WEEKLY = ["vs", "war", "contribution"];

export default async function Home() {
  const { start, end, lastWeekStart, lastWeekEnd } = windowBounds(4);

  let playerCount = 0;
  let lastEvent = null;
  const stats = {};
  const lastWeek = {};
  const mostRecent = {};
  let error = null;

  try {
    const counts = await query("SELECT COUNT(*)::int AS count FROM players");
    playerCount = counts[0].count;

    const recent = await query(
      `SELECT e.id, e.event_type, e.event_date,
              COUNT(*) FILTER (WHERE s.value > 0)::int AS participants
       FROM events e
       LEFT JOIN scores s ON s.event_id = e.id AND s.measure = e.event_type
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
       WHERE e.event_date >= $1 AND e.event_date <= $2
       GROUP BY s.measure`,
      [start, end],
    );

    for (const r of rows) {
      stats[r.measure] = {
        events: r.events,
        total: Number(r.total),
        positives: r.positives,
      };
    }

    const weekRows = await query(
      `SELECT s.measure,
              COUNT(DISTINCT e.id)::int AS events,
              SUM(s.value) AS total,
              COUNT(*) FILTER (WHERE s.value > 0)::int AS positives
       FROM scores s
       JOIN events e ON e.id = s.event_id
       WHERE e.event_date >= $1 AND e.event_date <= $2
       GROUP BY s.measure`,
      [lastWeekStart, lastWeekEnd],
    );

    for (const r of weekRows) {
      lastWeek[r.measure] = {
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
       WHERE e.event_date >= $1 AND e.event_date <= $2
       ORDER BY s.measure, e.event_date DESC`,
      [start, end],
    );

    for (const r of recentRows) {
      mostRecent[r.measure] = {
        date: r.event_date,
        total: Number(r.total),
        positives: r.positives,
      };
    }
  } catch (err) {
    error = err.message;
  }

  function buildCard(measure, label, colour, kind) {
    const s = stats[measure];

    if (!s || s.events === 0) {
      return { label, colour, empty: true };
    }

    const isValue = kind === "value";

    const average = isValue
      ? (s.total / s.events / playerCount).toFixed(1)
      : String(Math.round(s.positives / s.events));

    const averageSuffix = isValue
      ? "per player per week"
      : `of ${playerCount} per event`;

    let lowerValue = null;
    let lowerLabel = null;
    let lowerSuffix = null;

    if (WEEKLY.includes(measure)) {
      const w = lastWeek[measure];
      lowerLabel = "Last week";

      if (w && w.events > 0) {
        lowerValue = isValue
          ? (w.total / w.events / playerCount).toFixed(1)
          : String(Math.round(w.positives / w.events));
        lowerSuffix = isValue ? "per player" : `of ${playerCount}`;
      }
    } else {
      const r = mostRecent[measure];
      lowerLabel = "Most recent";

      if (r) {
        lowerValue = String(r.positives);
        lowerSuffix = `of ${playerCount} · ${formatDate(r.date)}`;
      }
    }

    return {
      label,
      colour,
      average,
      averageSuffix,
      lowerLabel,
      lowerValue,
      lowerSuffix,
    };
  }

  const topRow = [
    buildCard("vs", "VS score", "#60c0ff", "value"),
    buildCard("war", "War attendance", "#ffd060", "attendance"),
  ];

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
                {formatDate(lastEvent.event_date)} · {lastEvent.participants}{" "}
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

      <div className="section-label">Four week averages</div>

      <div className="stat-row two">
        {topRow.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
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

function StatCard({
  label,
  colour,
  empty,
  average,
  averageSuffix,
  lowerLabel,
  lowerValue,
  lowerSuffix,
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
            No data in last 4 weeks
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
            style={{ marginTop: "4px", letterSpacing: "1px" }}
          >
            {averageSuffix}
          </div>

          <div
            style={{
              marginTop: "14px",
              paddingTop: "12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div style={{ ...statLabel, marginBottom: "6px" }}>
              {lowerLabel}
            </div>

            {lowerValue === null ? (
              <div
                className="mono"
                style={{ letterSpacing: "1px", lineHeight: 1.5 }}
              >
                No data present
                <br />
                for last week
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
                  style={{ marginTop: "4px", letterSpacing: "1px" }}
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
