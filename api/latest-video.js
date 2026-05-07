// Vercel serverless function — fetches the latest long-form video for the
// channel by scraping the public channel /videos page (and the watch page for
// the ISO publish date).
//
// Why not RSS? YouTube's https://www.youtube.com/feeds/videos.xml endpoint
// started returning 404 to Vercel's edge as of May 2026 (server-side rate-limit
// or geo-block). The /videos HTML page still returns 200 and embeds the data
// we need inside `var ytInitialData = {…};`.
//
// Shorts filtering is automatic: the /videos tab only lists long-form videos
// in `videoRenderer` blocks; Shorts live in a different structure on the
// /shorts tab. So scraping /videos gives us exactly what we want.
//
// Edge-cached so we don't hammer YouTube on every page load.

const HANDLE = "@david_hach";
const VIDEOS_URL = `https://www.youtube.com/${HANDLE}/videos`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Decode common HTML entities (RSS feeds escape & < > etc).
const decodeEntities = (s) =>
  String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

// Parse `var ytInitialData = {…};</script>` from the channel HTML.
// Returns the parsed object or null. Uses a balanced-brace walker because
// the JSON contains escaped strings that confuse regex.
function extractInitialData(html) {
  const marker = "var ytInitialData =";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  let i = html.indexOf("{", start);
  if (i === -1) return null;
  const begin = i;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(begin, i + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}

// Walk the data tree (iterative, stack-based) and return the first videoRenderer
// that has a videoId + title. Walking depth-first with a stack avoids any
// recursion-limit weirdness on deeply-nested objects.
function pickFirstVideo(initialData) {
  const stack = [initialData];
  while (stack.length) {
    const node = stack.pop();
    if (node == null) continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    if (typeof node === "object") {
      if (node.videoRenderer && typeof node.videoRenderer === "object") {
        const v = node.videoRenderer;
        const titleRuns = v.title && v.title.runs;
        const title =
          (titleRuns && titleRuns[0] && titleRuns[0].text) ||
          (v.title && v.title.simpleText) ||
          null;
        if (v.videoId && title) {
          return { videoId: v.videoId, title };
        }
      }
      for (const key of Object.keys(node)) stack.push(node[key]);
    }
  }
  return null;
}

async function fetchPublishDate(videoId) {
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }
    });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/"publishDate":"([^"]+)"/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

// Try several public endpoints in order. First one that yields a video wins.
async function tryChannelVideosPage() {
  const r = await fetch(VIDEOS_URL, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }
  });
  if (!r.ok) return null;
  const html = await r.text();
  const data = extractInitialData(html);
  if (!data) return null;
  return pickFirstVideo(data);
}

// rss2json.com is a free, public RSS-to-JSON proxy. It bypasses the YouTube
// edge bot detection that 404s our direct feed fetch from Vercel IPs.
// We filter Shorts client-side because the RSS feed lists everything.
async function tryRss2Json() {
  const channelId = "UCekAN8pgYfwFeujU5dRr4ww"; // @david_hach
  const feed = encodeURIComponent(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
  );
  const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${feed}`);
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  if (!data || data.status !== "ok" || !Array.isArray(data.items)) return null;
  for (const item of data.items) {
    const link = String(item.link || "");
    if (link.includes("/shorts/")) continue; // skip Shorts
    const m = link.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    const videoId = m ? m[1] : null;
    if (!videoId || !item.title) continue;
    return {
      videoId,
      title: decodeEntities(item.title),
      publishedAt: item.pubDate
        ? new Date(item.pubDate).toISOString()
        : null
    };
  }
  return null;
}

export default async function handler(req, res) {
  const debug = req.query && req.query.debug === "1";
  const trace = [];

  try {
    // 1) Channel /videos page (works from most IPs, but Vercel egress sometimes
    //    gets a stripped page).
    let video = null;
    try {
      video = await tryChannelVideosPage();
      trace.push({ source: "channel_page", ok: !!video });
    } catch (e) {
      trace.push({ source: "channel_page", err: String(e.message || e) });
    }

    // 2) rss2json (public proxy) — robust fallback.
    if (!video) {
      try {
        video = await tryRss2Json();
        trace.push({ source: "rss2json", ok: !!video });
      } catch (e) {
        trace.push({ source: "rss2json", err: String(e.message || e) });
      }
    }

    if (!video) throw new Error("No long-form videos found via any source");

    const publishedAt =
      video.publishedAt || (await fetchPublishDate(video.videoId));

    const payload = {
      videoId: video.videoId,
      title: video.title,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      author: "David Hach",
      publishedAt,
      // Proxied through our domain so the visitor's browser never calls
      // Google / YouTube CDNs (GDPR-clean).
      thumbnail: `/api/yt-thumb?id=${encodeURIComponent(video.videoId)}&size=mq`,
      thumbnailHigh: `/api/yt-thumb?id=${encodeURIComponent(video.videoId)}&size=max`
    };

    if (debug) payload._trace = trace;

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).json(payload);
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({
      error: "upstream_failed",
      message: String((err && err.message) || err),
      trace: debug ? trace : undefined
    });
  }
}
