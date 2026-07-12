/**
 * Fjerner grønn filt-bakgrunn fra brikkefoto og eksporterer pointy-top hex-PNG.
 * Kjør: npm run process:tiles
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_DIR = join(ROOT, 'src/assets/tiles');
const OUTPUT_DIR = join(SOURCE_DIR, 'hex');

const MAX_OUTPUT_PX = 520;
/** Kun piksler svært lik filt-fargen fra kantene fjernes */
const MAT_THRESHOLD = 48;

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

function isMatColor(r: number, g: number, b: number, br: number, bg: number, bb: number): boolean {
  return colorDist(r, g, b, br, bg, bb) <= MAT_THRESHOLD;
}

function isCreamBorder(r: number, g: number, b: number): boolean {
  const sum = r + g + b;
  if (sum < 460) return false;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return spread < 70 && r > 168 && g > 163 && b > 130;
}

/** Lys filt-grønn ved kant – ikke mørk skog */
function isMatFringe(r: number, g: number, b: number, br: number, bg: number, bb: number): boolean {
  if (colorDist(r, g, b, br, bg, bb) <= MAT_THRESHOLD + 12) return true;
  const sum = r + g + b;
  if (sum < 200 || sum > 420) return false;
  return g > r + 16 && g > b + 10 && r < 100;
}

function peelMatNearCream(
  data: Buffer,
  width: number,
  height: number,
  br: number,
  bg: number,
  bb: number,
  depth: number
): Buffer {
  const out = Buffer.from(data);
  const cream = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] < 40) continue;
      if (isCreamBorder(out[i], out[i + 1], out[i + 2])) cream[y * width + x] = 1;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] < 40) continue;
      if (!isMatFringe(out[i], out[i + 1], out[i + 2], br, bg, bb)) continue;

      let nearCream = false;
      for (let dy = -depth; dy <= depth; dy++) {
        for (let dx = -depth; dx <= depth; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (Math.abs(dx) + Math.abs(dy) > depth) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (cream[ny * width + nx]) {
            nearCream = true;
            break;
          }
        }
        if (nearCream) break;
      }

      if (nearCream) out[i + 3] = 0;
    }
  }

  return out;
}

function isBrightMat(r: number, g: number, b: number, br: number, bg: number, bb: number): boolean {
  if (colorDist(r, g, b, br, bg, bb) <= 72) return true;
  return g >= 115 && g > r + 18 && r < 90 && b < 135;
}

function hexEdgeDepth(px: number, py: number, cx: number, cy: number, R: number): number {
  const x = px - cx;
  const y = py - cy;
  const q = (Math.sqrt(3) / 3) * x - (1 / 3) * y;
  const r = (2 / 3) * y;
  const s = -q - r;
  const maxC = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
  const norm = maxC / ((R * 2) / 3);
  return Math.max(0, (1 - norm) * R);
}

function peelBrightMatPerimeter(
  data: Buffer,
  width: number,
  height: number,
  br: number,
  bg: number,
  bb: number,
  bandPx: number
): Buffer {
  const out = Buffer.from(data);
  const ocx = width / 2;
  const ocy = height / 2;
  const R = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] < 40) continue;
      if (!insidePointyHex(x, y, ocx, ocy, R)) continue;

      const edgeDepth = hexEdgeDepth(x, y, ocx, ocy, R);
      if (edgeDepth > bandPx) continue;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      if (!isBrightMat(r, g, b, br, bg, bb) && colorDist(r, g, b, br, bg, bb) > 62) continue;
      out[i + 3] = 0;
    }
  }

  return out;
}

function peelMatAtEdge(
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
        if (current[i + 3] < 40) continue;
        if (!isMatFringe(current[i], current[i + 1], current[i + 2], br, bg, bb)) continue;

        let touchesClear = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              touchesClear = true;
              break;
            }
            const ni = (ny * width + nx) * 4;
            if (current[ni + 3] < 40) {
              touchesClear = true;
              break;
            }
          }
          if (touchesClear) break;
        }

        if (touchesClear) next[i + 3] = 0;
      }
    }
    current = next;
  }

  return current;
}

