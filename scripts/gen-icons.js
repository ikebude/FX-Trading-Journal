/**
 * gen-icons.js — Generates app icon assets required by electron-builder.
 *
 * Outputs:
 *   build/icon.png     — 256×256 source icon
 *   build/icon.ico     — Windows icon (converted from PNG via sharp)
 *   build/tray.png     — 16×16 tray icon (white on transparent)
 *
 * Run: node scripts/gen-icons.js
 * Auto-run: npm run prepackage:win
 */

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, '..', 'build');

// ─── Colour palette ────────────────────────────────────────────
const PRIMARY = { r: 99, g: 102, b: 241, alpha: 1 };   // indigo-500
const BG      = { r: 15,  g: 23,  b: 42,  alpha: 1 };  // slate-900

// ─── 256×256 icon PNG ──────────────────────────────────────────
async function genIcon256() {
  // Rounded square background + a simple "L" trend-line glyph as SVG overlay
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" rx="48" fill="#0f172a"/>
    <polyline
      points="40,200 80,160 120,180 160,100 216,56"
      fill="none" stroke="#6366f1" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(buildDir, 'icon.png'));

  console.log('  build/icon.png — done');
}

// ─── Windows ICO (256×256 + 32×32) ────────────────────────────
async function genIco() {
  // sharp can output ICO on Windows via the pngquant pipeline
  // We generate two sizes and combine into a single ICO manually.
  const png256 = await sharp(join(buildDir, 'icon.png')).resize(256, 256).png().toBuffer();
  const png32  = await sharp(join(buildDir, 'icon.png')).resize(32,  32).png().toBuffer();
  const png16  = await sharp(join(buildDir, 'icon.png')).resize(16,  16).png().toBuffer();

  // Build ICO file manually (MS ICO format with PNG compression)
  const images = [png256, png32, png16];
  const sizes  = [256,    32,    16];

  const headerSize = 6;
  const dirEntrySize = 16;
  const directorySize = headerSize + images.length * dirEntrySize;

  // Calculate offsets
  let offset = directorySize;
  const offsets = images.map((img) => {
    const off = offset;
    offset += img.length;
    return off;
  });

  const buf = Buffer.alloc(directorySize + images.reduce((s, i) => s + i.length, 0));
  let pos = 0;

  // ICONDIR header
  buf.writeUInt16LE(0, pos); pos += 2;       // reserved
  buf.writeUInt16LE(1, pos); pos += 2;       // type: 1 = icon
  buf.writeUInt16LE(images.length, pos); pos += 2;

  // ICONDIRENTRY for each image
  for (let i = 0; i < images.length; i++) {
    const sz = sizes[i] === 256 ? 0 : sizes[i]; // 256 is stored as 0
    buf.writeUInt8(sz, pos++);                  // width
    buf.writeUInt8(sz, pos++);                  // height
    buf.writeUInt8(0,  pos++);                  // colour count (0 = no palette)
    buf.writeUInt8(0,  pos++);                  // reserved
    buf.writeUInt16LE(1, pos); pos += 2;         // colour planes
    buf.writeUInt16LE(32, pos); pos += 2;        // bits per pixel
    buf.writeUInt32LE(images[i].length, pos); pos += 4;
    buf.writeUInt32LE(offsets[i], pos); pos += 4;
  }

  // Image data
  for (const img of images) {
    img.copy(buf, pos);
    pos += img.length;
  }

  writeFileSync(join(buildDir, 'icon.ico'), buf);
  console.log('  build/icon.ico — done');
}

// ─── 16×16 tray icon (white glyph) ────────────────────────────
async function genTray() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <polyline
      points="2,13 5,10 8,11 11,6 14,3"
      fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  await sharp(Buffer.from(svg))
    .resize(16, 16)
    .png()
    .toFile(join(buildDir, 'tray.png'));

  console.log('  build/tray.png — done');
}

// ─── Main ──────────────────────────────────────────────────────
(async () => {
  console.log('Generating icons…');
  try {
    await genIcon256();
    await genIco();
    await genTray();
    console.log('All icons generated successfully.');
  } catch (err) {
    console.error('Icon generation failed:', err.message);
    process.exit(1);
  }
})();
