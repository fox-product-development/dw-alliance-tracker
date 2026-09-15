import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { normalise, bestMatches } from "../../../lib/match";

export const runtime = "nodejs";
export const maxDuration = 60;

const MEASURE = "vs";
const EVENT_TYPE = "vs";

// A bare number this large cannot be a VS score in millions, so a missing
// suffix on it is a dropped k rather than a dropped m.
const DROPPED_K_THRESHOLD = 50;

function parseCsv(text) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => l.split(","));
}

// Header dates arrive as MM-DD-YYYY.
function parseDate(raw) {
  const parts = String(raw).trim().split(/[-/]/);
  if (parts.length !== 3) return null;

  const month = Number(parts[0]);
  const day = Number(parts[1]);
  let year = Number(parts[2]);

  if (year < 100) year += 2000;
  if (!day || !month || !year || month > 12 || day > 31) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Divides by 1000 by moving the decimal point through the string, so the
// result never goes through binary floating point division. 800.1 becomes
// 0.8001 exactly, where 800.1 / 1000 gives 0.8001000000000001.
function thousandsToMillions(digits) {
  const [whole, fraction = ""] = digits.split(".");
  const padded = whole.padStart(4, "0");
  const cut = padded.length - 3;
  const left = padded.slice(0, cut);
  const right = padded.slice(cut) + fraction;
  return Number(`${left}.${right}`.replace(/\.?0+$/, "") || "0");
}

// Returns { value, flag } where flag names a cell needing a decision,
// or { skip: true } for an empty cell, or { bad: true } for junk.
function parseValue(raw) {
  const text = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (text === "") return { skip: true };

  const match = text.match(/^(\d+(?:\.\d+)?)([mk]?)$/);
  if (!match) return { bad: true };

  const digits = match[1];
  const suffix = match[2];
  const amount = Number(digits);

  if (suffix === "k") return { value: thousandsToMillions(digits) };
  if (suffix === "m") return { value: amount };

  // No suffix. Zero is written bare in these files and is unambiguous.
  if (amount === 0) return { value: 0 };

  return {
    value: amount,
    flag: amount >= DROPPED_K_THRESHOLD ? "likely_k" : "missing_unit",
    asK: thousandsToMillions(digits),
    asM: amount,
  };
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file supplied." }, { status: 400 });
    }

    const rows = parseCsv(await file.text());

    if (rows.length < 2) {
      return NextResponse.json(
        { error: "The file has no data rows." },
        { status: 400 },
      );
    }

    const header = rows[0];
    const dates = [];

    for (let i = 1; i < header.length; i++) {
      const iso = parseDate(header[i]);
      if (!iso) {
        return NextResponse.json(
          { error: `Column ${i} of the header is not a date: "${header[i]}"` },
          { status: 400 },
        );
      }
      dates.push({ index: i, iso });
    }

    if (dates.length === 0) {
      return NextResponse.json(
        { error: "The header has no date columns." },
        { status: 400 },
      );
    }

    const players = await query(
      "SELECT id, name FROM players WHERE status = 'active' ORDER BY name ASC",
    );

    // Dates already logged are skipped whole — a second upload of the same
    // week adds only the days that are not there yet.
    const existing = await query(
      `SELECT event_date::text AS event_date
       FROM events
       WHERE event_type = $1 AND event_date = ANY($2::date[])`,
      [EVENT_TYPE, dates.map((d) => d.iso)],
    );

    const alreadyLogged = new Set(existing.map((e) => e.event_date));

    const parsed = [];
    const flags = [];
    const bad = [];

    for (const row of rows.slice(1)) {
      const csvName = String(row[0] ?? "").trim();
      if (csvName === "") continue;

      const cells = [];

      for (const col of dates) {
        const raw = String(row[col.index] ?? "").trim();
        const result = parseValue(raw);

        if (result.bad) {
          bad.push({ csvName, date: col.iso, raw });
          cells.push({ date: col.iso, raw, value: null, bad: true });
          continue;
        }

        if (result.skip) {
          cells.push({ date: col.iso, raw, value: null });
          continue;
        }

        if (result.flag) {
          flags.push({
            csvName,
            date: col.iso,
            raw,
            asM: result.asM,
            asK: result.asK,
            suggested: result.flag === "likely_k" ? "k" : "m",
          });
        }

        cells.push({
          date: col.iso,
          raw,
          value: result.value,
          flagged: !!result.flag,
        });
      }

      parsed.push({
        csvName,
        cells,
        candidates: bestMatches(csvName, players),
      });
    }

    // Names claimed by a confident match are dropped from the shortlist
    // offered for the rows that did not match, so the dropdown only shows
    // players the file has not already accounted for.
    const claimed = new Set();
    for (const p of parsed) {
      const best = p.candidates[0];
      if (best && best.score >= 0.7) claimed.add(best.id);
    }

    return NextResponse.json({
      rows: parsed,
      players,
      dates: dates.map((d) => d.iso),
      alreadyLogged: Array.from(alreadyLogged),
      unclaimed: players.filter((p) => !claimed.has(p.id)).map((p) => p.id),
      flags,
      bad,
      fileName: file.name,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
