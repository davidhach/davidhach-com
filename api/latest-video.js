// Vercel serverless function — fetches the latest video for @david_hach via
// YouTube's public RSS feed. No API key, no build step.
// Edge-cached so YouTube isn't hit on every page load.

const CHANNEL_ID = "UCekAN8pgYfwFeujU5dRr4ww"; // @david_hach
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const pick = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return m ? decodeEntities(m[1]) : null;
};

const pickAttr = (xml, tag, attr) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`));
  return m ? decodeEntities(m[1]) : null;
};

export default async function handler(req, res) {
  try {
    const r = await fetch(FEED_URL, {
      headers: { "User-Agent": "davidhach.com/1.0 (+https://davidhach.com)" }
    });
    if (!r.ok) throw new Error(`Feed responded ${r.status}`);
    const xml = await r.text();

    // Walk all entries; skip Shorts (their <link href> contains "/shorts/").
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    if (entries.length === 0) throw new Error("No entries in feed");

    let chosen = null;
    for (const entry of entries) {
      const link = pickAttr(entry, "link", "href") || "";
      if (link.includes("/shorts/")) continue;
      chosen = entry;
      break;
    }
    if (!chosen) throw new Error("No long-form videos in recent feed");

    const videoId = pick(chosen, "yt:videoId");
    const title = pick(chosen, "title");
    const published = pick(chosen, "published");
    const author = pick(chosen, "name") || "David Hach";
    const url =
      pickAttr(chosen, "link", "href") ||
      (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

    if (!videoId || !title || !url) throw new Error("Missing fields in entry");

    const payload = {
      videoId,
      title,
      url,
      author,
      publishedAt: published,
      // Thumbnails are served through our own proxy so the visitor's browser
      // never makes a request to Google / YouTube CDNs (GDPR-clean).
      thumbnail: `/api/yt-thumb?id=${encodeURIComponent(videoId)}&size=mq`,
      thumbnailHigh: `/api/yt-thumb?id=${encodeURIComponent(videoId)}&size=max`
    };

    // Edge-cache for 1h, serve stale up to 24h while revalidating
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).json(payload);
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "upstream_failed", message: String(err && err.message || err) });
  }
}
