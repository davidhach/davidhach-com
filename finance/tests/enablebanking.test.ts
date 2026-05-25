import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { signJwt, normalizePem } from "@/lib/bank/enablebanking/client";

// Generate a one-off RSA key pair for each test run so we don't ship a real key.
function fixtureKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding:  { type: "spki",  format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKey, publicKey };
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

describe("Enable Banking JWT", () => {
  it("produces a 3-part JWT with kid set on the header and the right RS256 algorithm", () => {
    const { privateKey } = fixtureKeys();
    const token = signJwt({ iss: "x", aud: "y", iat: 1, exp: 2 }, "app-uuid", privateKey);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const header = JSON.parse(b64urlDecode(parts[0]));
    expect(header).toMatchObject({ typ: "JWT", alg: "RS256", kid: "app-uuid" });
    const body = JSON.parse(b64urlDecode(parts[1]));
    expect(body).toMatchObject({ iss: "x", aud: "y", iat: 1, exp: 2 });
  });

  it("produces a signature that verifies against the matching public key", () => {
    const { privateKey, publicKey } = fixtureKeys();
    const payload = { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: 100, exp: 200 };
    const token = signJwt(payload, "kid-123", privateKey);
    const [h, p, sig] = token.split(".");
    const signedData = `${h}.${p}`;
    const sigBuf = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((sig.length + 3) % 4), "base64");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signedData);
    verifier.end();
    expect(verifier.verify(publicKey, sigBuf)).toBe(true);
  });

  it("a tampered payload fails signature verification", () => {
    const { privateKey, publicKey } = fixtureKeys();
    const token = signJwt({ iss: "a" }, "kid", privateKey);
    const [h, , sig] = token.split(".");
    const tampered = `${h}.${Buffer.from(JSON.stringify({ iss: "evil" })).toString("base64url")}`;
    const sigBuf = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((sig.length + 3) % 4), "base64");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(tampered);
    verifier.end();
    expect(verifier.verify(publicKey, sigBuf)).toBe(false);
  });

  it("surfaces a friendly error when the private key is malformed", () => {
    expect(() => signJwt({ x: 1 }, "kid", "not a pem"))
      .toThrow(/RS256 signing failed/);
  });
});

describe("normalizePem", () => {
  const { privateKey } = fixtureKeys();

  it("returns a real PEM untouched", () => {
    const out = normalizePem(privateKey);
    expect(out).toContain("-----BEGIN");
    expect(out).toContain("-----END");
    expect(out.includes("\n")).toBe(true);
  });

  it("converts literal \\n into real newlines (Vercel single-line paste)", () => {
    const escaped = privateKey.replace(/\n/g, "\\n");
    const out = normalizePem(escaped);
    expect(out).toBe(privateKey);
  });

  it("strips matching outer double quotes", () => {
    const out = normalizePem(`"${privateKey}"`);
    expect(out).toBe(privateKey);
  });

  it("normalises CRLF to LF", () => {
    const crlf = privateKey.replace(/\n/g, "\r\n");
    const out = normalizePem(crlf);
    expect(out.trim()).toBe(privateKey.trim());
    expect(out).not.toContain("\r");
  });

  it("strips a BOM", () => {
    const out = normalizePem(`﻿${privateKey}`);
    expect(out.trim()).toBe(privateKey.trim());
    expect(out.charCodeAt(0)).toBe("-".charCodeAt(0));
  });

  it("rejects values that aren't PEMs with a precise error", () => {
    expect(() => normalizePem("definitely not a key")).toThrow(/-----BEGIN/);
  });

  it("a normalised escaped-newline PEM still signs and verifies", () => {
    const { privateKey: pk, publicKey } = fixtureKeys();
    const escaped = pk.replace(/\n/g, "\\n");
    const normalised = normalizePem(escaped);
    const token = signJwt({ iss: "x" }, "k", normalised);
    const [h, p, sig] = token.split(".");
    const sigBuf = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((sig.length + 3) % 4), "base64");
    const v = createVerify("RSA-SHA256"); v.update(`${h}.${p}`); v.end();
    expect(v.verify(publicKey, sigBuf)).toBe(true);
  });
});
