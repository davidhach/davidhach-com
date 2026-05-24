import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { seal, unseal } from "./crypto";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.R2_BUCKET ?? "ledger-statements";

export interface StoredFile {
  storageKey: string;
  ivB64: string;
  authTagB64: string;
  wrappedDekB64: string;
}

/** Encrypt + store. Returns metadata to persist in DB. */
export async function putEncrypted(args: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<StoredFile> {
  const sealed = seal(args.body);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: args.key,
      Body: sealed.ciphertext,
      ContentType: "application/octet-stream", // ciphertext, not the original type
      Metadata: { "original-content-type": args.contentType },
    }),
  );
  return {
    storageKey: args.key,
    ivB64: sealed.ivB64,
    authTagB64: sealed.authTagB64,
    wrappedDekB64: sealed.wrappedDekB64,
  };
}

/** Fetch + decrypt. Returns plaintext buffer. */
export async function getDecrypted(meta: StoredFile): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: meta.storageKey }));
  const ciphertext = Buffer.from(await res.Body!.transformToByteArray());
  return unseal({
    ciphertext,
    ivB64: meta.ivB64,
    authTagB64: meta.authTagB64,
    wrappedDekB64: meta.wrappedDekB64,
  });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Used by backup script — caller has already encrypted with KEK. */
export async function putRaw(args: { key: string; body: Buffer; contentType?: string }): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType ?? "application/octet-stream",
    }),
  );
}

export async function presignGet(key: string, expiresIn = 60): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}
