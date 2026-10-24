import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Single-owner login: one passcode, then a signed cookie that lasts 180 days.
 * Cookie value: "<expiry ms>.<hex HMAC-SHA256 of expiry>".
 */
export const SESSION_COOKIE = "boxbol_session";
export const SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createSessionToken(secret: string, now: number = Date.now()): string {
  const expiry = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiry}.${sign(expiry, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string, now: number = Date.now()): boolean {
  if (!token || !secret) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expiry = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(expiry) || Number(expiry) < now) return false;
  return safeEqual(mac, sign(expiry, secret));
}

/** Compares passcodes without leaking length or content through timing. */
export function passcodeMatches(given: string, expected: string): boolean {
  if (!expected) return false;
  const key = "boxbol-passcode";
  return safeEqual(sign(given, key), sign(expected, key));
}
