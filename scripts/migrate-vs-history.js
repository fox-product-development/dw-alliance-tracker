require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MEASURE = "vs";
const EVENT_TYPE = "vs";

// Each file, with the date format used in its header row.
// 'us' = M/D/YYYY, 'uk' = D/M/YY
const FILES = [
  { name: "vsdatamayjune.csv", dateFormat: "us" },
  { name: "vsdatajunejuly.csv", dateFormat: "uk" },
  { name: "vsdatajulyaug.csv", dateFormat: "uk" },
];

// CSV name -> roster name, where they differ
const NAME_MAP = {
  Boner: "Boon dingotti",
  Diabo: "Lord El Diabo",
  LDR: "LuckysDadsRules",
  Luffy0: "Lufy0",
  Casagrande: "Casagrande2108",
  "Its Amjad": "-Amjad",
  "Twiggy-": "Twiggy",
  ryhjg: "Ryjhg",
};

// Players who have left. Their rows are skipped entirely.
const SKIP = ["El Amigo", "Jay Patil", "Meku81", "Meagann", "wandelnden"];

function parseCsv(text) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => l.split(","));
}

function parseDate(raw, format) {
  const parts = String(raw).trim().split("/");
  if (parts.length !== 3) return null;

  let day;
  let month;
  let year;

  if (format === "us") {
    month = Number(parts[0]);
    day = Number(parts[1]);
    year = Number(parts[2]);
  } else {
    day = Number(parts[0]);
    month = Number(parts[1]);
    year = Number(parts[2]);
  }

  if (year < 100) year += 2000;

  if (!day || !month || !year || month > 12 || day > 31) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Returns a number, or null meaning "write no row for this cell"
function parseValue(raw) {
  let text = String(raw).trim().toLowerCase();

  if (text === "") return null;

  // Three cells read "*got removed*" — treated as a scored zero
  if (text.includes("removed")) return 0;

  // Typos: comma used as a decimal point, stray full stops
  text = text
    .replace(",", ".")
    .replace(/\.(?=[a-z])/g, "")
    .replace("./", ".");

  const match = text.match(/^(\d+(?:\.\d+)?)([mk]?)$/);
  if (!match) return undefined;

  const amount = Number(match[1]);
  return match[2] === "k" ? amount / 1000 : amount;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const files = [];

  for (const spec of FILES) {
    const filePath = path.join(__dirname, spec.name);

    if (!fs.existsSync(filePath)) {
      console.error(`CSV not found at ${filePath}`);
      process.exit(1);
    }

    const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
    const header = rows[0];

    const dates = [];
    for (let i = 1; i < header.length; i++) {
      const iso = parseDate(header[i], spec.dateFormat);
      if (!iso) {
        console.error(`${spec.name}: column ${i} is not a date: ${header[i]}`);
        process.exit(1);
      }
      dates.push({ index: i, iso });
    }

    const data = rows
      .slice(1)
      .filter((r) => r[0] && r[0].trim() !== "")
      .map((r) => ({
        csvName: r[0].trim(),
        rosterName: NAME_MAP[r[0].trim()] || r[0].trim(),
        cells: r,
      }))
      .filter((d) => !SKIP.includes(d.csvName));

    files.push({ ...spec, dates, data });
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const playerRows = await client.query("SELECT id, name FROM players");

    const byName = new Map();
    for (const p of playerRows.rows) byName.set(p.name.trim(), p.id);

    const missing = [];
    const badValues = [];

    for (const file of files) {
      for (const d of file.data) {
        if (!byName.has(d.rosterName)) {
          missing.push(
            `${file.name}: ${d.csvName} (looked for "${d.rosterName}")`,
          );
        }
        for (const col of file.dates) {
          if (parseValue(d.cells[col.index]) === undefined) {
            badValues.push(
              `${file.name}: ${d.csvName} on ${col.iso} = "${d.cells[col.index]}"`,
            );
          }
        }
      }
    }

    if (missing.length > 0 || badValues.length > 0) {
      if (missing.length > 0) {
        console.error("Names not found in the players table:");
        missing.forEach((m) => console.error(`  ${m}`));
      }
      if (badValues.length > 0) {
        console.error("\nValues that could not be read:");
        badValues.forEach((v) => console.error(`  ${v}`));
      }
      console.error("\nNothing was written.");
      process.exitCode = 1;
      return;
    }

    await client.query("BEGIN");

    let written = 0;
    let skipped = 0;
    let eventCount = 0;

    for (const file of files) {
      for (const col of file.dates) {
        const eventRows = await client.query(
          `INSERT INTO events (event_type, event_date)
           VALUES ($1, $2)
           ON CONFLICT (event_type, event_date)
           DO UPDATE SET event_type = EXCLUDED.event_type
           RETURNING id`,
          [EVENT_TYPE, col.iso],
        );

        const eventId = eventRows.rows[0].id;
        eventCount += 1;

        for (const d of file.data) {
          const value = parseValue(d.cells[col.index]);

          if (value === null) {
            skipped += 1;
            continue;
          }

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
    }

    await client.query("COMMIT");

    console.log(`Files processed:    ${files.length}`);
    console.log(`Events created:     ${eventCount}`);
    console.log(`Score rows written: ${written}`);
    console.log(`Blanks skipped:     ${skipped}`);

    for (const file of files) {
      console.log(
        `\n${file.name}: ${file.dates[0].iso} to ${
          file.dates[file.dates.length - 1].iso
        }, ${file.data.length} players`,
      );
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
