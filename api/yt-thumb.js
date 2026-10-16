// Proxies a YouTube thumbnail through davidhach.com so the visitor's browser
// never makes a request directly to ytimg.com / Google's CDN. This keeps the
// site GDPR-clean: no IP / User-Agent leakage to Google when viewing the page.
//
// Usage: /api/yt-thumb?id=VIDEO_ID&size=mq|hq|max
//
// Edge-cached aggressively because YouTube thumbnails are stable.

const SIZE_MAP = {
  mq: "mqdefault.jpg",
  hq: "hqdefault.jpg",
  sd: "sddefault.jpg",
  max: "maxresdefault.jpg"
};

// Sharpest first. maxres/sd don't exist for every upload, and maxres in
// particular is often missing for a video's first minutes — exactly when it
// is the newest one on the page.
const FALLBACKS = {
  max: ["max", "sd", "hq", "mq"],
  sd: ["sd", "hq", "mq"],
  hq: ["hq", "mq"],
  mq: ["mq"]
};

// max-age is for the visitor's browser; s-maxage only governs Vercel's edge.
// Without it browsers re-download the (250KB maxres) thumbnail on every visit.
// A given id+size never changes, so a day in the browser is safe.
const LONG_CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800, immutable";
// A fallback must not be cached as if it were the requested size, or the
// blurry stand-in sticks around for a day after maxres appears.
const SHORT_CACHE = "public, max-age=600, s-maxage=600, stale-while-revalidate=3600";

export default async function handler(req, res) {
  const { id, size } = req.query || {};
  const videoId = typeof id === "string" ? id : "";
  // Strict allowlist so we never proxy arbitrary URLs
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).end("invalid id");
    return;
  }
  const requested = typeof size === "string" && SIZE_MAP[size] ? size : "mq";

  try {
    for (const candidate of FALLBACKS[requested]) {
      const r = await fetch(`https://i.ytimg.com/vi/${videoId}/${SIZE_MAP[candidate]}`, {
        headers: { "User-Agent": "davidhach.com-thumb-proxy/1.0" }
      });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
      res.setHeader("Cache-Control", candidate === requested ? LONG_CACHE : SHORT_CACHE);
      res.setHeader("X-Thumb-Size", candidate);
      res.status(200).end(buf);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(404).end("no thumbnail");
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).end("proxy error");
  }
}
