#!/usr/bin/env bash
# Restore a physical backup created by scripts/backup.ts.
#   Usage: ./scripts/restore.sh 2026-05-23
set -euo pipefail

DATE="${1:?usage: restore.sh YYYY-MM-DD}"
KEY="backups/${DATE}.dump.enc"
TMP="$(mktemp -d)"

echo "Downloading ${KEY}…"
aws s3 cp "s3://${R2_BUCKET}/${KEY}" "${TMP}/blob.enc" \
  --endpoint-url "${R2_ENDPOINT}"

echo "Decrypting…"
node -e "
  const fs = require('fs');
  const crypto = require('crypto');
  const kek = Buffer.from(process.env.MASTER_KEK, 'base64');
  const buf = fs.readFileSync('${TMP}/blob.enc');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  d.setAuthTag(tag);
  fs.writeFileSync('${TMP}/dump.bin', Buffer.concat([d.update(ct), d.final()]));
"

echo "Restoring with pg_restore…"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "${DATABASE_URL}" "${TMP}/dump.bin"

rm -rf "${TMP}"
echo "Done."
