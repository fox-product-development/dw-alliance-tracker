const { query } = require("./db");

const TOP_N = 3;

// Monday of the week containing the given date, in UTC.
function mondayOf(d) {
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const shift = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - shift);
  return monday;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Rebuilds both records from every VS row. Cheap enough to run after any
// VS write, which means days can arrive in any order through any path
// without the records going stale.
async function rebuildRecords(run) {
  const exec = run || query;

  const rows = await exec(
    `SELECT p.name, s.value, e.event_date::text AS event_date
     FROM scores s
     JOIN events e ON e.id = s.event_id
     JOIN players p ON p.id = s.player_id
     WHERE s.measure = 'vs'`,
  );

  if (rows.length === 0) {
    return { alliance: null, players: [], weeks: 0 };
  }

  const alliance = new Map();
  const perPlayer = new Map();

  for (const row of rows) {
    const week = isoDate(mondayOf(new Date(`${row.event_date}T00:00:00Z`)));
    const value = Number(row.value);

    alliance.set(week, (alliance.get(week) || 0) + value);

    const key = `${week}|${row.name}`;
    perPlayer.set(key, (perPlayer.get(key) || 0) + value);
  }

  let bestAlliance = { week: null, value: -1 };
  for (const [week, value] of alliance) {
    if (value > bestAlliance.value) bestAlliance = { week, value };
  }

  // Top player-weeks, not top players: the same person can hold more than
  // one slot if they had more than one outstanding week.
  const topPlayers = Array.from(perPlayer.entries())
    .map(([key, value]) => {
      const [week, name] = key.split("|");
      return { week, name, value };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N);

  await exec("DELETE FROM records");

  await exec(
    `INSERT INTO records (key, rank, value, week_start, player_name)
     VALUES ('alliance_week', 1, $1, $2, NULL)`,
    [bestAlliance.value, bestAlliance.week],
  );

  for (let i = 0; i < topPlayers.length; i++) {
    const p = topPlayers[i];
    await exec(
      `INSERT INTO records (key, rank, value, week_start, player_name)
       VALUES ('player_week', $1, $2, $3, $4)`,
      [i + 1, p.value, p.week, p.name],
    );
  }

  return {
    alliance: bestAlliance,
    players: topPlayers,
    weeks: alliance.size,
  };
}

module.exports = { rebuildRecords, mondayOf, isoDate };
