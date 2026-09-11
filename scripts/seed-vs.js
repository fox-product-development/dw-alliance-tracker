require("dotenv").config({ path: ".env.local" });

const { Client } = require("pg");

const DATES = ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"];

const SCORES = {
  "Abdulla Zaman": 119.1,
  Ahmed: 171.2,
  "Aiko S": 145.7,
  Aladita: 129.3,
  Alexandra: 109.6,
  "Alexia Tarabotti": 158.4,
  Allhailshay: 16.4,
  "Also SarahElaina": 20.8,
  "Angry Bird": 62.2,
  Atomickitkat16: 16.8,
  Bartlebert: 148,
  Beciaishere: 43.4,
  beebutterfly: 0,
  Bmrb: 16.4,
  "Boon dingotti": 117.7,
  "Breaker CL": 29,
  Butterfly276583: 7.5,
  Casagrande2108: 17.3,
  CeeCeeCee: 24.3,
  ChelseaLou: 6,
  Crazywaifu: 32.7,
  Crissid: 30,
  ct323i: 47.7,
  CurioCT: 16,
  ddz123: 60.5,
  Deb83: 57.8,
  "Den Sorte Dod": 17.9,
  "Lord El Diabo": 96.8,
  Diplodocus: 20.6,
  "Dromund Kaas": 16.5,
  ElfasTheBrave: 60.2,
  Fogoro: 32,
  Fox: 109.1,
  Georgecris: 6.4,
  Goldensun25: 2.7,
  Grimvs: 84,
  Grissom631: 64.6,
  Issa0313: 67.2,
  "-Amjad": 93.8,
  "Jenny Dingotti": 52.5,
  Juliesue: 13.4,
  Justmewhyme: 18.8,
  Kleetoris: 114.8,
  LadyK: 131,
  LuckysDadsRules: 29,
  Limussia: 89.1,
  Liouka: 42.2,
  "Little LadyK": 43.4,
  Lufy0: 30.8,
  Lusimella: 55.2,
  Mahrodg: 43,
  Manowarr: 7.8,
  Maprikea: 60.6,
  Marwan: 57.1,
  meemee: 48.8,
  Megeira: 24.6,
  "Memis Outback": 37.1,
  Miccy: 25.7,
  Mirasol: 53.3,
  Mishkamoo: 51,
  Momo: 102.8,
  Nachurriii: 3.3,
  Nahshesright: 45.9,
  Nasam: 7.8,
  OGsteele: 109.7,
  Omega4431: 60.6,
  Oranit: 154.4,
  Otylka: 29.6,
  Ozz1234: 56.5,
  "Pe Yo": 63.6,
  Plumpkin364: 184,
  Preacher: 36.4,
  "PrttynPtty Phz": 34.6,
  PurpleCat10: 8.9,
  Rainon: 44.7,
  Ryjhg: 38.2,
  S4schA22o3: 94.8,
  Sakuritta: 64.2,
  Sarmed: 16.5,
  "Sax Girl": 21.4,
  Shuvani: 11.9,
  Snowden: 73.4,
  Spamville: 9.4,
  Supermikepun: 65.2,
  Svenkaichi: 36.1,
  "The Fyren Order": 53.5,
  "The Legend": 8.1,
  Thomas74: 109.3,
  Trauma: 0,
  Tui23: 72.2,
  Tuulip: 63.1,
  Twiggy: 20.6,
  Venom: 47.9,
  Verstappen: 165.1,
  Vorth: 68.7,
  Zilvays: 55.8,
  Zombielicious: 15.7,
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

    const missing = Object.keys(SCORES).filter((n) => !byName.has(n));

    if (missing.length > 0) {
      console.error("These names are not in the players table:");
      missing.forEach((n) => console.error(`  ${n}`));
      console.error("\nNothing was written. Fix the names and re-run.");
      process.exitCode = 1;
      return;
    }

    await client.query("BEGIN");

    let written = 0;

    for (const date of DATES) {
      const eventRows = await client.query(
        `INSERT INTO events (event_type, event_date)
         VALUES ('vs', $1)
         ON CONFLICT (event_type, event_date)
         DO UPDATE SET event_type = EXCLUDED.event_type
         RETURNING id`,
        [date],
      );

      const eventId = eventRows.rows[0].id;

      for (const [name, total] of Object.entries(SCORES)) {
        const weekly = Math.round((total / 4) * 10) / 10;

        await client.query(
          `INSERT INTO scores (player_id, event_id, measure, value)
           VALUES ($1, $2, 'vs', $3)
           ON CONFLICT (player_id, event_id, measure)
           DO UPDATE SET value = EXCLUDED.value`,
          [byName.get(name), eventId, weekly],
        );

        written += 1;
      }
    }

    await client.query("COMMIT");

    console.log(`Events created: ${DATES.length}`);
    console.log(`Score rows written: ${written}`);
    console.log(`Players covered: ${Object.keys(SCORES).length}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed, nothing was changed.");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
