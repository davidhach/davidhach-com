/**
 * Bounded fetch — every external HTTP call MUST go through here. A hung
 * upstream (Stooq, Yahoo, OpenFIGI) can otherwise block a Vercel function for
 * its entire timeout, freezing the user's form. Default 3s; callers can
 * override.
 *
 * Returns the Response on success, or throws an Error("timeout") / network
 * error so callers can convert into a clean null/failure.
 */
export interface FetchTimeoutInit extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(input: string | URL | Request, init: FetchTimeoutInit = {}): Promise<Response> {
  const { timeoutMs = 3000, signal: externalSignal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  // Honor an externally-passed signal too (compose abort).
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener("abort", () => controller.abort(externalSignal.reason), { once: true });
  }
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
