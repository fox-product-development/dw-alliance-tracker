require("dotenv").config({ path: ".env.local" });

const { Client } = require("pg");

const RETENTION_DAYS = 14;

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const due = await client.query(
      `SELECT id, name, status_date
       FROM players
       WHERE status = 'removed'
         AND status_date < CURRENT_DATE - $1::int`,
      [RETENTION_DAYS],
    );

    if (due.rows.length === 0) {
      console.log(`${new Date().toISOString()} — nothing to purge`);
      return;
    }

    await client.query("BEGIN");

    const ids = due.rows.map((r) => r.id);

    const scores = await client.query(
      "DELETE FROM scores WHERE player_id = ANY($1::int[])",
      [ids],
    );

    await client.query("DELETE FROM players WHERE id = ANY($1::int[])", [ids]);

    await client.query("COMMIT");

    console.log(
      `${new Date().toISOString()} — purged ${due.rows.length} player(s)`,
    );
    for (const r of due.rows) {
      console.log(
        `  ${r.name} (removed ${r.status_date.toISOString().slice(0, 10)})`,
      );
    }
    console.log(`  ${scores.rowCount} score rows deleted`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Purge failed, nothing was changed.");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
