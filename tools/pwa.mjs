/* Installing the program (item 54): the web app manifest, its icons and the
   service worker — the files that let a phone or a Chromebook put Fallaskóli
   on its home screen and open it without a network.

   They exist only when the program is SERVED. The single file that opens by
   a double click (`file:`) is not touched by any of this: it carries no
   manifest link and registers no worker (src/js/ui/pwa.js looks at the
   protocol first), so it behaves exactly as it always has.

   Two places serve them, and both get them from `pwaFiles` below:

     - tools/build.mjs writes `dist/web/` — the program as index.html with
       these files beside it, a folder to put on any plain web host;
     - server/server.mjs serves the same files from memory, made from the
       HTML file it actually serves.

   Why made from the HTML and not written once: the worker carries a stamp of
   the program it caches (`BUILD`). A browser looks at sw.js on every visit,
   and a different stamp is what tells it a new version exists — which is
   what offers the pupil "Ný útgáfa er tilbúin — endurhlaða". If the stamp
   were computed anywhere but from the bytes actually served, a new program
   could sit behind an unchanged worker and the old one would be served from
   the cache with nobody told. So the stamp IS the hash of what is served.

   Everything here is deterministic — same input, same bytes, on any machine
   with the same Node (the PNGs go through Node's own zlib) — so dist/web/ is
   as reproducible as the HTML (item 80, Dockerfile.build).

   No external asset: the icon is drawn here, pixel by pixel, from the tally
   group the board in the Æfa tab already draws (ui/progress.js `tallyGroup`,
   four strokes and a fifth across), in chalk on the board's green.        */

import zlib from "node:zlib";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Files this module reads at run time (not imported) — the server image must
    carry them; tests/packaging.test.js holds the Dockerfile to that. */
export const READS = ["src/sw.js"];

/* ---------- colours: the chalkboard (src/head.html :root) ---------- */
export const COLOURS = {
  board: "#22392F",       // --board
  boardDeep: "#172A22",   // --board-deep
  chalk: "#F3F1E7",       // --chalk
  wood: "#D2B48A",        // --wood
};

/* ---------- the glyph ----------
   The lines of `tallyGroup(5, 5)` in src/js/ui/progress.js, in its own
   viewBox (0 0 21 20), and its stroke width (.tallymarks line, src/head.html).
   tests/pwa.test.js reads them back out of the app's own SVG, so the icon
   cannot drift away from what the board draws.                           */
export const GLYPH = {
  w: 21, h: 20, stroke: 1.7,
  lines: [
    [3, 2, 3, 18], [8, 2, 8, 18], [13, 2, 13, 18], [18, 2, 18, 18],
    [0, 15, 21, 5],
  ],
};

/* ---------- the manifest ----------
   Paths are relative, so the same manifest works at the root of a server and
   in a folder of a static host. `id` is the start page, which is what a
   browser would pick anyway; writing it down keeps an installed copy the same
   app if `start_url` ever gains a query. */
export const ICONS = [
  { file: "icon-192.png", size: 192, kind: "any" },
  { file: "icon-512.png", size: 512, kind: "any" },
  { file: "icon-maskable-512.png", size: 512, kind: "maskable" },
  /* iOS ignores the manifest's icons and asks for this one by a <link>. */
  { file: "apple-touch-icon.png", size: 180, kind: "full" },
];

export function manifest() {
  return {
    name: "Fallaskóli — íslensk málfræði",
    short_name: "Fallaskóli",
    description: "Íslensk málfræði: beygingar, greining og setningar, æfðar á töflunni.",
    lang: "is",
    dir: "ltr",
    id: "./",
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "any",
    background_color: COLOURS.board,
    theme_color: COLOURS.board,
    icons: ICONS.filter((i) => i.kind !== "full").map((i) => ({
      src: i.file, sizes: `${i.size}x${i.size}`, type: "image/png", purpose: i.kind,
    })),
  };
}

/* ---------- drawing ----------
   A tiny rasteriser: every pixel is cut into 4×4 samples, each sample takes
   the colour of the topmost shape that covers it, and the pixel is their
   average. Integer arithmetic on fixed sample positions — no floating point
   result depends on the machine. Shapes: rounded rectangles and the round-
   capped strokes of the glyph (a capsule: every point within half the stroke
   width of the segment). */

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function roundRect(x0, y0, x1, y1, r) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
}

