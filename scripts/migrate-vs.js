require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const CSV_PATH = path.join(__dirname, "vs-data.csv");
const MEASURE = "vs";
const EVENT_TYPE = "vs";

// CSV name -> roster name, where they differ
const NAME_MAP = {
  Boner: "Boon dingotti",
  Diabo: "Lord El Diabo",
  LDR: "LuckyDadRules",
  Luffy0: "Lufy0",
};

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

  return lines.map((line) => line.split(","));
}

function parseDate(raw) {
  const match = String(raw)
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseValue(raw) {
  const text = String(raw).trim().toLowerCase();

  if (text === "") return 0;

  const match = text.match(/^(\d+(?:\.\d+)?)([mk]?)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === "k") return Math.round((amount / 1000) * 1000) / 1000;
  return amount;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found at ${CSV_PATH}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const header = rows[0];

  const dates = [];
  for (let i = 1; i < header.length; i++) {
    const iso = parseDate(header[i]);
    if (!iso) {
      console.error(`Column ${i} header is not a date: ${header[i]}`);
      process.exit(1);
    }
    dates.push({ index: i, iso });
  }

  const data = rows.slice(1).map((r) => ({
    csvName: r[0].trim(),
    rosterName: NAME_MAP[r[0].trim()] || r[0].trim(),
    values: r,
  }));

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const playerRows = await client.query("SELECT id, name FROM players");

    const byName = new Map();
    for (const p of playerRows.rows) byName.set(p.name.trim(), p.id);

    const missing = data
      .filter((d) => !byName.has(d.rosterName))
      .map((d) => `${d.csvName} (looked for "${d.rosterName}")`);

    if (missing.length > 0) {
      console.error("These names are not in the players table:");
      missing.forEach((n) => console.error(`  ${n}`));
      console.error("\nNothing was written. Fix the names and re-run.");
      process.exitCode = 1;
      return;
    }

    const badValues = [];
    for (const d of data) {
      for (const col of dates) {
        if (parseValue(d.values[col.index]) === null) {
          badValues.push(
            `${d.csvName} on ${col.iso}: "${d.values[col.index]}"`,
          );
        }
      }
    }

    if (badValues.length > 0) {
      console.error("These values could not be read:");
      badValues.forEach((v) => console.error(`  ${v}`));
      console.error("\nNothing was written. Fix the values and re-run.");
      process.exitCode = 1;
      return;
    }

    await client.query("BEGIN");

    let written = 0;

    for (const col of dates) {
      const eventRows = await client.query(
        `INSERT INTO events (event_type, event_date)
         VALUES ($1, $2)
         ON CONFLICT (event_type, event_date)
         DO UPDATE SET event_type = EXCLUDED.event_type
         RETURNING id`,
        [EVENT_TYPE, col.iso],
      );

      const eventId = eventRows.rows[0].id;

      for (const d of data) {
        const value = parseValue(d.values[col.index]);

        await client.query(
          `INSERT INTO scores (player_id, event_id, measure, value)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (player_id, event_id, measure)
           DO UPDATE SET value = EXCLUDED.value`,
          [byName.get(d.rosterName), eventId, MEASURE, value],
        );

        written += 1;
      }
    }

    await client.query("COMMIT");

    const notInFile = playerRows.rows
      .map((p) => p.name.trim())
      .filter((n) => !data.some((d) => d.rosterName === n));

    console.log(`Events created or updated: ${dates.length}`);
    console.log(
      `Date range: ${dates[0].iso} to ${dates[dates.length - 1].iso}`,
    );
    console.log(`Players in file: ${data.length}`);
    console.log(`Score rows written: ${written}`);

    if (notInFile.length > 0) {
      console.log(`\nOn the roster but not in the file (no rows written):`);
      notInFile.forEach((n) => console.log(`  ${n}`));
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, nothing was changed.");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
