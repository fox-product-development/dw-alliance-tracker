"use server";

import { revalidatePath } from "next/cache";
import { query } from "../../lib/db";

export async function addPlayer(formData) {
  const name = (formData.get("name") || "").trim();
  if (!name) return;

  await query(
    `INSERT INTO players (name, status, status_date)
     VALUES ($1, 'active', CURRENT_DATE)
     ON CONFLICT (name) DO NOTHING`,
    [name],
  );

  revalidatePath("/players");
}

export async function renamePlayer(formData) {
  const id = Number(formData.get("id"));
  const name = (formData.get("name") || "").trim();
  if (!id || !name) return;

  await query("UPDATE players SET name = $1 WHERE id = $2", [name, id]);

  revalidatePath("/players");
}

export async function removePlayer(formData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await query(
    `UPDATE players
     SET status = 'removed', status_date = CURRENT_DATE
     WHERE id = $1`,
    [id],
  );

  revalidatePath("/players");
  revalidatePath("/rankings");
  revalidatePath("/");
}

export async function restorePlayer(formData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await query(
    `UPDATE players
     SET status = 'active', status_date = CURRENT_DATE
     WHERE id = $1`,
    [id],
  );

  revalidatePath("/players");
  revalidatePath("/rankings");
  revalidatePath("/");
}
