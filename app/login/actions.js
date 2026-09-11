"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  createToken,
  checkPassword,
} from "../../lib/auth";

export async function login(prevState, formData) {
  const password = formData.get("password");

  if (!checkPassword(password)) {
    return { error: "Incorrect password." };
  }

  const jar = await cookies();

  jar.set(COOKIE_NAME, createToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });

  redirect("/");
}