function capsule(ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  return (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r * r;
  };
}

/** The glyph, scaled to `width` pixels and centred in an S×S square. */
function glyphShapes(S, width) {
  const k = width / GLYPH.w;
  const ox = (S - GLYPH.w * k) / 2, oy = (S - GLYPH.h * k) / 2;
  return GLYPH.lines.map(([x1, y1, x2, y2]) =>
    capsule(ox + x1 * k, oy + y1 * k, ox + x2 * k, oy + y2 * k, (GLYPH.stroke * k) / 2));
}

/** The layers of one icon, bottom first: [test(x, y), [r, g, b]]. */
function layers(S, kind) {
  const board = hex(COLOURS.board), chalk = hex(COLOURS.chalk), wood = hex(COLOURS.wood);
  if (kind === "any") {
    /* The board in its wooden frame, corners rounded; outside is transparent. */
    const frame = roundRect(0, 0, S, S, S * 0.18);
    const inset = S * 0.06;
    const face = roundRect(inset, inset, S - inset, S - inset, S * 0.13);
    return [[frame, wood], [face, board], ...glyphShapes(S, S * 0.56).map((t) => [t, chalk])];
  }
  /* "maskable" and the iOS icon: board to every edge — the platform cuts its
     own shape. A maskable icon may lose everything outside the circle of 40%
     of its size around the centre: the glyph (46% wide) stays well inside. */
  const all = () => true;
  const width = kind === "maskable" ? S * 0.46 : S * 0.56;
  return [[all, board], ...glyphShapes(S, width).map((t) => [t, chalk])];
}

const SUB = 4;  // 4×4 samples per pixel

export function drawIcon(S, kind) {
  const L = layers(S, kind);
  const px = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const fx = x + (sx + 0.5) / SUB, fy = y + (sy + 0.5) / SUB;
          for (let i = L.length - 1; i >= 0; i--) {
            if (L[i][0](fx, fy)) { const c = L[i][1]; r += c[0]; g += c[1]; b += c[2]; a++; break; }
          }
        }
      }
      const o = (y * S + x) * 4;
      /* Colour averaged over the covered samples (not darkened by the empty
         ones), coverage as alpha: an edge against transparency stays clean. */
      if (a) { px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); }
      px[o + 3] = Math.round((a * 255) / (SUB * SUB));
    }
  }
  return encodePNG(S, S, px);
}

/* ---------- PNG ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** RGBA, 8 bits a channel, no filter, no metadata (no time stamp: the same
    pixels always give the same file). */
export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- all of it ---------- */

/* The icons do not depend on the program, and drawing the 512s takes a
   moment: drawn once per process. */
let iconCache = null;
const icons = () => (iconCache ||= ICONS.map((i) => [i.file, drawIcon(i.size, i.kind)]));

const TYPES = {
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};
export const typeOf = (file) => TYPES[path.extname(file)] || "application/octet-stream";

/**
 * The files that go beside the program, for the program `appHtml` (a Buffer
 * or string — the exact bytes that will be served as the start page).
 *
 * → { build, files: Map(name → Buffer) } with the names sw.js,
 *   manifest.webmanifest and the icons. index.html is not in it: the caller
 *   serves or writes the program itself.
 */
export function pwaFiles(appHtml) {
  const mf = Buffer.from(JSON.stringify(manifest(), null, 2) + "\n", "utf8");
  const files = new Map([["manifest.webmanifest", mf], ...icons()]);
  /* The stamp covers everything the worker caches, so any change to any of it
     is a new worker and a new offer. */
  const h = crypto.createHash("sha256").update(Buffer.from(appHtml));
  for (const [name, buf] of files) h.update(name).update(buf);
  const build = h.digest("hex").slice(0, 16);
  const template = readFileSync(path.join(ROOT, "src/sw.js"), "utf8");
  if (!template.includes('"@@BUILD@@"') || !template.includes("[/*@@ASSETS@@*/]"))
    throw new Error("src/sw.js has lost its @@BUILD@@ or @@ASSETS@@ marker.");
  const sw = template
    .replace('"@@BUILD@@"', JSON.stringify(build))
    .replace("[/*@@ASSETS@@*/]", JSON.stringify([...files.keys()]));
  files.set("sw.js", Buffer.from(sw, "utf8"));
  return { build, files };
}
