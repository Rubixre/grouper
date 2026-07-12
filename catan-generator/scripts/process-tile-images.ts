/**
 * Fjerner grønn bakgrunn fra brikkefoto og eksporterer pointy-top hex-PNG.
 * Kjør: npm run process:tiles
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_DIR = join(ROOT, 'src/assets/tiles');
const OUTPUT_DIR = join(SOURCE_DIR, 'hex');

/** Ingen ekstra rotasjon – bruker fotoets naturlige retning */
const TILE_ROTATION = 0;
/** Litt større brikke innenfor hex – hold lav for å unngå grønn filt */
const HEX_OUTSET = 1.02;
const MAX_OUTPUT_PX = 520;
const BG_THRESHOLD = 50;
const RADIUS_PERCENTILE = 0.82;
const EDGE_ERODE_PASSES = 3;

function insidePointyHex(px: number, py: number, cx: number, cy: number, size: number): boolean {
  const x = px - cx;
  const y = py - cy;
  const q = (Math.sqrt(3) / 3) * x - (1 / 3) * y;
  const r = (2 / 3) * y;
  const uq = q / size;
  const ur = r / size;
  return Math.abs(uq) <= 1 && Math.abs(ur) <= 1 && Math.abs(uq + ur) <= 1;
}

function colorDist(r: number, g: number, b: number, br: number, bg: number, bb: number): number {
  const dr = r - br;
  const dg = g - bg;
  const db = b - bb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Grønn filt / matte – kun lys grønn, ikke mørk skog */
function isFeltGreen(r: number, g: number, b: number, br: number, bg: number, bb: number): boolean {
  if (colorDist(r, g, b, br, bg, bb) <= BG_THRESHOLD) return true;

  const sum = r + g + b;
  if (sum < 210) return false;

  const greenDominant = g > r + 14 && g > b + 10;
  if (!greenDominant) return false;

  // Typisk filt-grønn: ganske lys, lite rød
  if (g >= 75 && r < 115 && sum < 380) return true;
  if (sum > 280 && r < 105) return true;

  return false;
}

function isCreamBorder(r: number, g: number, b: number): boolean {
  const sum = r + g + b;
  if (sum < 480) return false;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return spread < 65 && r > 175 && g > 170 && b > 140;
}

/** Lys grønn/gul halo mellom filt og brikkekant */
function isHaloGreen(r: number, g: number, b: number): boolean {
  const sum = r + g + b;
  if (sum < 120 || sum > 450) return false;
  return g >= 65 && g > r && g > b - 8 && r > 30;
}

function shouldPeel(r: number, g: number, b: number, br: number, bg: number, bb: number): boolean {
  return isFeltGreen(r, g, b, br, bg, bb) || isHaloGreen(r, g, b);
}

function isBackgroundPixel(r: number, g: number, b: number, br: number, bg: number, bb: number): boolean {
  if (isFeltGreen(r, g, b, br, bg, bb)) return true;
  if (colorDist(r, g, b, br, bg, bb) <= BG_THRESHOLD + 28) return true;
  const sum = r + g + b;
  // Mørkere grønn matte (skygge / siden av filt)
  if (g > r + 5 && g > b + 3 && g >= 40 && r < 100 && sum < 260) return true;
  return false;
}

function floodRemoveBackground(
  data: Buffer,
  width: number,
  height: number,
  br: number,
  bg: number,
  bb: number
): Buffer {
  const out = Buffer.from(data);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (!isBackgroundPixel(data[i], data[i + 1], data[i + 2], br, bg, bb)) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % width;
    const y = (idx - x) / width;
    const i = idx * 4;
    out[i + 3] = 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  return out;
}

function purgeBackgroundColor(
  data: Buffer,
  width: number,
  height: number,
  br: number,
  bg: number,
  bb: number
): Buffer {
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] < 12) continue;
      if (isFeltGreen(out[i], out[i + 1], out[i + 2], br, bg, bb)) {
        out[i + 3] = 0;
      }
    }
  }
  return out;
}

