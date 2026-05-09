// Process Kamala Retreats brand logos:
//   - Strip cream background -> alpha
//   - Trim transparent padding
//   - Export WebP (1x + 2x) with alpha
//   - Trace cleaned raster to single-colour SVG via potrace
//   - Render 256x256 transparent favicon PNG
//   - Overwrite public/favicon.svg with new lotus icon
//
// Usage: npm run build:logos

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import potrace from "potrace";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public", "brand");

// Brand
const GOLD = "#b78f38";
const CREAM_RGB = { r: 0xf9, g: 0xf3, b: 0xf1 };

// Tuning constants
// Cream-removal tolerance: Euclidean distance in RGB. 30 is gentle enough to
// preserve antialiased gold edges while wiping the cream field cleanly.
const CREAM_TOLERANCE = 48;
const CREAM_TOLERANCE_SQ = CREAM_TOLERANCE * CREAM_TOLERANCE;
// Soft-edge band: pixels in [TOL, TOL+FEATHER] get partial alpha to avoid
// hard halos around antialiased letter edges.
const FEATHER = 18;

// Potrace tuning. potrace traces pixels with luminance BELOW threshold as
// the filled shape. We flatten the cleaned alpha PNG onto white, so:
//   - transparent background -> white (255, ignored)
//   - gold pixels (#b78f38, luminance ~140) -> below threshold, traced
const POTRACE_THRESHOLD = 200;  // 0..255 — well above gold's luminance
const POTRACE_TURDSIZE = 4;     // suppress specks
const POTRACE_ALPHAMAX = 1.0;   // smoother corners; lotus has curves

// Sizes are expressed as a fraction of the *trimmed* width so we never
// upscale past the meaningful pixel data.
const sources = [
  {
    name: "wordmark",
    src: path.join(root, "kamala-wordmark.PNG"),
    sizes: { "@2x": 1.0, "1x": 0.5 },
  },
  {
    name: "icon",
    src: path.join(root, "kamala-icon.PNG"),
    sizes: { "@2x": 1.0, "1x": 0.5 },
  },
];

/**
 * Read raw RGBA from a PNG (which may not have alpha) and replace pixels
 * close to cream with transparency. Pixels in a feather band get partial
 * alpha to soften the edge.
 *
 * Returns a sharp pipeline holding the trimmed alpha-cut image, plus its
 * trimmed dimensions.
 */
async function makeAlphaCut(srcPath) {
  const input = sharp(srcPath).ensureAlpha();
  const { data, info } = await input
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(`expected 4 channels, got ${channels}`);
  }

  const out = Buffer.from(data); // copy
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const dr = r - CREAM_RGB.r;
    const dg = g - CREAM_RGB.g;
    const db = b - CREAM_RGB.b;
    const distSq = dr * dr + dg * dg + db * db;

    if (distSq <= CREAM_TOLERANCE_SQ) {
      // Background: fully transparent.
      out[i + 3] = 0;
    } else {
      const dist = Math.sqrt(distSq);
      if (dist < CREAM_TOLERANCE + FEATHER) {
        // Feather band: ramp alpha from 0..255 across the band.
        const t = (dist - CREAM_TOLERANCE) / FEATHER;
        out[i + 3] = Math.round(255 * t);
      }
      // else: keep original alpha (255).
    }
  }

  // Build a fresh sharp pipeline from the modified raw buffer, then trim
  // surrounding fully-transparent pixels.
  const trimmed = sharp(out, {
    raw: { width, height, channels: 4 },
  }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 0 });

  // Force materialise to PNG buffer once so we can reuse for both webp
  // exports and potrace. PNG keeps the alpha losslessly.
  const cleanedPng = await trimmed.png({ compressionLevel: 9 }).toBuffer();
  const meta = await sharp(cleanedPng).metadata();
  return { cleanedPng, width: meta.width, height: meta.height };
}

/**
 * Trace the cleaned alpha PNG into an SVG with a single fill colour.
 * potrace itself works on luminance, so we composite onto pure black first
 * — gold-on-black gives a strong threshold separation.
 */
function traceToSvg(pngBuffer) {
  return new Promise((resolve, reject) => {
    const tracer = new potrace.Potrace({
      threshold: POTRACE_THRESHOLD,
      turdSize: POTRACE_TURDSIZE,
      alphaMax: POTRACE_ALPHAMAX,
      optCurve: true,
      optTolerance: 0.2,
      color: GOLD,
      background: "transparent",
    });
    tracer.loadImage(pngBuffer, (err) => {
      if (err) return reject(err);
      try {
        resolve(tracer.getSVG());
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Composite the cleaned alpha PNG onto opaque white so potrace sees gold
 * pixels as dark (below threshold -> traced) and transparent pixels as
 * white (above threshold -> ignored as background).
 */
async function flattenOnWhite(pngBuffer) {
  return sharp(pngBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
}

async function processLogo({ name, src, sizes }) {
  console.log(`\n== ${name} ==`);
  console.log(`source: ${src}`);
  const { cleanedPng, width, height } = await makeAlphaCut(src);
  console.log(`trimmed cleaned size: ${width}x${height}`);

  // WebP exports. Scale relative to the trimmed width so we never upscale.
  for (const [tag, scale] of Object.entries(sizes)) {
    const suffix = tag === "1x" ? "" : tag;
    const outPath = path.join(outDir, `${name}${suffix}.webp`);
    const targetWidth = Math.max(1, Math.round(width * scale));
    await sharp(cleanedPng)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toFile(outPath);
    const stat = await fs.stat(outPath);
    console.log(
      `  wrote ${path.relative(root, outPath)} (${targetWidth}px wide, ${stat.size} bytes)`,
    );
  }

  // SVG trace.
  const whiteBg = await flattenOnWhite(cleanedPng);
  const svg = await traceToSvg(whiteBg);
  const svgPath = path.join(outDir, `${name}.svg`);
  await fs.writeFile(svgPath, svg, "utf8");
  const svgStat = await fs.stat(svgPath);
  console.log(`  wrote ${path.relative(root, svgPath)} (${svgStat.size} bytes)`);

  return { cleanedPng, width, height, svg };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const results = {};
  for (const s of sources) {
    results[s.name] = await processLogo(s);
  }

  // Favicon: 256x256, transparent background, lotus icon centred and
  // padded so it doesn't bleed to the edges.
  const faviconPath = path.join(outDir, "icon-favicon.png");
  const FAV_SIZE = 256;
  const FAV_PAD = 8; // px of inner padding on the larger axis
  await sharp(results.icon.cleanedPng)
    .resize({
      width: FAV_SIZE - FAV_PAD * 2,
      height: FAV_SIZE - FAV_PAD * 2,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: FAV_PAD,
      bottom: FAV_PAD,
      left: FAV_PAD,
      right: FAV_PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(faviconPath);
  const favStat = await fs.stat(faviconPath);
  console.log(
    `\nwrote ${path.relative(root, faviconPath)} (${favStat.size} bytes)`,
  );

  // Overwrite top-level favicon.svg with the icon SVG.
  const topFaviconSvg = path.join(root, "public", "favicon.svg");
  await fs.writeFile(topFaviconSvg, results.icon.svg, "utf8");
  const topFavStat = await fs.stat(topFaviconSvg);
  console.log(
    `wrote ${path.relative(root, topFaviconSvg)} (${topFavStat.size} bytes)`,
  );

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
