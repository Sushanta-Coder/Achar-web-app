import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generates the static images in `public/` that cannot be committed as text.
 *
 * These are placeholders with a job: `index.html` links an apple-touch-icon and `seo.js`
 * falls back to an Open Graph image, and a link that 404s is worse than a plain one. Rather
 * than commit two opaque binaries nobody can edit, the shapes are drawn here in a few lines
 * of pixel maths and a minimal PNG encoder, so a designer can replace the real files later
 * and a developer can regenerate them with `npm run assets`.
 *
 * No dependency: `zlib` is in Node, and an uncompressed-filter RGB PNG is about thirty lines.
 */

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BRAND = [0x8f, 0x1d, 0x14]; // brand-700
const BRAND_DARK = [0x64, 0x1c, 0x17]; // brand-900
const MUSTARD = [0xe6, 0xc3, 0x4a]; // mustard-400
const CREAM = [0xfa, 0xf7, 0xf2]; // cream-100
const LEAF = [0x4a, 0x8a, 0x42]; // leaf-500

// --- PNG encoding ------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** `paint(x, y)` returns an [r, g, b] triple. */
function png(width, height, paint) {
  // One filter byte (0 = none) per scanline, then three bytes per pixel.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0;
    at += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      at += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Shape helpers -----------------------------------------------------------

const inRect = (x, y, left, top, right, bottom) =>
  x >= left && x <= right && y >= top && y <= bottom;

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** A jar: shoulders, body, lid. Coordinates are fractions of the tile size. */
function jar(x, y, size, cx, top) {
  const u = size / 100;
  const bodyTop = top + 22 * u;
  const bodyBottom = top + 78 * u;
  const halfWidth = 24 * u;

  const lid = inRect(x, y, cx - 18 * u, top, cx + 18 * u, top + 10 * u);
  const neck = inRect(x, y, cx - 13 * u, top + 10 * u, cx + 13 * u, bodyTop);
  const body =
    inRect(x, y, cx - halfWidth, bodyTop, cx + halfWidth, bodyBottom) &&
    // Round the four corners so it reads as glass rather than a box.
    !cornerCut(x, y, cx, halfWidth, bodyTop, bodyBottom, 8 * u);

  if (lid) return 'lid';
  if (neck || body) return 'body';
  return null;
}

function cornerCut(x, y, cx, halfWidth, top, bottom, r) {
  const left = cx - halfWidth;
  const right = cx + halfWidth;
  // Only the pixel's own corner matters - testing it against all four rounds the
  // silhouette into a notch, which is what a naive loop over the corners produces.
  const ox = x < left + r ? left + r : x > right - r ? right - r : null;
  const oy = y < top + r ? top + r : y > bottom - r ? bottom - r : null;
  if (ox === null || oy === null) return false;
  return !inCircle(x, y, ox, oy, r);
}

// --- The images --------------------------------------------------------------

/** 180x180 home-screen icon: one jar, filled to the shoulder. */
function appleTouchIcon() {
  const size = 180;
  return png(size, size, (x, y) => {
    const part = jar(x, y, 150, 90, 18);
    if (part === 'lid') return CREAM;
    if (part === 'body') {
      // Fill line about a third down the body, so it looks like a jar with achar in it.
      return y > 18 + 0.42 * 150 ? MUSTARD : CREAM;
    }
    return BRAND;
  });
}

/**
 * 1200x630 Open Graph card: three jars on cream over a brand band. No lettering - a
 * generated bitmap cannot set type well, and a wrong-looking word mark is worse than none.
 */
function ogDefault() {
  const width = 1200;
  const height = 630;
  const bandTop = height - 96;

  return png(width, height, (x, y) => {
    if (y >= bandTop) return BRAND;

    for (let index = 0; index < 3; index += 1) {
      const cx = 330 + index * 270;
      const part = jar(x, y, 300, cx, 130);
      if (part === 'lid') return BRAND_DARK;
      if (part === 'body') {
        const fill = [MUSTARD, BRAND, LEAF][index];
        return y > 130 + 0.4 * 300 ? fill : [0xff, 0xff, 0xff];
      }
    }

    return CREAM;
  });
}

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'apple-touch-icon.png'), appleTouchIcon());
writeFileSync(resolve(OUT, 'og-default.png'), ogDefault());
console.log('wrote apple-touch-icon.png and og-default.png to public/');
