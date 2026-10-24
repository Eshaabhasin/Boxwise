import { describe, expect, it } from "vitest";
import { createSessionToken, passcodeMatches, verifySessionToken } from "@/lib/auth";

const SECRET = "x".repeat(32);

describe("session cookie", () => {
  it("accepts a token it signed", () => {
    expect(verifySessionToken(createSessionToken(SECRET), SECRET)).toBe(true);
  });

  it("rejects a token signed with another secret", () => {
    expect(verifySessionToken(createSessionToken("y".repeat(32)), SECRET)).toBe(false);
  });

  it("rejects an expired token", () => {
    const old = createSessionToken(SECRET, Date.now() - 400 * 24 * 60 * 60 * 1000);
    expect(verifySessionToken(old, SECRET)).toBe(false);
  });

  it("rejects a tampered expiry", () => {
    const [, mac] = createSessionToken(SECRET).split(".");
    expect(verifySessionToken(`9999999999999.${mac ?? ""}`, SECRET)).toBe(false);
  });

  it("rejects junk and missing tokens", () => {
    expect(verifySessionToken(undefined, SECRET)).toBe(false);
    expect(verifySessionToken("abc", SECRET)).toBe(false);
  });
});

describe("passcode", () => {
  it("matches only the exact passcode", () => {
    expect(passcodeMatches("1234", "1234")).toBe(true);
    expect(passcodeMatches("1235", "1234")).toBe(false);
    expect(passcodeMatches("", "")).toBe(false);
  });
});
