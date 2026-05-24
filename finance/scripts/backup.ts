/**
 * Physical backup: pg_dump --format=custom | AES-256-GCM | upload to R2.
 * Intended to be run on a VM/container where pg_dump is available. On
 * serverless-only hosts, use /api/cron/backup instead (logical JSON dump).
 *
 * Usage:
 *   tsx scripts/backup.ts
 *
 * Requires: DATABASE_URL, MASTER_KEK, R2_* env vars.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { sealWithKek } from "@/lib/crypto";
import { putRaw } from "@/lib/storage";
import { prisma } from "@/lib/db";

async function dump(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const dburl = process.env.DATABASE_URL;
    if (!dburl) return reject(new Error("DATABASE_URL not set"));
    const proc = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", dburl]);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => process.stderr.write(c));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`pg_dump exited ${code}`))));
  });
}

async function main() {
  const start = Date.now();
  const plaintext = await dump();
  const sha256 = createHash("sha256").update(plaintext).digest("hex");
  const sealed = sealWithKek(plaintext);
  const dateStr = new Date().toISOString().slice(0, 10);
  const key = `backups/${dateStr}.dump.enc`;
  const iv = Buffer.from(sealed.ivB64, "base64");
  const tag = Buffer.from(sealed.authTagB64, "base64");
  const body = Buffer.concat([iv, tag, sealed.ciphertext]);
  await putRaw({ key, body });
  await prisma.backupMetadata.upsert({
    where: { date: new Date(dateStr) },
    create: { date: new Date(dateStr), storageKey: key, byteSize: BigInt(body.length), sha256, status: "OK" },
    update: { storageKey: key, byteSize: BigInt(body.length), sha256, status: "OK", errorMessage: null },
  });
  console.log(`Backup OK in ${((Date.now() - start) / 1000).toFixed(1)}s — ${(body.length / 1024 / 1024).toFixed(2)} MB → ${key}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
