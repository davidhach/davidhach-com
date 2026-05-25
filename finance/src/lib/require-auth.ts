/**
 * Wrapper used by API routes that have to call requireUserId() but don't
 * use the heavier `handle()` helper. Turns the auth-throw into a clean 401
 * response instead of leaking a 500. Use like:
 *
 *   export const POST = withAuth(async (userId, req) => { ... });
 */
import { NextResponse } from "next/server";
import { requireUserId } from "./auth";

type Handler = (userId: string, req: Request) => Promise<Response>;

export function withAuth(fn: Handler) {
  return async (req: Request) => {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return fn(userId, req);
  };
}
