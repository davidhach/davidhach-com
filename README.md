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
├── script.js              # System theme sync + latest-video fetch
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

### Theme (follows the system)
- No toggle: the page follows the visitor's system light/dark setting, set in `<head>` before paint (no flash) and kept in sync live if the system switches while the page is open.
- The old toggle saved a manual choice under `localStorage.dh_theme`; the page now ignores and deletes it so nobody stays pinned to a stale choice.
- Brand-correct: the page is monochrome in both modes. `--accent` is off-white in dark mode and near-black in light mode — i.e. the accent *is* the primary text color either way, so hierarchy is structural, never chromatic (per `brand-identity.md`). The Subscribe CTA is a filled block of that accent rather than a hue.

### One screen, no scroll
- The page is sized to the viewport (`100dvh`): topbar and footer are fixed-height, the content between them is centred, and the latest-video frame always spans the full column (same width as the CLAD card) and is the element that gives way: on short screens its height shrinks from 16:9 toward 3:1 and the thumbnail is cropped to fill, instead of the page scrolling.
- Verified scroll-free from 360×640 up, including iPhone Safari's visible height (~390×664) and Instagram's in-app browser (~393×740). Below 500px tall the page falls back to normal scrolling rather than crushing the thumbnail.

### Newsletter
- The signup box was removed from the page. `api/subscribe.js` and the Kit section of `privacy.html` stay: Kit still holds the data of anyone who subscribed earlier, so the notice remains accurate for them.

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

- **Monochrome page, one chroma moment**: no hue is used anywhere in the page chrome — in dark mode buttons are filled off-white, in light mode filled near-black. The CLAD banner's lime (`#D2FF03`) is the only chroma on the page, and it's a brand artifact, not a theme colour: the banner renders identically in both modes.
- **Approved CLAD exception**: the banner's ground is `#282C20`, which the CLAD brand book reserves for footers only. Using it here is a deliberate, user-approved exception — do not "correct" it back later.
- Type pairing: Instrument Sans for display, Inter for body. Tracking tightened on display sizes (`-0.015em` to `-0.02em`).
- 8-pt spacing scale, 12px card radius, 999px pill radius.
- No mixed modes inside one artifact — mode-scoped tokens flip together via `[data-theme="light"|"dark"]`.

## What still needs your input (only when you have it)

1. **Kit form action URL** — drop into `script.js`. Until then the form is a friendly stub.
2. **OG image (`og.png`)** — optional. A `1200×630` PNG at the project root will give nice unfurls on Instagram/X/Slack.
