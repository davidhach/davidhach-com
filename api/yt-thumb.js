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
  max: "maxresdefault.jpg",
  sd: "sddefault.jpg"
};

export default async function handler(req, res) {
  const { id, size } = req.query || {};
  const videoId = typeof id === "string" ? id : "";
  // Strict allowlist so we never proxy arbitrary URLs
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).end("invalid id");
    return;
  }
  const file = SIZE_MAP[typeof size === "string" ? size : "mq"] || SIZE_MAP.mq;
  const upstream = `https://i.ytimg.com/vi/${videoId}/${file}`;

  try {
    const r = await fetch(upstream, {
      headers: { "User-Agent": "davidhach.com-thumb-proxy/1.0" }
    });
    if (!r.ok) {
      // Try mqdefault as a fallback if maxres is missing
      if (file !== "mqdefault.jpg") {
        const fb = await fetch(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, {
          headers: { "User-Agent": "davidhach.com-thumb-proxy/1.0" }
        });
        if (fb.ok) {
          const buf = Buffer.from(await fb.arrayBuffer());
          res.setHeader("Content-Type", "image/jpeg");
          res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800, immutable");
          res.status(200).end(buf);
          return;
        }
      }
      res.setHeader("Cache-Control", "no-store");
      res.status(r.status).end("upstream " + r.status);
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    // 1 day at the edge, 7 days stale-while-revalidate
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800, immutable");
    res.status(200).end(buf);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).end("proxy error");
  }
}
