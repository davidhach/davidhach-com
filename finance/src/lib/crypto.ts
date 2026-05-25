/**
 * Envelope encryption for statement files.
 *
 *   plaintext --AES-256-GCM(DEK,IV)--> ciphertext        ← stored in R2
 *   DEK       --AES-256-GCM(KEK,IV')-> wrappedDEK         ← stored in DB row
 *
 * The KEK never leaves Vercel env. Compromising R2 alone yields nothing.
 * Compromising the DB alone yields wrapped DEKs that are useless without the KEK.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12; // recommended for GCM

function getKek(): Buffer {
  const raw = process.env.MASTER_KEK;
  if (!raw) throw new Error("MASTER_KEK is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LEN) {
    throw new Error(`MASTER_KEK must be ${KEY_LEN} bytes base64 (got ${key.length})`);
  }
  return key;
}

export interface SealedBlob {
  ciphertext: Buffer;
  ivB64: string;
  authTagB64: string;
  wrappedDekB64: string;
}

export function seal(plaintext: Buffer): SealedBlob {
  const dek = randomBytes(KEY_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Wrap the DEK under the KEK with its own IV.
  const wrapIv = randomBytes(IV_LEN);
  const kekCipher = createCipheriv(ALG, getKek(), wrapIv);
  const wrappedDekBody = Buffer.concat([kekCipher.update(dek), kekCipher.final()]);
  const wrapTag = kekCipher.getAuthTag();
  // Store wrap-iv || wrap-tag || wrapped-dek in one base64 blob.
  const wrapped = Buffer.concat([wrapIv, wrapTag, wrappedDekBody]);

  return {
    ciphertext,
    ivB64: iv.toString("base64"),
    authTagB64: authTag.toString("base64"),
    wrappedDekB64: wrapped.toString("base64"),
  };
}

export function unseal(args: {
  ciphertext: Buffer;
  ivB64: string;
  authTagB64: string;
  wrappedDekB64: string;
}): Buffer {
  const wrapped = Buffer.from(args.wrappedDekB64, "base64");
  const wrapIv = wrapped.subarray(0, IV_LEN);
  const wrapTag = wrapped.subarray(IV_LEN, IV_LEN + 16);
  const wrappedDek = wrapped.subarray(IV_LEN + 16);

  const kekDecipher = createDecipheriv(ALG, getKek(), wrapIv);
  kekDecipher.setAuthTag(wrapTag);
  const dek = Buffer.concat([kekDecipher.update(wrappedDek), kekDecipher.final()]);

  const iv = Buffer.from(args.ivB64, "base64");
  const authTag = Buffer.from(args.authTagB64, "base64");
  const decipher = createDecipheriv(ALG, dek, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(args.ciphertext), decipher.final()]);
}

/** Convenience for backup script: encrypt a stream-sized buffer with KEK directly. */
export function sealWithKek(plaintext: Buffer): { ciphertext: Buffer; ivB64: string; authTagB64: string } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, getKek(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, ivB64: iv.toString("base64"), authTagB64: cipher.getAuthTag().toString("base64") };
}

export function unsealWithKek(b: { ciphertext: Buffer; ivB64: string; authTagB64: string }): Buffer {
  const decipher = createDecipheriv(ALG, getKek(), Buffer.from(b.ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(b.authTagB64, "base64"));
  return Buffer.concat([decipher.update(b.ciphertext), decipher.final()]);
}

// Pack a short secret (e.g. TOTP base32 string) into a single base64 column
// containing iv||tag||ciphertext, encrypted directly with the KEK.
// Cheaper than envelope encryption for tiny values and survives a DB-only leak.
export function encryptStringWithKek(plaintext: string): string {
  const { ciphertext, ivB64, authTagB64 } = sealWithKek(Buffer.from(plaintext, "utf8"));
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(authTagB64, "base64");
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptStringWithKek(packed: string): string {
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  return unsealWithKek({
    ciphertext: ct,
    ivB64: iv.toString("base64"),
    authTagB64: tag.toString("base64"),
  }).toString("utf8");
}
