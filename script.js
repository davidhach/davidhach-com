/* David Hach — link-in-bio
 * - Theme toggle (light/dark) with system preference + localStorage persistence.
 * - Latest YouTube video via /api/latest-video (Vercel serverless).
 */
(() => {
  "use strict";

  /* ────────────────────────────────────────────────────────
   * Theme toggle
   * Hydration runs early in <head>; this just wires the click.
   * ──────────────────────────────────────────────────────── */
  const root = document.documentElement;
  const toggle = document.getElementById("theme-toggle");

  const setTheme = (theme, persist) => {
    root.setAttribute("data-theme", theme);
    if (persist) {
      try { localStorage.setItem("dh_theme", theme); } catch (_) {}
    }
    // Update the meta theme-color hint for mobile browser chrome
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute("content", theme === "light" ? "#FAFAF9" : "#0A0A0A");
  };

  if (toggle) {
    toggle.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      setTheme(next, true);
    });
  }

  // Follow system changes only when user hasn't picked one
  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e) => {
      let stored = null;
      try { stored = localStorage.getItem("dh_theme"); } catch (_) {}
      if (stored !== "light" && stored !== "dark") {
        setTheme(e.matches ? "light" : "dark", false);
      }
    };
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
    else if (typeof mql.addListener === "function") mql.addListener(onChange);
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
