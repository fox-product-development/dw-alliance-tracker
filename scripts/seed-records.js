require("dotenv").config({ path: ".env.local" });

const { Client } = require("pg");
const { rebuildRecords } = require("../lib/records");

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  // rebuildRecords takes a runner so it can use this script's own client
  // rather than the app's pool.
  const run = async (text, params) => {
    const result = await client.query(text, params);
    return result.rows;
  };

  try {
    await run(`
      CREATE TABLE IF NOT EXISTS records (
        key         TEXT NOT NULL,
        rank        INTEGER NOT NULL DEFAULT 1,
        value       NUMERIC NOT NULL,
        week_start  DATE NOT NULL,
        player_name TEXT,
        PRIMARY KEY (key, rank)
      )
    `);

    await run("BEGIN");
    const result = await rebuildRecords(run);
    await run("COMMIT");

    if (!result.alliance) {
      console.log("No VS data found. Nothing to seed.");
      return;
    }

    console.log(`Weeks found: ${result.weeks}`);
    console.log(
      `Alliance record: ${result.alliance.value.toFixed(1)}m, week of ${result.alliance.week}`,
    );
    console.log("Top player weeks:");
    result.players.forEach((p, i) => {
      console.log(
        `  ${i + 1}. ${p.value.toFixed(1)}m — ${p.name}, week of ${p.week}`,
      );
    });
  } catch (err) {
    await run("ROLLBACK");
    console.error("Seeding failed, nothing was changed.");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
