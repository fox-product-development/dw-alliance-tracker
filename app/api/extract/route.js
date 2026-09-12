import { NextResponse } from "next/server";
import { query } from "../../../lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const RANKING_PROMPT = `This is a screenshot from a mobile game showing a ranking list of players.

Extract the player names only. Ignore rank numbers, scores, CP values, and the coloured rank badges (R3, R4, R5).

The final row at the bottom, on a darker background, is a repeat of the viewer's own row. Ignore that row entirely.

Some names have decorative characters around them, such as bullet points or accented letters. Reproduce the name exactly as shown.

Respond with JSON only, no preamble and no markdown fences, in this shape:
{"players": [{"name": "name one", "status": null}]}`;

const ROSTER_PROMPT = `This is a screenshot from a mobile game showing an alliance member list.

For each member in the list, extract two things:
1. Their name, exactly as shown, including any decorative or accented characters.
2. The small grey text directly beneath their name.

That grey text is either the word "Online" or an elapsed time such as "1m ago", "22m ago", "1h ago", "2d ago".

Copy that text character for character. Do not convert it. Do not calculate anything. Do not change the unit letter — if it says "m" write "m", if it says "h" write "h", if it says "d" write "d". Read the unit letter carefully: "22m ago" and "22h ago" are different and must not be confused.

Ignore the alliance banner at the top of the screen. Ignore the four officer role cards labelled Warlord, Recruiter, Muse and Butler. Ignore CP numbers and rank badges. Only extract members from the scrolling list itself.

Respond with JSON only, no preamble and no markdown fences, in this shape:
{"players": [{"name": "name one", "status": "22m ago"}, {"name": "name two", "status": "Online"}]}`;

const ROSTER_TYPES = ["zombies", "war"];

function statusToMinutes(raw) {
  if (raw === null || raw === undefined) return null;

  const text = String(raw).trim().toLowerCase();

  if (text === "") return null;
  if (text.includes("online")) return 0;

  const match = text.match(/^(\d+)\s*([mhd])/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === "m") return amount;
  if (unit === "h") return amount * 60;
  return amount * 1440;
}

function normalise(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }

  return prev[b.length];
}

function similarity(a, b) {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

function bestMatches(extracted, players) {
  const target = normalise(extracted);

  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: similarity(target, normalise(p.name)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function extractPlayers(file, prompt) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: file.type || "image/png",
                data: base64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  if (data.error) {
    return { error: data.error.message, players: [], usage: null };
  }

  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  try {
    return { players: JSON.parse(text).players || [], usage: data.usage };
  } catch {
    return { error: "Could not parse the response.", players: [], usage: null };
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("images").filter((f) => f && f.size > 0);
    const eventType = formData.get("event_type") || "frankie";

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No images supplied." },
        { status: 400 },
      );
    }

    const usesRoster = ROSTER_TYPES.includes(eventType);
    const prompt = usesRoster ? ROSTER_PROMPT : RANKING_PROMPT;

    const players = await query(
      "SELECT id, name FROM players WHERE status = 'active' ORDER BY name ASC",
    );

    const extracted = [];
    const failures = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (const file of files) {
      const result = await extractPlayers(file, prompt);

      if (result.error) {
        failures.push({ file: file.name, error: result.error });
        continue;
      }

      if (result.usage) {
        inputTokens += result.usage.input_tokens || 0;
        outputTokens += result.usage.output_tokens || 0;
      }

      for (const entry of result.players) {
        if (!entry || !entry.name) continue;
        extracted.push({
          name: entry.name,
          statusRaw: entry.status ?? null,
          status: statusToMinutes(entry.status),
          source: file.name,
        });
      }
    }

    const seen = new Map();

    for (const item of extracted) {
      const key = normalise(item.name);
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, item);
        continue;
      }

      if (
        item.status !== null &&
        (existing.status === null || item.status < existing.status)
      ) {
        seen.set(key, item);
      }
    }

    const rows = Array.from(seen.values()).map((item) => ({
      extracted: item.name,
      status: item.status,
      statusRaw: item.statusRaw,
      source: item.source,
      candidates: bestMatches(item.name, players),
    }));

    return NextResponse.json({
      rows,
      players,
      failures,
      usesRoster,
      screenshots: files.length,
      duplicatesRemoved: extracted.length - rows.length,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
