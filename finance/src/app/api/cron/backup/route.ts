/**
 * Application-level "logical" backup endpoint (complement to the pg_dump script).
 * Walks every user and exports their tables as a single encrypted JSON blob to R2.
 * Useful when the host can't run pg_dump (e.g. serverless-only deploys).
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sealWithKek } from "@/lib/crypto";
import { putRaw } from "@/lib/storage";
import { createHash } from "node:crypto";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  const dump = {
    exportedAt: new Date().toISOString(),
    users: await Promise.all(users.map(async (u) => ({
      user: await prisma.user.findUnique({ where: { id: u.id } }),
      entities: await prisma.entity.findMany({ where: { userId: u.id } }),
      accounts: await prisma.finAccount.findMany({ where: { userId: u.id } }),
      assets: await prisma.asset.findMany({ where: { userId: u.id } }),
      liabilities: await prisma.liability.findMany({ where: { userId: u.id } }),
      valuations: await prisma.valuation.findMany({ where: { userId: u.id } }),
      snapshots: await prisma.snapshot.findMany({ where: { userId: u.id } }),
      transactions: await prisma.transaction.findMany({ where: { userId: u.id } }),
      categories: await prisma.category.findMany({ where: { userId: u.id } }),
      tags: await prisma.tag.findMany({ where: { userId: u.id } }),
      uploads: await prisma.statementUpload.findMany({ where: { userId: u.id } }),
      extractions: await prisma.ocrExtraction.findMany({ where: { userId: u.id } }),
      goals: await prisma.goal.findMany({ where: { userId: u.id } }),
    }))),
  };

  const plaintext = Buffer.from(JSON.stringify(dump, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  const sha256 = createHash("sha256").update(plaintext).digest("hex");
  const sealed = sealWithKek(plaintext);

  const dateStr = new Date().toISOString().slice(0, 10);
  const key = `backups/${dateStr}.json.enc`;
  // Prepend iv (12B) + authTag (16B) so a single object is self-contained.
  const ivBuf = Buffer.from(sealed.ivB64, "base64");
  const tagBuf = Buffer.from(sealed.authTagB64, "base64");
  const body = Buffer.concat([ivBuf, tagBuf, sealed.ciphertext]);
  await putRaw({ key, body, contentType: "application/octet-stream" });

  await prisma.backupMetadata.upsert({
    where: { date: new Date(dateStr) },
    create: { date: new Date(dateStr), storageKey: key, byteSize: BigInt(body.length), sha256, status: "OK" },
    update: { storageKey: key, byteSize: BigInt(body.length), sha256, status: "OK", errorMessage: null },
  });

  return Response.json({ ok: true, key, bytes: body.length, sha256 });
}
