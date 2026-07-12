/**
 * Fjerner grønn bakgrunn fra brikkefoto og klipper til hex-form (pointy-top).
 * Kjør: npm run process:tiles
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_DIR = join(ROOT, 'src/assets/tiles');
const OUTPUT_DIR = join(SOURCE_DIR, 'hex');

const BG_DISTANCE = 55;
const BG_SOFT = 25;
const HEX_INSET = 0.04;
const MAX_OUTPUT_PX = 480;
/** Roterer foto slik at fysiske brikker matcher pointy-top hex på brettet */
const TILE_ROTATION = 45;

function insidePointyHex(px: number, py: number, cx: number, cy: number, size: number): boolean {
  const x = px - cx;
  const y = py - cy;
  const q = (Math.sqrt(3) / 3) * x - (1 / 3) * y;
  const r = (2 / 3) * y;
  const uq = q / size;
  const ur = r / size;
  return Math.abs(uq) <= 1 && Math.abs(ur) <= 1 && Math.abs(uq + ur) <= 1;
}

function bgAlpha(r: number, g: number, b: number, br: number, bg: number, bb: number): number {
  const dr = r - br;
  const dg = g - bg;
  const db = b - bb;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  const greenish = g > r + 12 && g > b + 12;
  const score = dist + (greenish ? -18 : 0);
  if (score <= BG_DISTANCE) return 0;
  if (score >= BG_DISTANCE + BG_SOFT) return 255;
  return Math.round(((score - BG_DISTANCE) / BG_SOFT) * 255);
}

async function processImage(inputPath: string, outputPath: string): Promise<void> {
  const rotated = await sharp(inputPath)
    .rotate(TILE_ROTATION, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = rotated;
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`Expected RGBA: ${inputPath}`);

  const corners: [number, number][] = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let br = 0;
  let bg = 0;
  let bb = 0;
  for (const [x, y] of corners) {
    const i = (y * width + x) * 4;
    br += data[i];
    bg += data[i + 1];
    bb += data[i + 2];
  }
  br = Math.round(br / corners.length);
  bg = Math.round(bg / corners.length);
  bb = Math.round(bb / corners.length);

  const out = Buffer.from(data);
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
      const alpha = bgAlpha(data[i], data[i + 1], data[i + 2], br, bg, bb);
      out[i + 3] = alpha;
      if (alpha > 40) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        sumX += x * alpha;
        sumY += y * alpha;
        sumA += alpha;
      }
    }
  }

  if (sumA === 0) throw new Error(`Ingen brikke funnet i ${inputPath}`);

  const cx = sumX / sumA;
  const cy = sumY / sumA;
  let radius = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] < 40) continue;
      const dx = x - cx;
      const dy = y - cy;
      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy));
    }
  }
  radius *= 1 - HEX_INSET;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] === 0) continue;
      if (!insidePointyHex(x, y, cx, cy, radius)) out[i + 3] = 0;
    }
  }

  minX = width;
  minY = height;
  maxX = 0;
  maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] < 40) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const cropped = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const src = ((y + minY) * width + (x + minX)) * 4;
      const dst = (y * cropW + x) * 4;
      cropped[dst] = out[src];
      cropped[dst + 1] = out[src + 1];
      cropped[dst + 2] = out[src + 2];
      cropped[dst + 3] = out[src + 3];
    }
  }

  await sharp(cropped, { raw: { width: cropW, height: cropH, channels: 4 } })
    .resize({
      width: cropW >= cropH ? MAX_OUTPUT_PX : undefined,
      height: cropH > cropW ? MAX_OUTPUT_PX : undefined,
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
