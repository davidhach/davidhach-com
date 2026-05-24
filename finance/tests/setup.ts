import { randomBytes } from "node:crypto";

// Deterministic KEK so seal/unseal works in tests without a real env.
if (!process.env.MASTER_KEK) {
  process.env.MASTER_KEK = randomBytes(32).toString("base64");
}
