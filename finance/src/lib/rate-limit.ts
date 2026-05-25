/**
 * Tiny fixed-window in-memory rate limiter. Sufficient for a single-user app on
 * a single Vercel function instance. Not coordinated across regions — for a
 * multi-user product, swap in Upstash Redis or a Postgres counter.
 *
 * Used to slow brute-force on /api/auth/password/login and /reset/request.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Extract a stable client identifier from a Next.js Request. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || "unknown";
}
