const crypto = require("crypto");

const COOKIE_NAME = "dw_session";
const MAX_AGE_SECONDS = 6 * 60 * 60;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

function sign(expiry) {
  return crypto
    .createHmac("sha256", secret())
    .update(String(expiry))
    .digest("hex");
}

function createToken() {
  const expiry = Date.now() + MAX_AGE_SECONDS * 1000;
  return `${expiry}.${sign(expiry)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [expiryRaw, providedSignature] = parts;
  const expiry = Number(expiryRaw);

  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  const expected = sign(expiry);

  const a = Buffer.from(providedSignature, "utf8");
  const b = Buffer.from(expected, "utf8");

  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

function checkPassword(candidate) {
  const actual = process.env.APP_PASSWORD;
  if (!actual) return false;

  const a = Buffer.from(String(candidate), "utf8");
  const b = Buffer.from(actual, "utf8");

  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  createToken,
  verifyToken,
  checkPassword,
};
