import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/lib/password";
import {
  generateSecret,
  sealSecret,
  openSecret,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCodes,
  consumeRecoveryCode,
} from "@/lib/totp";
import { authenticator } from "otplib";
import { encryptStringWithKek, decryptStringWithKek } from "@/lib/crypto";

describe("password hashing", () => {
  it("argon2id round-trips", async () => {
    const h = await hashPassword("Sup3rSecret!");
    expect(await verifyPassword(h, "Sup3rSecret!")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });

  it("rejects malformed hash without throwing", async () => {
    expect(await verifyPassword("not a hash", "Sup3rSecret!")).toBe(false);
  });

  it("strength check rejects weak passwords", () => {
    expect(validatePasswordStrength("short")).toMatchObject({ reason: expect.any(String) });
    expect(validatePasswordStrength("alllowercase12")).toMatchObject({ reason: expect.any(String) });
    expect(validatePasswordStrength("ValidPass1!")).toMatchObject({ reason: expect.any(String) }); // 11 chars, just under
  });

  it("strength check accepts a 12+ char mixed password", () => {
    expect(validatePasswordStrength("ValidPass12!")).toBeNull();
  });
});

describe("TOTP secret crypto", () => {
  it("KEK string encryption round-trips", () => {
    const s = "JBSWY3DPEHPK3PXP";
    expect(decryptStringWithKek(encryptStringWithKek(s))).toBe(s);
  });

  it("sealSecret / openSecret round-trip", () => {
    const s = generateSecret();
    expect(openSecret(sealSecret(s))).toBe(s);
  });

  it("each seal produces different ciphertext for the same secret", () => {
    const s = "JBSWY3DPEHPK3PXP";
    expect(sealSecret(s)).not.toBe(sealSecret(s));
  });
});

describe("TOTP verification", () => {
  it("accepts the current authenticator code", () => {
    const secret = generateSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("rejects malformed codes", () => {
    const secret = generateSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });
});

describe("recovery codes", () => {
  it("generated codes verify against their hashes", async () => {
    const codes = generateRecoveryCodes();
    const joined = await hashRecoveryCodes(codes);
    const lines = joined.split("\n").filter(Boolean);
    expect(lines).toHaveLength(10);
  });

  it("a code can be used exactly once", async () => {
    const codes = generateRecoveryCodes();
    const joined = await hashRecoveryCodes(codes);
    const after1 = await consumeRecoveryCode(joined, codes[3]);
    expect(after1).not.toBeNull();
    expect(after1!.split("\n").filter(Boolean)).toHaveLength(9);
    // Re-using the same code against the reduced list now fails.
    expect(await consumeRecoveryCode(after1!, codes[3])).toBeNull();
  });

  it("normalises whitespace and case", async () => {
    const codes = generateRecoveryCodes();
    const joined = await hashRecoveryCodes(codes);
    expect(await consumeRecoveryCode(joined, ` ${codes[0].toLowerCase()} `)).not.toBeNull();
  });

  it("returns null for unknown codes", async () => {
    const codes = generateRecoveryCodes();
    const joined = await hashRecoveryCodes(codes);
    expect(await consumeRecoveryCode(joined, "ZZZZZ-ZZZZZ")).toBeNull();
  });
});
