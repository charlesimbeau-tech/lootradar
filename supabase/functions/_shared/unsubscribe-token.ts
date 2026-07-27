const TOKEN_VERSION = 1;
const HMAC_BYTES = 32;
const MAX_TOKEN_LENGTH = 4096;
const MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const UNSUBSCRIBE_CATEGORIES = [
  "target_price",
  "free_game",
  "weekly_digest",
  "all",
] as const;

export type UnsubscribeCategory = (typeof UNSUBSCRIBE_CATEGORIES)[number];

export interface UnsubscribePayload {
  userId: string;
  category: UnsubscribeCategory;
  expiresAt: string;
}

interface SignedUnsubscribePayload extends UnsubscribePayload {
  v: typeof TOKEN_VERSION;
  issuedAt: string;
}

function isCategory(value: unknown): value is UnsubscribeCategory {
  return typeof value === "string" &&
    UNSUBSCRIBE_CATEGORIES.includes(value as UnsubscribeCategory);
}

function validateSecret(secret: string): Uint8Array<ArrayBuffer> {
  if (typeof secret !== "string" || encoder.encode(secret).byteLength < 32) {
    throw new Error("Unsubscribe secret must contain at least 32 bytes");
  }
  return encoder.encode(secret);
}

function validateUserId(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128
  ) {
    return false;
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 32 || codePoint === 127) return false;
  }
  return true;
}

function parseTimestamp(value: unknown, field: string): number {
  if (typeof value !== "string" || value.length > 40) {
    throw new Error(`Invalid unsubscribe token ${field}`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`Invalid unsubscribe token ${field}`);
  }
  return timestamp;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid unsubscribe token");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - value.length % 4) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Invalid unsubscribe token");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encodeBase64Url(bytes) !== value) {
    throw new Error("Invalid unsubscribe token");
  }
  return bytes;
}

async function hmac(content: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    validateSecret(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(content));
  return new Uint8Array(signature);
}

function constantTimeEqual(expected: Uint8Array, actual: Uint8Array): boolean {
  if (expected.byteLength !== HMAC_BYTES || actual.byteLength !== HMAC_BYTES) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < HMAC_BYTES; index += 1) {
    difference |= expected[index] ^ actual[index];
  }
  return difference === 0;
}

function normalizeNow(now: Date | number): number {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(timestamp)) throw new Error("Invalid verification time");
  return timestamp;
}

export async function signUnsubscribe(
  payload: UnsubscribePayload,
  secret: string,
): Promise<string> {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid unsubscribe payload");
  }
  if (!validateUserId(payload.userId)) {
    throw new Error("Unsubscribe user ID is required");
  }
  if (!isCategory(payload.category)) {
    throw new Error("Invalid unsubscribe category");
  }

  const issuedAtMs = Date.now();
  const expiresAtMs = parseTimestamp(payload.expiresAt, "expiration");
  if (expiresAtMs <= issuedAtMs) {
    throw new Error("Unsubscribe token expiration must be in the future");
  }
  if (expiresAtMs - issuedAtMs > MAX_LIFETIME_MS) {
    throw new Error("Unsubscribe tokens cannot live longer than 30 days");
  }

  const signedPayload: SignedUnsubscribePayload = {
    v: TOKEN_VERSION,
    userId: payload.userId,
    category: payload.category,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
  const encodedPayload = encodeBase64Url(
    encoder.encode(JSON.stringify(signedPayload)),
  );
  const signature = encodeBase64Url(await hmac(encodedPayload, secret));
  return `${encodedPayload}.${signature}`;
}

export async function verifyUnsubscribe(
  token: string,
  secret: string,
  now: Date | number = new Date(),
): Promise<UnsubscribePayload> {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new Error("Invalid unsubscribe token");
  }
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid unsubscribe token");

  let suppliedSignature: Uint8Array;
  try {
    suppliedSignature = decodeBase64Url(parts[1]);
  } catch {
    throw new Error("Invalid unsubscribe token");
  }
  const expectedSignature = await hmac(parts[0], secret);
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
    throw new Error("Invalid unsubscribe token");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(decoder.decode(decodeBase64Url(parts[0])));
  } catch {
    throw new Error("Invalid unsubscribe token");
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Invalid unsubscribe token");
  }

  const value = decoded as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  const expectedKeys = ["category", "expiresAt", "issuedAt", "userId", "v"];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error("Invalid unsubscribe token payload");
  }
  if (
    value.v !== TOKEN_VERSION ||
    !validateUserId(value.userId) ||
    !isCategory(value.category)
  ) {
    throw new Error("Invalid unsubscribe token payload");
  }

  const issuedAtMs = parseTimestamp(value.issuedAt, "issue time");
  const expiresAtMs = parseTimestamp(value.expiresAt, "expiration");
  const nowMs = normalizeNow(now);
  if (
    expiresAtMs <= issuedAtMs ||
    expiresAtMs - issuedAtMs > MAX_LIFETIME_MS ||
    issuedAtMs > nowMs + MAX_CLOCK_SKEW_MS
  ) {
    throw new Error("Invalid unsubscribe token lifetime");
  }
  if (nowMs >= expiresAtMs) throw new Error("Unsubscribe token has expired");

  return {
    userId: value.userId,
    category: value.category,
    expiresAt: value.expiresAt as string,
  };
}