/** Fjerner grønn filt som har sneket seg inn langs kantene */
function erodeGreenEdges(
  data: Buffer,
  width: number,
  height: number,
  br: number,
  bg: number,
  bb: number,
  passes: number
): Buffer {
  let current = Buffer.from(data);

  for (let pass = 0; pass < passes; pass++) {
    const next = Buffer.from(current);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (current[i + 3] < 12) continue;
        if (
          !isFeltGreen(current[i], current[i + 1], current[i + 2], br, bg, bb) &&
          !isBackgroundPixel(current[i], current[i + 1], current[i + 2], br, bg, bb)
        ) {
          continue;
        }

        let touchesTransparent = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              touchesTransparent = true;
              break;
            }
            const ni = (ny * width + nx) * 4;
            if (current[ni + 3] < 40) {
              touchesTransparent = true;
              break;
            }
          }
          if (touchesTransparent) break;
        }

        if (touchesTransparent) next[i + 3] = 0;
      }
    }
    current = next;
  }

  return current;
}

/** Fjerner grønn filt rett utenfor den hvite/krem brikkekanten */
function peelFeltFromBorder(
  data: Buffer,
  width: number,
  height: number,
  br: number,
  bg: number,
  bb: number,
  passes: number
): Buffer {
  let current = Buffer.from(data);
  const maxDepth = Math.max(2, passes);

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = Buffer.from(current);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (current[i + 3] < 40) continue;
        if (!shouldPeel(current[i], current[i + 1], current[i + 2], br, bg, bb)) continue;

        let nearCream = false;
        for (let dy = -depth; dy <= depth; dy++) {
          for (let dx = -depth; dx <= depth; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (Math.abs(dx) + Math.abs(dy) > depth) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = (ny * width + nx) * 4;
            if (current[ni + 3] < 40) continue;
            if (isCreamBorder(current[ni], current[ni + 1], current[ni + 2])) {
              nearCream = true;
              break;
            }
          }
          if (nearCream) break;
        }

        if (nearCream) next[i + 3] = 0;
      }
    }
    current = next;
  }

  return current;
}

function applyHexMask(
  data: Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number
): Buffer {
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] === 0) continue;
      if (!insidePointyHex(x, y, cx, cy, radius)) out[i + 3] = 0;
    }
  }
  return out;
}

function opaqueBounds(data: Buffer, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let sumX = 0;
  let sumY = 0;
  let sumA = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 40) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x * data[i + 3];
      sumY += y * data[i + 3];
      sumA += data[i + 3];
    }
  }

  return { minX, minY, maxX, maxY, cx: sumX / sumA, cy: sumY / sumA, sumA };
}

function percentileRadius(data: Buffer, width: number, height: number, cx: number, cy: number): number {
  const distances: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 40) continue;
      const dx = x - cx;
      const dy = y - cy;
      distances.push(Math.sqrt(dx * dx + dy * dy));
    }
  }
  distances.sort((a, b) => a - b);
  return distances[Math.floor(distances.length * RADIUS_PERCENTILE)] ?? distances.at(-1) ?? 1;
}

function toHexCanvas(
  data: Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number
): { data: Buffer; width: number; height: number } {
  const outR = radius * HEX_OUTSET;
  const outW = Math.ceil(Math.sqrt(3) * outR);
  const outH = Math.ceil(2 * outR);
  const ocx = outW / 2;
  const ocy = outH / 2;
  const out = Buffer.alloc(outW * outH * 4);

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      if (!insidePointyHex(ox, oy, ocx, ocy, outR)) continue;

      const sx = Math.round(cx + ((ox - ocx) * radius) / outR);
      const sy = Math.round(cy + ((oy - ocy) * radius) / outR);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;

      const si = (sy * width + sx) * 4;
      if (data[si + 3] < 12) continue;

      const oi = (oy * outW + ox) * 4;
      out[oi] = data[si];
      out[oi + 1] = data[si + 1];
      out[oi + 2] = data[si + 2];
      out[oi + 3] = data[si + 3];
    }
  }

  return { data: out, width: outW, height: outH };
}

