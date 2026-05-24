import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function err(message: string, status = 400, extra?: object) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  try {
    return schema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) throw new HttpError(422, "Validation failed", { issues: e.errors });
    throw e;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: object) {
    super(message);
  }
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return err(e.message, e.status, e.extra);
    const status = (e as { status?: number })?.status;
    if (status === 401) return err("Unauthorized", 401);
    console.error(e);
    return err("Internal server error", 500);
  }
}
