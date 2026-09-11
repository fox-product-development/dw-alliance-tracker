"use server";

import { revalidatePath } from "next/cache";
import { query } from "../../lib/db";

const TEXT_KEYS = [
  "car_range_1",
  "car_range_2",
  "car_range_3",
  "car_range_4",
  "car_range_5",
  "car_range_6",
];

export async function saveSettings(formData) {
  const rows = await query("SELECT key FROM settings");

  for (const row of rows) {
    const raw = formData.get(row.key);
    if (raw === null) continue;

    if (TEXT_KEYS.includes(row.key)) {
      await query("UPDATE settings SET text_value = $1 WHERE key = $2", [
        String(raw).trim(),
        row.key,
      ]);
      continue;
    }

    if (String(raw).trim() === "") continue;

    const value = Number(raw);
    if (!Number.isFinite(value)) continue;

    await query("UPDATE settings SET value = $1 WHERE key = $2", [
      value,
      row.key,
    ]);
  }

  revalidatePath("/settings");
  revalidatePath("/rankings");
  revalidatePath("/");
}
