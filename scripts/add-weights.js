require("dotenv").config({ path: ".env.local" });

const { Client } = require("pg");

const NEW_SETTINGS = [
  { key: "weight_black_gold", value: 0 },
  { key: "weight_kill_event", value: 0 },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const setting of NEW_SETTINGS) {
      const result = await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [setting.key, setting.value],
      );

      console.log(
        `${setting.key}: ${result.rowCount === 1 ? "added" : "already present"}`,
      );
    }
  } catch (err) {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
