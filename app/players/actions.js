"use server";

import { revalidatePath } from "next/cache";
import { query } from "../../lib/db";

export async function addPlayer(formData) {
  const name = (formData.get("name") || "").trim();
  if (!name) return;

  await query(
    "INSERT INTO players (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
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

export async function deletePlayer(formData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await query("DELETE FROM players WHERE id = $1", [id]);

  revalidatePath("/players");
}
