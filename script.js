/* David Hach — link-in-bio
 * - Theme follows the system light/dark setting.
 * - Latest YouTube video via /api/latest-video (Vercel serverless).
 */
(() => {
  "use strict";

  /* ────────────────────────────────────────────────────────
   * Theme follows the system setting
   * The <head> script sets it before paint; this keeps it in sync if the
   * visitor's system switches while the page is open (e.g. auto at sunset).
   * ──────────────────────────────────────────────────────── */
  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const sync = (e) =>
      document.documentElement.setAttribute("data-theme", e.matches ? "light" : "dark");
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", sync);
    else if (typeof mql.addListener === "function") mql.addListener(sync);
  }

  /* ────────────────────────────────────────────────────────
   * Latest YouTube video
   * The API is the source of truth. The markup carries a fallback video
   * (href, title, data-video-id) used only if the API can't be reached, so
   * the frame never stays empty.
   * ──────────────────────────────────────────────────────── */
  const link = document.getElementById("latest-video");
  if (!link) return;

  const frame = link.querySelector("[data-thumb]");
  const titleEl = link.querySelector("[data-title]");

  const thumbUrl = (id, size) =>
    "/api/yt-thumb?id=" + encodeURIComponent(id) + "&size=" + size;

  // Try each source in turn; reveal the image only once it has decoded.
  const showThumb = (sources) => {
    if (!frame || !sources.length) return;
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    let i = 0;
    img.onload = () => {
      const prev = frame.querySelector("img");
      if (prev) prev.remove();
      frame.insertBefore(img, frame.firstChild);
      // Force a style flush so the opacity transition runs. Not rAF: hidden
      // tabs and some in-app browsers stall it, which would leave the
      // thumbnail invisible.
      void img.offsetWidth;
      img.classList.add("is-loaded");
      link.dataset.state = "ready";
    };
    img.onerror = () => {
      i += 1;
      if (i < sources.length) img.src = sources[i];
      else link.dataset.state = "fallback";
    };
    img.src = sources[0];
  };

  const useFallback = () => {
    const id = link.dataset.videoId;
    if (id) showThumb([thumbUrl(id, "max"), thumbUrl(id, "hq")]);
    else link.dataset.state = "fallback";
  };

  const loadLatestVideo = async () => {
    try {
      const res = await fetch("/api/latest-video", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data || !data.videoId) throw new Error("no video");

      link.href = data.url;
      link.dataset.videoId = data.videoId;
      if (titleEl && data.title) titleEl.textContent = data.title;
      showThumb([data.thumbnail, data.thumbnailFallback].filter(Boolean));
    } catch (_) {
      // Dev without serverless, or a transient failure: show the fallback video.
      useFallback();
    }
  };

  // Only fetch when served over http(s); skip on file:// to avoid noisy errors.
  if (location.protocol === "http:" || location.protocol === "https:") {
    loadLatestVideo();
  } else {
    useFallback();
  }
})();
