# DW Alliance Tracker

Tracks and ranks member participation for a Dark War Survival alliance,
replacing a manual spreadsheet. Data is entered by hand or extracted from
in-game screenshots, stored per player per event, and combined into a
weighted score out of 10.

---

## Stack

- **Next.js 16** (App Router, plain JavaScript, React 19)
- **PostgreSQL** on Railway
- **Hosting** on Vercel
- **Anthropic vision API** for screenshot extraction
- Packages: `pg`, `dotenv`

Vercel and Railway have no private network between them, so the app uses
Railway's public database endpoint. The purge cron runs inside Railway and
uses the internal endpoint.

### Environment variables

Set in `.env.local` locally and in Vercel's project settings for production.

| Variable            | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `DATABASE_URL`      | Railway Postgres connection string            |
| `ANTHROPIC_API_KEY` | Vision API, used only by the extraction route |
| `APP_PASSWORD`      | The single shared login password              |
| `AUTH_SECRET`       | Random string used to sign the session cookie |

`AUTH_SECRET` can be generated with:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Data model

Four tables. Scores are stored long-format — one row per player per measure
per event — so new measures need no schema change.

**players** — `id`, `name` (unique), `status` (`active` / `removed`),
`status_date`

**events** — `id`, `event_type`, `event_date`, `created_at`.
Unique on `(event_type, event_date)` so the same event can't be logged twice.

**scores** — `id`, `player_id`, `event_id`, `measure`, `value`, `reason`.
Unique on `(player_id, event_id, measure)`.

**settings** — `key`, `value` (numeric), `text_value` (text, used only by the
car CP range labels).

### Event types and measures

An event produces one or more measures. These are usually the same name, with
one exception: a poll produces two.

| Event type     | Measures produced         | Value                   |
| -------------- | ------------------------- | ----------------------- |
| `vs`           | `vs`                      | Daily score in millions |
| `poll`         | `poll_response`, `car_cp` | 0/1, and rank 1–6       |
| `frankie`      | `frankie`                 | 0 or 1                  |
| `zombies`      | `zombies`                 | 0 or 1                  |
| `war`          | `war`                     | 0 or 1                  |
| `black_gold`   | `black_gold`              | 0, 0.5 or 1             |
| `kill_event`   | `kill_event`              | 0 or 1                  |
| `contribution` | `contribution`            | Weekly figure           |

Anything assuming `measure = event_type` will silently produce zero for polls.

### The `reason` column

Optional free context on any score. Currently written by two things:

- **Black Gold** stores which option was selected: `no_response`, `decline`,
  `accept`, `no_show`. Needed because `no_response` and `no_show` both score
  0 and would otherwise be indistinguishable.
- **VS** stores `holiday` when the holiday box is ticked. Annotation only —
  it does not change the score.

---

## Scoring

Each measure converts to a 0–1 figure, is multiplied by its weight, summed,
divided by the total active weight, and multiplied by 10.

Measures with no data for a player are **excluded and the rest rescaled**, so
the score is always out of 10. A weight of 0 excludes a measure entirely.

### Conversions

**VS** — averaged across the player's rows, then:

- At or above the floor: `0.5 + 0.5 × (min(avg, cap) − floor) ÷ (cap − floor)`
- Below the floor: `0.5 × (avg ÷ floor)^exponent`

Floor, cap and exponent are settings. Currently 2, 10 and 1.5 for daily data.

**Attendance measures** (`frankie`, `zombies`, `war`, `kill_event`,
`poll_response`) — the average of their 0/1 values, giving an attendance rate.

**`black_gold`** — the average of 0/0.5/1 values.

**`car_cp`** — the **most recent** value, not an average, because it is a
property of the player rather than a rate. Converted as
`1 − (rank − 1) × 0.16`, so rank 1 gives 1.0 and rank 6 gives 0.2.

**`contribution`** — capped, then divided by the cap.

### Ranking window

A rolling window ending today: 28, 56 or 84 days. A player's denominator is
their own row count, not the number of events — so someone who joined recently
is judged only on the events they were present for. There is no join date;
absence of a row is what handles it.

---

## Screens

**`/`** — dashboard. Roster count, last attendance event, and cards for each
measure showing a 28-day figure and a recent one. VS has a sparkline. Black
Gold shows a breakdown by reason from its most recent event.

