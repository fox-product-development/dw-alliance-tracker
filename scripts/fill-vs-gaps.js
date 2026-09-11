require("dotenv").config({ path: ".env.local" });

const { Client } = require("pg");

const GAPS = [
  {
    name: "beebutterfly",
    dates: ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"],
  },
  {
    name: "Issa0313",
    dates: [
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ],
  },
  { name: "PurpleCat10", dates: ["2026-07-10"] },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    let written = 0;

    for (const gap of GAPS) {
      const result = await client.query(
        `INSERT INTO scores (player_id, event_id, measure, value)
         SELECT p.id, e.id, 'vs', 0
         FROM players p
         JOIN events e ON e.event_type = 'vs'
         WHERE p.name = $1
           AND e.event_date = ANY($2::date[])
         ON CONFLICT (player_id, event_id, measure) DO NOTHING`,
        [gap.name, gap.dates],
      );

      console.log(
        `${gap.name}: ${result.rowCount} of ${gap.dates.length} inserted`,
      );
      written += result.rowCount;
    }

    await client.query("COMMIT");
    console.log(`\nTotal inserted: ${written} (expected 11)`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed, nothing was changed.");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
