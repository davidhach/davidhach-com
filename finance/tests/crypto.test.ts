import { describe, it, expect } from "vitest";
import { seal, unseal, sealWithKek, unsealWithKek } from "@/lib/crypto";
import { randomBytes } from "node:crypto";

describe("envelope encryption", () => {
  it("seal then unseal returns the original bytes", () => {
    const plaintext = Buffer.from("a bank statement screenshot, pretend");
    const sealed = seal(plaintext);
    const round = unseal(sealed);
    expect(round.equals(plaintext)).toBe(true);
  });

  it("each seal produces a different DEK and ciphertext", () => {
    const plaintext = Buffer.from("same input");
    const a = seal(plaintext);
    const b = seal(plaintext);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.wrappedDekB64).not.toBe(b.wrappedDekB64);
  });

  it("tampered ciphertext fails authentication", () => {
    const sealed = seal(Buffer.from("hello"));
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[0] ^= 0xff;
    expect(() => unseal({ ...sealed, ciphertext: tampered })).toThrow();
  });

  it("KEK-only seal works for backups", () => {
    const data = randomBytes(1024 * 32);
    const s = sealWithKek(data);
    const back = unsealWithKek(s);
    expect(back.equals(data)).toBe(true);
  });
});
