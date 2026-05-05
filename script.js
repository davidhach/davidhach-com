/* David Hach — link-in-bio
 * - Theme toggle (light/dark) with system preference + localStorage persistence.
 * - Latest YouTube video fetch via /api/latest-video (Vercel serverless).
 * - Newsletter form: progressive enhancement (set KIT_FORM_ACTION when ready).
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
   * ──────────────────────────────────────────────────────── */
  const card = document.getElementById("latest-video");

  const formatRelative = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    const days = Math.floor(diff / 86400);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return days + " days ago";
    if (days < 30) return Math.floor(days / 7) + " weeks ago";
    if (days < 365) return Math.floor(days / 30) + " months ago";
    return Math.floor(days / 365) + " years ago";
  };

  const renderVideo = (data) => {
    if (!card || !data || !data.videoId) return;
    const titleEl = card.querySelector("[data-title]");
    const thumbEl = card.querySelector("[data-thumb]");
    const metaEl = card.querySelector("[data-meta]");

    card.href = data.url;
    if (titleEl) titleEl.textContent = data.title;
    if (metaEl) {
      const rel = formatRelative(data.publishedAt);
      metaEl.textContent = (rel ? rel + " · " : "") + "@david_hach";
    }
    if (thumbEl) {
      const img = new Image();
      img.alt = "";
      img.loading = "eager";
      img.decoding = "async";
      img.width = 144;
      img.height = 81;
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        thumbEl.innerHTML = "";
        thumbEl.appendChild(img);
      };
      img.onerror = () => {
        // Try the alternate thumbnail size; otherwise keep placeholder
        if (data.thumbnailHigh && img.src !== data.thumbnailHigh) {
          img.src = data.thumbnailHigh;
        }
      };
      img.src = data.thumbnail;
    }
    card.dataset.state = "ready";
  };

  const loadLatestVideo = async () => {
    if (!card) return;
    try {
      const res = await fetch("/api/latest-video", {
        headers: { Accept: "application/json" }
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data && data.videoId) {
        renderVideo(data);
      } else {
        card.dataset.state = "fallback";
      }
    } catch (e) {
      // Local file:// preview, dev without serverless, or transient failure.
      // Keep the placeholder; card already links to the channel.
      card.dataset.state = "fallback";
    }
  };

  // Only fetch when served over http(s); skip on file:// to avoid noisy errors.
  if (location.protocol === "http:" || location.protocol === "https:") {
    loadLatestVideo();
  } else if (card) {
    card.dataset.state = "fallback";
  }

  /* ────────────────────────────────────────────────────────
   * Newsletter form
   * Submits to /api/subscribe — our server-side Kit proxy. The browser never
   * contacts Kit directly, so no third-party request leaks the visitor's IP.
   * Requires explicit consent (GDPR Art. 6(1)(a)).
   * ──────────────────────────────────────────────────────── */
  const form = document.getElementById("newsletter");
  if (!form) return;

  const input = form.querySelector(".lab-input");
  const submit = form.querySelector(".lab-submit");
  const consent = form.querySelector(".lab-consent input[type=checkbox]");
  const status = document.querySelector(".lab-status");

  const setStatus = (msg, state) => {
    if (!status) return;
    status.textContent = msg || "";
    status.hidden = !msg;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  };

  const isValidEmail = (v) =>
    typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = ((input && input.value) || "").trim();
    const hasConsent = !!(consent && consent.checked);

    if (!isValidEmail(email)) {
      setStatus("Please enter a valid email.", "error");
      input && input.focus();
      return;
    }
    if (!hasConsent) {
      setStatus("Please confirm consent to continue.", "error");
      const wrap = consent && consent.closest(".lab-consent");
      if (wrap) {
        wrap.classList.remove("is-missing");
        // Force reflow so the animation re-triggers on repeat clicks
        void wrap.offsetWidth;
        wrap.classList.add("is-missing");
      }
      consent && consent.focus();
      return;
    }
    // Clear any previous "missing consent" highlight as soon as it's checked
    const wrap = consent && consent.closest(".lab-consent");
    if (wrap) wrap.classList.remove("is-missing");

    if (submit) submit.disabled = true;
    setStatus("Subscribing…");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: true })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        if (data.status === "already_subscribed") {
          setStatus("You're already on the list.", "success");
        } else {
          setStatus("Thanks — check your inbox to confirm.", "success");
        }
        form.reset();
      } else if (data.error === "consent_required") {
        setStatus("Please confirm consent to continue.", "error");
      } else if (data.error === "kit_api_key_missing") {
        setStatus("Newsletter not yet configured.", "error");
      } else if (data.error === "invalid_email") {
        setStatus("Please enter a valid email.", "error");
      } else {
        setStatus("Something went wrong. Try again in a moment.", "error");
      }
    } catch (err) {
      setStatus("Something went wrong. Try again in a moment.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  });
})();
