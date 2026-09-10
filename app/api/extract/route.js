import { NextResponse } from "next/server";
import { query } from "../../../lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROMPT = `This is a screenshot from a mobile game showing a ranking list of players.

Extract the player names only. Ignore rank numbers, scores, CP values, and the coloured rank badges (R3, R4, R5).

The final row at the bottom, on a darker background, is a repeat of the viewer's own row. Ignore that row entirely.

Some names have decorative characters around them, such as bullet points or accented letters. Reproduce the name exactly as shown.

Respond with JSON only, no preamble and no markdown fences, in this shape:
{"names": ["name one", "name two"]}`;

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

async function extractNames(file) {
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
      max_tokens: 1000,
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
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  if (data.error) {
    return { error: data.error.message, names: [], usage: null };
  }

  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  try {
    return { names: JSON.parse(text).names || [], usage: data.usage };
  } catch {
    return { error: "Could not parse the response.", names: [], usage: null };
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("images").filter((f) => f && f.size > 0);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No images supplied." },
        { status: 400 },
      );
    }

    const players = await query(
      "SELECT id, name FROM players ORDER BY name ASC",
    );

    const extracted = [];
    const failures = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (let i = 0; i < files.length; i++) {
      const result = await extractNames(files[i]);

      if (result.error) {
        failures.push({ file: files[i].name, error: result.error });
        continue;
      }

      if (result.usage) {
        inputTokens += result.usage.input_tokens || 0;
        outputTokens += result.usage.output_tokens || 0;
      }

      for (const name of result.names) {
        extracted.push({ name, source: files[i].name });
      }
    }

    const seen = new Set();
    const rows = [];

    for (const item of extracted) {
      const key = normalise(item.name);
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        extracted: item.name,
        source: item.source,
        candidates: bestMatches(item.name, players),
      });
    }

    return NextResponse.json({
      rows,
      players,
      failures,
      screenshots: files.length,
      duplicatesRemoved: extracted.length - rows.length,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