async function processImage(inputPath: string, outputPath: string): Promise<void> {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`Expected RGBA: ${inputPath}`);

  const edgeSamples: [number, number][] = [];
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 30))) {
    edgeSamples.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 30))) {
    edgeSamples.push([0, y], [width - 1, y]);
  }

  let br = 0;
  let bg = 0;
  let bb = 0;
  let bgCount = 0;
  for (const [x, y] of edgeSamples) {
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (g > r + 10 && g > b + 5 && g > 60) {
      br += r;
      bg += g;
      bb += b;
      bgCount++;
    }
  }
  if (bgCount === 0) {
    for (const [x, y] of edgeSamples) {
      const i = (y * width + x) * 4;
      br += data[i];
      bg += data[i + 1];
      bb += data[i + 2];
      bgCount++;
    }
  }
  br = Math.round(br / bgCount);
  bg = Math.round(bg / bgCount);
  bb = Math.round(bb / bgCount);

  const cleaned = floodRemoveBackground(data, width, height, br, bg, bb);
  let processed = purgeBackgroundColor(cleaned, width, height, br, bg, bb);
  processed = peelFeltFromBorder(processed, width, height, br, bg, bb, 8);
  processed = erodeGreenEdges(processed, width, height, br, bg, bb, EDGE_ERODE_PASSES);

  let procW = width;
  let procH = height;
  if (TILE_ROTATION !== 0) {
    const rotated = await sharp(cleaned, { raw: { width, height, channels: 4 } })
      .rotate(TILE_ROTATION, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .trim()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    processed = rotated.data;
    procW = rotated.info.width;
    procH = rotated.info.height;
  }

  const { cx, cy, sumA } = opaqueBounds(processed, procW, procH);
  if (sumA === 0) throw new Error(`Ingen brikke funnet i ${inputPath}`);

  const radius = percentileRadius(processed, procW, procH, cx, cy);
  let purged = purgeBackgroundColor(processed, procW, procH, br, bg, bb);
  purged = peelFeltFromBorder(purged, procW, procH, br, bg, bb, 3);
  purged = erodeGreenEdges(purged, procW, procH, br, bg, bb, EDGE_ERODE_PASSES);
  const masked = applyHexMask(purged, procW, procH, cx, cy, radius);
  let hex = toHexCanvas(masked, procW, procH, cx, cy, radius);
  hex.data = purgeBackgroundColor(hex.data, hex.width, hex.height, br, bg, bb);
  hex.data = peelFeltFromBorder(hex.data, hex.width, hex.height, br, bg, bb, 2);
  hex.data = erodeGreenEdges(hex.data, hex.width, hex.height, br, bg, bb, 1);

  await sharp(hex.data, { raw: { width: hex.width, height: hex.height, channels: 4 } })
    .resize({
      width: hex.width >= hex.height ? MAX_OUTPUT_PX : undefined,
      height: hex.height > hex.width ? MAX_OUTPUT_PX : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const sources = readdirSync(SOURCE_DIR).filter((f) => /\.(jpe?g|webp)$/i.test(f));
  if (sources.length === 0) {
    console.error('Ingen kildebilder funnet i', SOURCE_DIR);
    process.exit(1);
  }

  for (const file of sources) {
    const stem = basename(file).replace(/\.[^.]+$/, '');
    const out = join(OUTPUT_DIR, `${stem}.png`);
    await processImage(join(SOURCE_DIR, file), out);
    console.log(`${file} → hex/${stem}.png`);
  }

  console.log(`\nProsesserte ${sources.length} brikker til ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
