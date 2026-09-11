require("dotenv").config({ path: ".env.local" });

const { Client } = require("pg");

const EVENT_TYPE = "frankie";
const EVENT_DATE = "2026-08-31";

const ATTENDANCE = {
  Plumpkin364: 1,
  Vorth: 1,
  S4schA22o3: 1,
  Thomas74: 1,
  LadyK: 1,
  Momo: 1,
  "-Amjad": 1,
  LuckysDadsRules: 1,
  Fox: 1,
  "Boon dingotti": 1,
  "Lord El Diabo": 1,
  OGsteele: 1,
  Zilvays: 1,
  Shuvani: 0,
  Mirasol: 1,
  Venom: 1,
  meemee: 0,
  Ahmed: 1,
  Otylka: 1,
  Supermikepun: 1,
  Marwan: 1,
  ddz123: 1,
  "Jenny Dingotti": 0,
  Ryjhg: 1,
  Oranit: 1,
  Deb83: 1,
  Ozz1234: 1,
  "Angry Bird": 1,
  Svenkaichi: 0,
  Alexandra: 1,
  "Sax Girl": 0,
  Crissid: 0,
  Preacher: 1,
  "Dromund Kaas": 1,
  Grimvs: 1,
  "PrttynPtty Phz": 0,
  Diplodocus: 0,
  Verstappen: 1,
  "Abdulla Zaman": 0,
  Sarmed: 1,
  Nahshesright: 0,
  Casagrande2108: 1,
  "Pe Yo": 0,
  "Den Sorte Dod": 1,
  Lufy0: 1,
  ct323i: 1,
  Limussia: 0,
  Kleetoris: 1,
  Justmewhyme: 1,
  Tuulip: 0,
  Tui23: 1,
  "The Fyren Order": 0,
  Grissom631: 0,
  Issa0313: 1,
  Zombielicious: 0,
  Mishkamoo: 0,
  Snowden: 0,
  Fogoro: 1,
  Sakuritta: 1,
  "Breaker CL": 1,
  Allhailshay: 0,
  Crazywaifu: 0,
  Beciaishere: 1,
  Maprikea: 1,
  Miccy: 1,
  Lusimella: 1,
  Bartlebert: 1,
  Rainon: 0,
  ElfasTheBrave: 1,
  Omega4431: 1,
  Aladita: 1,
  CeeCeeCee: 0,
  Bmrb: 0,
  "Alexia Tarabotti": 0,
  Mahrodg: 1,
  Liouka: 1,
  "Memis Outback": 0,
  Atomickitkat16: 0,
  Megeira: 0,
  "Also SarahElaina": 0,
  Twiggy: 0,
  Butterfly276583: 0,
  "The Legend": 0,
  Juliesue: 1,
  Manowarr: 1,
  "Aiko S": 0,
  Nachurriii: 0,
  Georgecris: 0,
  Nasam: 0,
  PurpleCat10: 0,
  "Little LadyK": 1,
  CurioCT: 0,
  Spamville: 0,
  ChelseaLou: 0,
  beebutterfly: 0,
  Goldensun25: 0,
  Trauma: 0,
};

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const playerRows = await client.query("SELECT id, name FROM players");

    const byName = new Map();
    for (const p of playerRows.rows) byName.set(p.name.trim(), p.id);

    const missing = Object.keys(ATTENDANCE).filter((n) => !byName.has(n));

    if (missing.length > 0) {
      console.error("These names are not in the players table:");
      missing.forEach((n) => console.error(`  ${n}`));
      console.error("\nNothing was written. Fix the names and re-run.");
      process.exitCode = 1;
      return;
    }

    const notListed = playerRows.rows
      .map((p) => p.name.trim())
      .filter((n) => !(n in ATTENDANCE));

    await client.query("BEGIN");

    const eventRows = await client.query(
      `INSERT INTO events (event_type, event_date)
       VALUES ($1, $2)
       ON CONFLICT (event_type, event_date)
       DO UPDATE SET event_type = EXCLUDED.event_type
       RETURNING id`,
      [EVENT_TYPE, EVENT_DATE],
    );

    const eventId = eventRows.rows[0].id;

    let present = 0;
    let absent = 0;

    for (const player of playerRows.rows) {
      const name = player.name.trim();
      const value = name in ATTENDANCE ? ATTENDANCE[name] : 0;

      await client.query(
        `INSERT INTO scores (player_id, event_id, measure, value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id, event_id, measure)
         DO UPDATE SET value = EXCLUDED.value`,
        [player.id, eventId, EVENT_TYPE, value],
      );

      if (value === 1) present += 1;
      else absent += 1;
    }

    await client.query("COMMIT");

    console.log(`Event: ${EVENT_TYPE} on ${EVENT_DATE}`);
    console.log(`Present: ${present}`);
    console.log(`Absent:  ${absent}`);
    console.log(`Total:   ${present + absent}`);

    if (notListed.length > 0) {
      console.log(`\nOn the roster but not in the list (saved as absent):`);
      notListed.forEach((n) => console.log(`  ${n}`));
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
