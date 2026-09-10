"use server";

import { revalidatePath } from "next/cache";
import { query } from "../../lib/db";

export async function saveSettings(formData) {
  const rows = await query("SELECT key FROM settings");

  for (const row of rows) {
    const raw = formData.get(row.key);
    if (raw === null || String(raw).trim() === "") continue;

    const value = Number(raw);
    if (!Number.isFinite(value)) continue;

    await query("UPDATE settings SET value = $1 WHERE key = $2", [
      value,
      row.key,
    ]);
  }

  revalidatePath("/settings");
  revalidatePath("/rankings");
}
