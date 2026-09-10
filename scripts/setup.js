require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const PLAYERS = [
  "Abdulla Zaman",
  "Ahmed",
  "Aiko S",
  "Aladita",
  "Alexandra",
  "Alexia Tarabotti",
  "Allhailshay",
  "Also SarahElaina",
  "Angry Bird",
  "Atomickitkat16",
  "Bartlebert",
  "Beciaishere",
  "beebutterfly",
  "Bmrb",
  "Boon dingotti",
  "Break CL",
  "Butterfly276583",
  "Casagrande",
  "CeeCeeCee",
  "ChelseaLou",
  "Crazywaifu",
  "Crissid",
  "ct323i",
  "CurioCT",
  "ddz123",
  "Deb83",
  "Den Sorte Dod",
  "Lord El Diabo",
  "Diplodocus",
  "Dromund Kaas",
  "El Amigo",
  "ElfasTheBrave",
  "Fogoro",
  "Fox",
  "Georgecris",
  "Goldensun25",
  "Grimvs",
  "Grissom631",
  "Issa0313",
  "Its Amjad",
  "Jay Patil",
  "Jenny Dingotti",
  "Juliesue",
  "Justmewhyme",
  "Kleetoris",
  "LadyK",
  "LuckyDadRules",
  "Limussia",
  "Liouka",
  "Little LadyK",
  "Lufy0",
  "Lusimella",
  "Mahrodg",
  "Manowarr",
  "Maprikea",
  "Marwan",
  "meemee",
  "Megeira",
  "Meku81",
  "Memis Outback",
  "Miccy",
  "Mirasol",
  "Mishkamoo",
  "Momo",
  "Nachurriii",
  "Nahshesright",
  "Nasam",
  "OGsteele",
  "Omega4431",
  "Oranit",
  "Otylka",
  "Ozz1234",
  "Pe Yo",
  "Plumpkin364",
  "Preacher",
  "PrttynPtty Phz",
  "PurpleCat10",
  "Rainon",
  "Ryjhg",
  "S4schA22o3",
  "Sakuritta",
  "Sarmed",
  "Sax Girl",
  "Shuvani",
  "Snowden",
  "Spamville",
  "Supermikepun",
  "Svenkaichi",
  "The Fyren Order",
  "The Legend",
  "Thomas74",
  "Trauma",
  "Tui23",
  "Tuulip",
  "Twiggy",
  "Venom",
  "Verstappen",
  "Vorth",
  "Zilvays",
  "Zombielicious",
];

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");

    const schema = fs.readFileSync(
      path.join(__dirname, "..", "schema.sql"),
      "utf8",
    );
    await client.query(schema);
    console.log("Schema applied.");

    const names = PLAYERS.map((n) => n.trim()).filter(Boolean);

    const result = await client.query(
      `INSERT INTO players (name)
       SELECT unnest($1::text[])
       ON CONFLICT (name) DO NOTHING`,
      [names],
    );

    await client.query("COMMIT");

    const total = await client.query("SELECT COUNT(*) FROM players");
    console.log(`Names supplied: ${names.length}`);
    console.log(`Newly inserted: ${result.rowCount}`);
    console.log(`Players in database: ${total.rows[0].count}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Setup failed, nothing was changed.");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
