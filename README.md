# davidhach.com — link-in-bio

Single-page link-in-bio for David Hach. Static HTML/CSS/JS plus one Vercel
serverless function that pulls the latest YouTube video. Zero build step.

## Stack

- HTML, CSS, vanilla JS — no framework, no bundler.
- Google Fonts: Instrument Sans (display) + Inter (body).
- One Vercel serverless function (`api/latest-video.js`, Node.js).
- Brand tokens from `brand-identity.md` (dark + light modes, never mixed).

## Files to upload

```
code/
├── index.html             # The page
├── styles.css             # Tokens + layout (dark/light scoped via [data-theme])
├── script.js              # Theme toggle + latest-video fetch + newsletter
├── favicon.svg            # DH monogram (also inlined in <head>)
├── robots.txt
├── sitemap.xml
├── vercel.json            # Headers + caching
└── api/
    └── latest-video.js    # Serverless: fetches YouTube channel RSS, returns JSON
```

**Do not upload:** `README.md` and `.claude/` are local-only and won't affect a Vercel deploy if they get pushed, but they aren't needed.

## Deploy to Vercel

1. **Dashboard**: New Project → import this folder. Framework preset: **Other**. Build command: empty. Output directory: `./`.
2. **CLI**:
   ```bash
   npm i -g vercel
   cd code
   vercel
   vercel --prod
   ```
3. Add the `davidhach.com` domain in Vercel → Project → Settings → Domains.

That's it. Vercel auto-detects `api/latest-video.js` as a serverless function and routes `/api/latest-video` to it.

## How features work

### Latest video (auto)
- The page fetches `/api/latest-video` on load.
- The function pulls YouTube's public channel RSS feed (no API key needed) and returns the first entry as JSON.
- **Edge-cached** for 1 hour with 24h stale-while-revalidate, so YouTube isn't hit on every page load.
- Falls back to a placeholder card linking to your channel if the API ever fails.
- Uses the `mqdefault.jpg` thumbnail (native 16:9, no letterboxing).
- Channel ID is hard-coded at the top of `api/latest-video.js`. If you ever change handles, update there.

### Theme toggle
- Top-right icon. Sun = "you're in dark mode, click for light." Moon = vice-versa.
- On first load: respects `prefers-color-scheme` from the OS.
- After a manual choice: saved to `localStorage` and respected on every subsequent visit.
- Hydration runs in `<head>` before paint — no flash of wrong theme.
- Brand-correct: light mode strips the amber accent entirely (per `brand-identity.md`: light mode hierarchy is structural, never chromatic). Dark mode keeps amber for the Subscribe CTA — the one accent moment.

### Newsletter form
- When `KIT_FORM_ACTION` is `null` (default), the form captures emails to `localStorage` and shows a thanks state — useful while you're still hooking up Kit.
- When you're ready, open `script.js` and set:
  ```js
  const KIT_FORM_ACTION = "https://app.kit.com/forms/XXXXXXX/subscriptions";
  ```
  The form will then POST directly to Kit (no proxy, no extra config needed).

## Local preview

The static parts work by just opening `index.html`. To exercise the API locally you need a Node-friendly runtime. Two options:

```bash
# 1. With Vercel CLI (full parity with production)
cd code
vercel dev

# 2. With Node + http-server for static only (API will fall back to placeholder)
cd code
npx http-server -p 4173
```

## Brand notes

- **One accent moment per viewport**: in dark mode, that's the Subscribe CTA. In light mode, accent isn't used at all — buttons are filled near-black.
- Type pairing: Instrument Sans for display, Inter for body. Tracking tightened on display sizes (`-0.015em` to `-0.02em`).
- 8-pt spacing scale, 12px card radius, 999px pill radius.
- No mixed modes inside one artifact — mode-scoped tokens flip together via `[data-theme="light"|"dark"]`.

## What still needs your input (only when you have it)

1. **Kit form action URL** — drop into `script.js`. Until then the form is a friendly stub.
2. **OG image (`og.png`)** — optional. A `1200×630` PNG at the project root will give nice unfurls on Instagram/X/Slack.
