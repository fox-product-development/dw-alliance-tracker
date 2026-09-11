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

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
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
  color: "var(--accent3)",
  textShadow: "0 0 10px rgba(48,212,160,0.4)",
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

export default async function Home() {
  const { start, end } = windowBounds(4);

  let playerCount = 0;
  let lastEvent = null;
  const stats = {};
  const latest = {};
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

    const latestRows = await query(
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

    for (const r of latestRows) {
      latest[r.measure] = {
        date: r.event_date,
        total: Number(r.total),
        positives: r.positives,
      };
    }
  } catch (err) {
    error = err.message;
  }

  function attendanceCard(measure, label, colour) {
    const s = stats[measure];
    const l = latest[measure];

    if (!s || s.events === 0) {
      return { label, colour, empty: true };
    }

    return {
      label,
      colour,
      value: String(Math.round(s.positives / s.events)),
      suffix: `of ${playerCount} per event`,
      last: l ? `Last ${formatDate(l.date)} · ${l.positives}` : null,
    };
  }

  function valueCard(measure, label, colour) {
    const s = stats[measure];
    const l = latest[measure];

    if (!s || s.events === 0 || playerCount === 0) {
      return { label, colour, empty: true };
    }

    const avg = s.total / s.events / playerCount;
    const lastAvg = l ? l.total / playerCount : null;

    return {
      label,
      colour,
      value: avg.toFixed(1),
      suffix: "per player per week",
      last:
        lastAvg !== null
          ? `Last ${formatDate(l.date)} · ${lastAvg.toFixed(1)}`
          : null,
    };
  }

  const cards = [
    valueCard("vs", "VS score", "#60c0ff"),
    attendanceCard("frankie", "Frankie attendance", "#ff7060"),
    attendanceCard("zombies", "Zombies attendance", "#80ff90"),
    attendanceCard("war", "War attendance", "#ffd060"),
    valueCard("contribution", "Contribution", "#c080ff"),
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "12px",
          marginBottom: "28px",
        }}
      >
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
          <div style={statValue}>{playerCount}</div>
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
              <div
                style={{
                  ...statValue,
                  color: "var(--accent)",
                  textShadow: "0 0 10px rgba(232,160,32,0.4)",
                }}
              >
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
              <div
                style={{
                  ...statValue,
                  color: "var(--text-dim)",
                  textShadow: "none",
                }}
              >
                —
              </div>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
        }}
      >
        {cards.map((c) => (
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

function StatCard({ label, value, suffix, last, colour, empty }) {
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
          <div
            style={{
              ...statValue,
              color: "var(--text-dim)",
              textShadow: "none",
            }}
          >
            —
          </div>
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
            {value}
          </div>
          <div
            className="mono"
            style={{ marginTop: "4px", letterSpacing: "1px" }}
          >
            {suffix}
          </div>
          {last && (
            <div
              style={{
                marginTop: "10px",
                paddingTop: "8px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <span className="mono" style={{ letterSpacing: "1px" }}>
                {last}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
