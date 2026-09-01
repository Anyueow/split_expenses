import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http";

export const SESSION_COOKIE = "spliteasy_session";
export const LOGGED_IN_COOKIE = "spliteasy_logged_in";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_TTL_MS = MAX_AGE_SECONDS * 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    throw new HttpError(500, "Server auth is not configured");
  }
  return value;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** SHA-256 both sides first so the buffers are always 32 bytes and comparison stays constant-time. */
export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

export function checkPassword(submitted: unknown): boolean {
  const expected = requireEnv("APP_PASSWORD");
  if (typeof submitted !== "string") return false;
  return constantTimeEquals(submitted, expected);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function createToken(expiresAtMs: number = Date.now() + SESSION_TTL_MS): string {
  const secret = requireEnv("SESSION_SECRET");
  const exp = String(Math.floor(expiresAtMs));
  return `${exp}.${sign(exp, secret)}`;
}

export function verifyToken(token: unknown, now: number = Date.now()): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  const secret = requireEnv("SESSION_SECRET");

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [exp, signature] = parts;
  if (!/^\d+$/.test(exp) || !/^[0-9a-f]+$/i.test(signature)) return false;

  if (!constantTimeEquals(signature, sign(exp, secret))) return false;

  const expiresAtMs = Number(exp);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return false;

  return true;
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const value = part.slice(eq + 1).trim();
    out[name] = decodeURIComponent(value);
  }
  return out;
}

export function isAuthenticated(req: Request): boolean {
  const cookies = parseCookies(req.headers.get("cookie"));
  return verifyToken(cookies[SESSION_COOKIE]);
}

export function requireAuth(req: Request): void {
  if (!isAuthenticated(req)) throw new HttpError(401, "Unauthorized");
}

const BASE_ATTRS = `Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
const CLEAR_ATTRS = "Secure; SameSite=Strict; Path=/; Max-Age=0";

/** Two cookies: the HttpOnly signed session, plus a JS-readable flag the UI polls. */
export function sessionCookies(token: string): string[] {
  return [
    `${SESSION_COOKIE}=${token}; HttpOnly; ${BASE_ATTRS}`,
    `${LOGGED_IN_COOKIE}=true; ${BASE_ATTRS}`,
  ];
}

export function clearedCookies(): string[] {
  return [
    `${SESSION_COOKIE}=; HttpOnly; ${CLEAR_ATTRS}`,
    `${LOGGED_IN_COOKIE}=; ${CLEAR_ATTRS}`,
  ];
}

export function cookieHeaders(cookies: string[]): Headers {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return headers;
}
