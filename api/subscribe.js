// Server-side proxy for Kit (ConvertKit) subscriptions.
// Visitor's browser POSTs here → we POST to Kit V3 server-to-server.
// Visitor's IP / browser data never reaches Kit directly. GDPR-clean data flow.
//
// Why V3 (not V4): the V3 form-subscribe endpoint creates subscribers in
// `inactive` state and Kit sends a confirmation email. That is the
// double-opt-in flow GDPR requires. The V4 `/v4/subscribers` endpoint
// creates subscribers as `active` immediately, which would bypass consent
// confirmation. Stick with V3 for newsletter signups.
//
// Required env var on Vercel:
//   KIT_API_KEY      The V3 "API Key" from
//                    https://app.kit.com/account_settings/developer_settings
//                    (NOT the API Secret. Not the V4 "kit_..." token.)
//
// Optional env vars:
//   KIT_FORM_ID      Defaults to 9405300

const FORM_ID = process.env.KIT_FORM_ID || "9405300";

const json = (res, status, body) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).end(JSON.stringify(body));
};

const isValidEmail = (v) =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const email = (body && body.email && String(body.email)) || "";
  const consent = !!(body && body.consent);

  if (!isValidEmail(email)) return json(res, 400, { error: "invalid_email" });
  if (!consent) return json(res, 400, { error: "consent_required" });

  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) return json(res, 503, { error: "kit_api_key_missing" });

  // Soft-warn (not block) if a V4 token is mistakenly used here — it'll 401
  // on V3 anyway, but the error message is clearer.
  if (apiKey.startsWith("kit_")) {
    return json(res, 503, {
      error: "wrong_kit_key_type",
      message: "KIT_API_KEY must be the V3 API Key, not the V4 token (which would skip double-opt-in)."
    });
  }

  try {
    const r = await fetch(
      `https://api.convertkit.com/v3/forms/${FORM_ID}/subscribe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, email })
      }
    );
    const data = await r.json().catch(() => ({}));

    if (r.ok) {
      // Kit creates subscriber as `inactive` and sends a confirmation email.
      // Subscriber becomes `active` only after they click the link.
      return json(res, 200, { ok: true, status: "pending_confirmation" });
    }
    if (r.status === 422) {
      return json(res, 200, { ok: true, status: "already_subscribed" });
    }
    return json(res, 502, {
      error: "kit_failed",
      status: r.status,
      detail: data && (data.message || data.error) || null
    });
  } catch (err) {
    return json(res, 502, { error: "network", message: String(err && err.message || err) });
  }
}
