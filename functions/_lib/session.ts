import type { Env } from "./env";
import { HttpError, readJson } from "./http";

const SESSION_COOKIE = "cms_session";
const STATE_COOKIE = "cms_oauth_state";
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function stringToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToString(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyHmac(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  try {
    const key = await importHmacKey(secret);
    const signatureBytes = base64UrlToBytes(signature);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes.buffer as ArrayBuffer,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie");
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(
      part.slice(index + 1).trim(),
    );
  }
  return out;
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAge: number;
    path?: string;
    sameSite?: "Strict" | "Lax" | "None";
  },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Secure",
    `SameSite=${options.sameSite ?? "Strict"}`,
    `Path=${options.path ?? "/"}`,
    `Max-Age=${options.maxAge}`,
  ];
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return serializeCookie(SESSION_COOKIE, "", { maxAge: 0 });
}

export function clearStateCookie(): string {
  return serializeCookie(STATE_COOKIE, "", { maxAge: 0 });
}

export function createStateCookie(state: string): string {
  // Must be Lax, not Strict: GitHub redirects back to /api/auth/callback as a cross-site
  // navigation, and browsers do not send SameSite=Strict cookies on that request, which
  // would make every sign-in fail the state check.
  return serializeCookie(STATE_COOKIE, state, {
    maxAge: 600,
    sameSite: "Lax",
  });
}

export function readStateCookie(request: Request): string | undefined {
  return parseCookies(request)[STATE_COOKIE];
}

export async function createSessionCookie(
  login: string,
  env: Env,
  maxAgeSeconds = 7 * 24 * 60 * 60,
): Promise<string> {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 16)
    throw new HttpError(
      500,
      "config_error",
      "Session secret is not configured.",
    );
  const now = Math.floor(Date.now() / 1000);
  const payload = stringToBase64Url(
    JSON.stringify({ login, iat: now, exp: now + maxAgeSeconds }),
  );
  const signature = await hmac(secret, payload);
  return serializeCookie(SESSION_COOKIE, `${payload}.${signature}`, {
    maxAge: maxAgeSeconds,
  });
}

export async function verifySessionCookie(
  request: Request,
  env: Env,
): Promise<{ login: string } | null> {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 16)
    throw new HttpError(
      500,
      "config_error",
      "Session secret is not configured.",
    );
  const raw = parseCookies(request)[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!(await verifyHmac(secret, payload, signature))) return null;
  try {
    const parsed = JSON.parse(base64UrlToString(payload)) as {
      login?: string;
      exp?: number;
    };
    if (
      !parsed.login ||
      !parsed.exp ||
      parsed.exp < Math.floor(Date.now() / 1000)
    )
      return null;
    return { login: parsed.login };
  } catch {
    return null;
  }
}

export async function requireSession(
  request: Request,
  env: Env,
): Promise<{ login: string }> {
  const session = await verifySessionCookie(request, env);
  if (!session) throw new HttpError(401, "unauthorized", "Sign in required.");
  return session;
}

export function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}

export async function readLimitedJson<T>(
  request: Request,
  maxBytes: number,
): Promise<T> {
  return readJson<T>(request, maxBytes);
}
