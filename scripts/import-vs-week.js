require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const CSV_PATH = path.join(__dirname, "5th-10thoct.csv");
const MEASURE = "vs";
const EVENT_TYPE = "vs";

// CSV name -> roster name, where they differ
const NAME_MAP = {
  Amjad: "-Amjad",
  Angel: "Angel≈",
  Boner: "Boon dingotti",
  "Break CL": "Breaker CL",
  Casagrande: "Casagrande2108",
  Diabo: "Lord El Diabo",
  ElfasTheBrave: "ElfastheWise",
  Jam: "-JAM-",
  LDR: "LuckysDadsRules",
  Luffy0: "Lufy0",
  maggie112: "mägggîe112",
  Preacher: "I Fade Away",
  Redtail: "Redtail62",
  S4schA22o3: "S4scha",
  Sarmed: "Sarmed The King",
  Venom: "Gucci Lucci",
  Zombielicious: "SumTingWong999",
  OGsteele: "OGSteele",
};

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

  return lines.map((line) => line.split(","));
}

// Headers are month-first with hyphens: MM-DD-YYYY
function parseDate(raw) {
  const match = String(raw)
    .trim()
    .match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
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

// Same normalising as the screenshot matcher: strip accents,
// remove anything not a letter or number, lowercase
function normalise(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = above;
    }
  }

  return prev[b.length];
}

function similarity(a, b) {
  const x = normalise(a);
  const y = normalise(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 0;
  return 1 - editDistance(x, y) / longest;
}

function closestMatch(name, candidates) {
  let best = null;
  for (const candidate of candidates) {
    const score = similarity(name, candidate);
    if (!best || score > best.score) best = { name: candidate, score };
  }
  return best;
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
    const playerRows = await client.query(
      "SELECT id, name, status FROM players",
    );

    const byName = new Map();
    const removedNames = new Set();
    for (const p of playerRows.rows) {
      if (p.status === "active") byName.set(p.name.trim(), p.id);
      else removedNames.add(p.name.trim());
    }

    const activeNames = [...byName.keys()];

    const missing = data.filter((d) => !byName.has(d.rosterName));

    if (missing.length > 0) {
      console.error(
        `These ${missing.length} names are not on the active roster:\n`,
      );
      for (const d of missing) {
        const looked =
          d.csvName === d.rosterName ? "" : ` (looked for "${d.rosterName}")`;

        if (removedNames.has(d.rosterName)) {
          console.error(`  ${d.csvName}${looked} -> matches a REMOVED player`);
          continue;
        }

        const best = closestMatch(d.rosterName, activeNames);
        const hint = best
          ? `closest: "${best.name}" (${best.score.toFixed(2)})`
          : "no roster names to compare";
        console.error(`  ${d.csvName}${looked} -> ${hint}`);
      }
      console.error(
        "\nNothing was written. Add the correct pairs to NAME_MAP and re-run.",
      );
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

    const notInFile = activeNames.filter(
      (n) => !data.some((d) => d.rosterName === n),
    );

    console.log(`Events created or updated: ${dates.length}`);
    console.log(
      `Date range: ${dates[0].iso} to ${dates[dates.length - 1].iso}`,
    );
    console.log(`Players in file: ${data.length}`);
    console.log(`Score rows written: ${written}`);

    if (notInFile.length > 0) {
      console.log(
        `\nOn the active roster but not in the file (no rows written):`,
      );
      notInFile.forEach((n) => console.log(`  ${n}`));
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Import failed, nothing was changed.");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
