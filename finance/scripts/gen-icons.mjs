#!/usr/bin/env node
/**
 * One-shot generator for PWA icons.
 * Reads public/icon.svg and writes 192px and 512px PNGs alongside it.
 * Run with: npx tsx scripts/gen-icons.mjs   (or: node scripts/gen-icons.mjs)
 * `sharp` is a peer/transient dep; install with `npm i --no-save sharp` first.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");
const svg = readFileSync(join(pub, "icon.svg"));

for (const size of [192, 512]) {
  const png = await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(pub, `icon-${size}.png`), png);
  console.log(`wrote public/icon-${size}.png (${png.length} bytes)`);
}

// Maskable: same image with extra safe-area padding so launchers can clip it.
const maskable = await sharp(svg, { density: 384 })
  .resize(384, 384) // shrink the content
  .extend({ top: 64, bottom: 64, left: 64, right: 64, background: "#0f172a" })
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(join(pub, "icon-maskable-512.png"), maskable);
console.log(`wrote public/icon-maskable-512.png (${maskable.length} bytes)`);

// Apple touch icon (180px is the standard Safari requests).
const apple = await sharp(svg, { density: 384 }).resize(180, 180).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(join(pub, "apple-touch-icon.png"), apple);
console.log(`wrote public/apple-touch-icon.png (${apple.length} bytes)`);