function floodRemoveMat(
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
    if (!isMatColor(data[i], data[i + 1], data[i + 2], br, bg, bb)) return;
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

/** Flat-top → pointy-top (brikker i foto ligger ofte med flat side opp/ned) */
const FLAT_TO_POINTY_ROTATION = 30;

function opaqueBBox(data: Buffer, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 40) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function opaqueBounds(data: Buffer, width: number, height: number) {
  let sumX = 0;
  let sumY = 0;
  let sumA = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 40) continue;
      sumX += x * data[i + 3];
      sumY += y * data[i + 3];
      sumA += data[i + 3];
    }
  }

  return { cx: sumX / sumA, cy: sumY / sumA, sumA };
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
  return distances[Math.floor(distances.length * 0.88)] ?? distances.at(-1) ?? 1;
}

function toHexCanvas(
  data: Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number
): { data: Buffer; width: number; height: number } {
  const outR = radius;
  const outW = Math.ceil(Math.sqrt(3) * outR);
  const outH = Math.ceil(2 * outR);
  const ocx = outW / 2;
  const ocy = outH / 2;
  const out = Buffer.alloc(outW * outH * 4);

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      if (!insidePointyHex(ox, oy, ocx, ocy, outR)) continue;

      const sx = cx + ((ox - ocx) * radius) / outR;
      const sy = cy + ((oy - ocy) * radius) / outR;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, width - 1);
      const y1 = Math.min(y0 + 1, height - 1);
      const tx = sx - x0;
      const ty = sy - y0;

      const sample = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
      };

      const c00 = sample(x0, y0);
      const c10 = sample(x1, y0);
      const c01 = sample(x0, y1);
      const c11 = sample(x1, y1);

      const oi = (oy * outW + ox) * 4;
      for (let c = 0; c < 4; c++) {
        const v =
          c00[c] * (1 - tx) * (1 - ty) +
          c10[c] * tx * (1 - ty) +
          c01[c] * (1 - tx) * ty +
          c11[c] * tx * ty;
        out[oi + c] = Math.round(v);
      }
      if (out[oi + 3] < 12) out[oi + 3] = 0;
    }
  }

  return { data: out, width: outW, height: outH };
}

async function processImage(inputPath: string, outputPath: string): Promise<void> {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`Expected RGBA: ${inputPath}`);

  const edgeSamples: [number, number][] = [];
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 24))) {
    edgeSamples.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 24))) {
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
    if (g > r + 8 && g > b + 4) {
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

  const cleaned = floodRemoveMat(data, width, height, br, bg, bb);

  const trimmed = await sharp(cleaned, { raw: { width, height, channels: 4 } })
    .trim()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bbox = opaqueBBox(trimmed.data, trimmed.info.width, trimmed.info.height);
  const isFlatTop = bbox.w > bbox.h * 1.02;

  const aligned = isFlatTop
    ? await sharp(trimmed.data, {
        raw: { width: trimmed.info.width, height: trimmed.info.height, channels: 4 },
      })
        .rotate(FLAT_TO_POINTY_ROTATION, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .trim()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    : trimmed;

  const { sumA } = opaqueBounds(aligned.data, aligned.info.width, aligned.info.height);
  if (sumA === 0) throw new Error(`Ingen brikke funnet i ${inputPath}`);

  const stem = basename(inputPath).replace(/\.[^.]+$/, '').toLowerCase();
  const isForest = stem.includes('skog');

  let working = aligned.data;
  let workW = aligned.info.width;
  let workH = aligned.info.height;

  working = peelMatNearCream(working, workW, workH, br, bg, bb, isForest ? 8 : 5);
  working = peelMatAtEdge(working, workW, workH, br, bg, bb, isForest ? 4 : 2);

  const bounds = opaqueBounds(working, workW, workH);
  const radius = percentileRadius(working, workW, workH, bounds.cx, bounds.cy);
  const forestRadius = isForest ? radius * 0.96 : radius;
  let hex = toHexCanvas(working, workW, workH, bounds.cx, bounds.cy, forestRadius);
  if (isForest) {
    hex.data = peelMatNearCream(hex.data, hex.width, hex.height, br, bg, bb, 4);
    hex.data = peelMatAtEdge(hex.data, hex.width, hex.height, br, bg, bb, 2);
    hex.data = peelBrightMatPerimeter(hex.data, hex.width, hex.height, br, bg, bb, 36);
    hex.data = peelBrightMatPerimeter(hex.data, hex.width, hex.height, br, bg, bb, 20);
  }

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
