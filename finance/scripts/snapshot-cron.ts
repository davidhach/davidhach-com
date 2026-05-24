/** Manual run of the monthly snapshot job, useful for backfills. */
import { prisma } from "@/lib/db";
import { takeSnapshot } from "@/lib/net-worth";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  for (const u of users) {
    try { await takeSnapshot(u.id); console.log("snapshot ok", u.email); }
    catch (e) { console.error("snapshot failed", u.email, e); }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