**`/log`** — manual entry. Event type and date, then a control per player.
Number inputs for VS, poll and contribution; tick boxes for Frankie, Zombies
and War; four radios for Black Gold; tick boxes for Kill Event. A holiday tick
appears alongside VS.

**`/upload`** — screenshot entry for Frankie, Zombies and War.

**`/rankings`** — the full table, sorted by score, with a breakdown column per
measure and the car CP legend.

**`/players`** — roster management. Active list with rename and remove,
plus a recently-removed list with restore.

**`/settings`** — weights, scoring parameters, and the car CP range labels.

**`/login`** — password entry.

---

## Screenshot extraction

`app/api/extract/route.js`. One API call per screenshot, never batched, so
failures are isolated.

**Two prompts**, chosen by event type:

- **Ranking list** (Frankie) — reads names from an event ranking screen.
  Ignores the duplicated row at the bottom showing the viewer's own entry.
- **Member list** (Zombies, War) — reads names and the last-seen status. The
  status is returned as raw text (`"22m ago"`, `"Online"`) and converted to
  minutes in JavaScript. An earlier version asked the model to convert, which
  produced wrong units roughly a third of the time.

**Matching** — extracted names are normalised (accents stripped,
non-alphanumerics removed, lowercased) then compared to the active roster by
edit distance. Anything at or above 0.70 preselects its match; below that the
row defaults to Skip. The runner-up scores are shown so a near-collision is
visible.

**Known limits:**

- Single-digit minute readings (`1m`) are unreliable and have been misread as
  `5m` and `14m`. Double digits have been accurate. The roster is sorted by
  last-seen, so a value out of sequence is a misread.
- The model has occasionally invented a status for a row whose timestamp was
  not visible.

**Review is always manual.** Nothing commits until confirmed.

---

## Behaviours worth knowing

**Absence means zero.** For attendance events, everyone on the active roster
gets a row — 1 for those found, 0 for everyone else. This is why the roster
must be current before logging.

**Kill Event accumulates.** Ticking means _unshielded_ — the inverse of every
other tick box. The first save creates rows for the whole roster set to 1, then
each save only ever flips a 1 to a 0. Earlier ticks are never undone, so a
mistaken tick has to be fixed in the database.

**Image uploads are additive.** Uploading more screenshots for an existing
event adds to it rather than replacing it. Manual entry replaces the event
entirely.

**Player removal is soft.** Setting someone to `removed` hides them from every
screen except roster management, stops rows being written for them, and starts
a 14-day clock. `scripts/purge-removed.js` deletes anyone past that, along with
their scores. It runs as a Railway cron service at 03:00 UTC on Sundays.

**Dates are handled in UTC.** Between midnight and 1am UK summer time, window
calculations use the previous day.

---

## Scripts

All in `scripts/`, run with `node scripts/<name>.js`.

| Script                  | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `setup.js`              | Applies `schema.sql` and seeds the initial roster   |
| `migrate-vs.js`         | Imports a single VS CSV                             |
| `migrate-vs-history.js` | Imports several VS CSVs with differing date formats |
| `migrate-frankie.js`    | Imports one Frankie attendance list                 |
| `fill-vs-gaps.js`       | Writes zeros for specific interior gaps             |
| `add-weights.js`        | Adds new weight rows to settings                    |
| `purge-removed.js`      | Deletes players removed more than 14 days ago       |

Migration scripts validate every name and value **before** writing anything,
and refuse to run if any fail. They map shorthand spreadsheet names to roster
names via a `NAME_MAP` constant.

One lesson embedded in them: a historic list is a complete record of who was
present, so players absent from the file get **no rows**, not zeros. Writing
zeros penalises members who had not yet joined.

---

## Gotchas

**Railway's query console appends `LIMIT` to everything**, which breaks any
`INSERT`, `UPDATE` or `DELETE`. Use a script for writes; the console is fine
for `SELECT`.

**Keep `package.json` versions honest.** The app was briefly running Next 16
locally while `package.json` allowed only 15, so Vercel built with 15, silently
ignored `proxy.js`, and deployed with no authentication for a day.

**`proxy.js` is the Next 16 name for what used to be `middleware.js`**, and it
runs on Node rather than the Edge runtime.

**Filenames are case-sensitive on Vercel** but not on Windows, so a casing
mismatch in an import works locally and fails on deploy.

---
