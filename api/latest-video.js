// Vercel serverless function — returns the channel's latest LONG-FORM video.
//
// Source order (first one that yields a video wins):
//   1. YouTube's public RSS feed. Keyless, and the only source that labels
//      Shorts unambiguously: the <link rel="alternate"> href is
//      .../shorts/<id> for a Short and .../watch?v=<id> for long-form, so
//      filtering is exact rather than heuristic.
//   2. YouTube Data API v3, used only when YOUTUBE_API_KEY is set. Immune to
//      the IP blocking that hits the scraping paths; costs 3 quota units per
//      miss, which behind the 1h edge cache is nothing.
//   3. Channel /videos page scrape. Last resort — YouTube has been serving
//      Vercel's egress a stripped page, so this usually fails from prod.
//
// History: this endpoint has been through rss2json (the free proxy now
// returns "Feed could not be converted" — it is blocked upstream too) and a
// scrape-only design. Both failed closed and pinned the card to a stale
// placeholder. Hence RSS first, with the API as the durable escape hatch.
//
// Edge-cached so we don't hammer upstream on every page load.

const HANDLE = "@david_hach";
const CHANNEL_ID = "UCekAN8pgYfwFeujU5dRr4ww"; // @david_hach
const VIDEOS_URL = `https://www.youtube.com/${HANDLE}/videos`;
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Anything at or under this is a Short (YouTube's own cutoff since Oct 2024).
// Only used on the API path; RSS labels Shorts directly.
const SHORT_MAX_SECONDS = 180;

// Decode common XML/HTML entities (feeds escape & < > etc).
const decodeEntities = (s) =>
  String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&"); // last, so &amp;lt; doesn't become <

/* ── Source 1: public RSS feed ─────────────────────────── */

// The feed is small (~15KB, 8 entries) and regular enough to parse without a
// dependency. We read each <entry> in document order — YouTube returns them
// newest first — and take the first whose alternate link is not a Short.
function pickFromRss(xml) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const entry of entries) {
    const link = (entry.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/) || [])[1] || "";
    if (link.includes("/shorts/")) continue; // Short — skip

    const videoId = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const rawTitle = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    if (!videoId || !rawTitle) continue;

    const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1];
    return {
      videoId,
      title: decodeEntities(rawTitle).trim(),
      publishedAt: published ? new Date(published).toISOString() : null
    };
  }
  return null;
}

async function tryRssFeed() {
  const r = await fetch(RSS_URL, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }
  });
  if (!r.ok) return null;
  const xml = await r.text();
  if (!xml.includes("<entry>")) return null;
  return pickFromRss(xml);
}

/* ── Source 2: YouTube Data API v3 (needs YOUTUBE_API_KEY) ─ */

// PT1H2M3S → seconds
function isoDurationToSeconds(iso) {
  const m = String(iso).match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

async function tryDataApi(key) {
  const base = "https://www.googleapis.com/youtube/v3";

  // Uploads playlist for the channel.
  const ch = await getJson(
    `${base}/channels?part=contentDetails&id=${CHANNEL_ID}&key=${key}`
  );
  const uploads =
    ch &&
    ch.items &&
    ch.items[0] &&
    ch.items[0].contentDetails &&
    ch.items[0].contentDetails.relatedPlaylists &&
    ch.items[0].contentDetails.relatedPlaylists.uploads;
  if (!uploads) return null;

  // Newest uploads (Shorts included — filtered by duration below).
  const list = await getJson(
    `${base}/playlistItems?part=snippet&playlistId=${uploads}&maxResults=10&key=${key}`
  );
  const items = (list && list.items) || [];
  const ids = items
    .map((i) => i.snippet && i.snippet.resourceId && i.snippet.resourceId.videoId)
    .filter(Boolean);
  if (!ids.length) return null;

  // One batched call for durations.
  const details = await getJson(
    `${base}/videos?part=contentDetails&id=${ids.join(",")}&key=${key}`
  );
  const longEnough = new Set(
    ((details && details.items) || [])
      .filter((v) => {
        const secs = isoDurationToSeconds(
          v.contentDetails && v.contentDetails.duration
        );
        return secs != null && secs > SHORT_MAX_SECONDS;
      })
      .map((v) => v.id)
  );

  for (const item of items) {
    const videoId =
      item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId;
    if (!videoId || !longEnough.has(videoId)) continue;
    return {
      videoId,
      title: decodeEntities(item.snippet.title || "").trim(),
      publishedAt: item.snippet.publishedAt
        ? new Date(item.snippet.publishedAt).toISOString()
        : null
    };
  }
  return null;
}

/* ── Source 3: channel /videos page scrape ─────────────── */

// Parse `var ytInitialData = {…};</script>` from the channel HTML.
// Balanced-brace walker because the JSON contains escaped strings that
// confuse a regex.
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

// Depth-first walk for the first videoRenderer with a videoId + title. The
// /videos tab lists long-form only, so no Shorts filtering is needed here.
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
        if (v.videoId && title) return { videoId: v.videoId, title };
      }
      for (const key of Object.keys(node)) stack.push(node[key]);
    }
  }
  return null;
}

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

// Only needed when a source gave us a video but no date (the scrape path).
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

/* ── Handler ───────────────────────────────────────────── */

export default async function handler(req, res) {
  const debug = req.query && req.query.debug === "1";
  const trace = [];
  const apiKey = process.env.YOUTUBE_API_KEY;

  const sources = [
    ["rss", tryRssFeed],
    ...(apiKey ? [["data_api", () => tryDataApi(apiKey)]] : []),
    ["channel_page", tryChannelVideosPage]
  ];

  try {
    let video = null;
    let winner = null;

    for (const [name, fn] of sources) {
      if (video) break;
      try {
        video = await fn();
        trace.push({ source: name, ok: !!video });
        if (video) winner = name;
      } catch (e) {
        trace.push({ source: name, err: String((e && e.message) || e) });
      }
    }

    if (!video) {
      // Surface whether the API path was even available — the most common
      // reason this endpoint stays down is a missing YOUTUBE_API_KEY while
      // YouTube is blocking the keyless paths from Vercel egress.
      trace.push({ note: apiKey ? "api_key_present" : "api_key_missing" });
      throw new Error("No long-form videos found via any source");
    }

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

    if (debug) {
      payload._trace = trace;
      payload._source = winner;
    }

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
