/**
 * Klipper brikkefoto til hex-PNG ved å finne 6 hjørner og kutte utenfor.
 * Ingen flood fill eller fargefjerning – kun geometrisk klipping.
 * Kjør: npm run process:tiles
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_DIR = join(ROOT, 'src/assets/tiles');
const OUTPUT_DIR = join(SOURCE_DIR, 'hex');

const MAX_OUTPUT_PX = 520;
const FLAT_TO_POINTY_ROTATION = 30;

type Point = { x: number; y: number };

function colorDist(r: number, g: number, b: number, br: number, bg: number, bb: number): number {
  const dr = r - br;
  const dg = g - bg;
  const db = b - bb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isBackgroundMat(r: number, g: number, b: number, br: number, bg: number, bb: number): boolean {
  return g > r + 14 && g > b + 10 && colorDist(r, g, b, br, bg, bb) <= 40;
}

/** Kremkant – kun for hjørnedeteksjon */
function isCreamEdge(r: number, g: number, b: number): boolean {
  if (g > r + 16) return false;
  if (Math.abs(r - g) > 26) return false;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread > 70) return false;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 182 && r > 148 && g > 143 && b > 108;
}

function detectMatColor(data: Buffer, width: number, height: number) {
  const samples: [number, number][] = [];
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 20))) {
    samples.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 20))) {
    samples.push([0, y], [width - 1, y]);
  }

  let br = 0;
  let bg = 0;
  let bb = 0;
  let n = 0;
  for (const [x, y] of samples) {
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (g > r + 8 && g > b + 4) {
      br += r;
      bg += g;
      bb += b;
      n++;
    }
  }
  if (n === 0) {
    for (const [x, y] of samples) {
      const i = (y * width + x) * 4;
      br += data[i];
      bg += data[i + 1];
      bb += data[i + 2];
      n++;
    }
  }
  return { br: Math.round(br / n), bg: Math.round(bg / n), bb: Math.round(bb / n) };
}

function collectOuterCreamRing(data: Buffer, width: number, height: number, center: Point): Point[] {
  const allCream: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (isCreamEdge(data[i], data[i + 1], data[i + 2])) {
        allCream.push({ x, y });
      }
    }
  }
  if (allCream.length === 0) return [];

  let maxDist = 0;
  for (const p of allCream) {
    maxDist = Math.max(maxDist, Math.hypot(p.x - center.x, p.y - center.y));
  }

  const minDist = maxDist * 0.78;
  return allCream.filter((p) => Math.hypot(p.x - center.x, p.y - center.y) >= minDist);
}

function centroid(points: Point[]): Point {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function normalizeAngle(a: number): number {
  while (a <= -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

function flatTopVertexAngle(i: number, rotationOffsetRad: number): number {
  return rotationOffsetRad + (i * Math.PI) / 3;
}

function samplePixel(data: Buffer, width: number, height: number, x: number, y: number) {
  const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i = (yi * width + xi) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

function findCornerFromCreamRing(ring: Point[], center: Point, targetAngle: number): number {
  const halfSector = Math.PI / 6 + 0.05;
  let best = 0;

  for (const p of ring) {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    if (Math.abs(normalizeAngle(angle - targetAngle)) <= halfSector && dist > best) {
      best = dist;
    }
  }

  return best;
}

function findCornerFromRay(
  data: Buffer,
  width: number,
  height: number,
  center: Point,
  angle: number,
  br: number,
  bg: number,
  bb: number
): number {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let lastNonMat = 0;

  for (let r = 8; r < Math.hypot(width, height); r++) {
    const { r: pr, g, b } = samplePixel(data, width, height, center.x + r * dirX, center.y + r * dirY);
    if (!isBackgroundMat(pr, g, b, br, bg, bb)) {
      lastNonMat = r;
    } else if (lastNonMat > 0) {
      break;
    }
  }

  return lastNonMat;
}

function findCornersForRotation(
  data: Buffer,
  width: number,
  height: number,
  center: Point,
  creamRing: Point[],
  rotationOffsetDeg: number,
  br: number,
  bg: number,
  bb: number
): number[] {
  const offsetRad = (rotationOffsetDeg * Math.PI) / 180;

  return Array.from({ length: 6 }, (_, i) => {
    const angle = flatTopVertexAngle(i, offsetRad);
    const fromCream = creamRing.length > 50 ? findCornerFromCreamRing(creamRing, center, angle) : 0;
    if (fromCream > 0) return fromCream;
    return findCornerFromRay(data, width, height, center, angle, br, bg, bb);
  });
}

function findBestHex(
  data: Buffer,
  width: number,
  height: number,
  br: number,
  bg: number,
  bb: number
): { offsetDeg: number; center: Point; radii: number[] } {
  const guess = { x: width / 2, y: height / 2 };
  let creamRing = collectOuterCreamRing(data, width, height, guess);
  const center = creamRing.length > 200 ? centroid(creamRing) : guess;
  creamRing = collectOuterCreamRing(data, width, height, center);

  let bestOffset = 0;
  let bestRadii: number[] = [];
  let bestScore = Infinity;

  for (let offset = -15; offset <= 15; offset++) {
    const radii = findCornersForRotation(data, width, height, center, creamRing, offset, br, bg, bb);
    const valid = radii.filter((r) => r > 60);
    if (valid.length < 6) continue;

    const minR = Math.min(...valid);
    const maxR = Math.max(...valid);
    const ratio = maxR / minR;
    const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
    const variance = valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length;
    const score = ratio * 3 + variance / (mean * mean) * 800 + Math.abs(offset) * 0.01;

    if (score < bestScore) {
      bestScore = score;
      bestOffset = offset;
      bestRadii = radii;
    }
  }

  if (bestRadii.length === 0) {
    bestRadii = findCornersForRotation(data, width, height, center, creamRing, 0, br, bg, bb);
  }

  return { offsetDeg: bestOffset, center, radii: bestRadii };
}

function normalizeRadii(radii: number[]): number[] {
  const valid = radii.filter((r) => r > 60);
  if (valid.length === 0) return radii;
  const sorted = [...valid].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return radii.map((r) => (r < median * 0.8 ? median : r));
}

function radiiToVertices(center: Point, radii: number[], rotationOffsetDeg: number): Point[] {
  const offsetRad = (rotationOffsetDeg * Math.PI) / 180;
  return radii.map((radius, i) => {
    const angle = flatTopVertexAngle(i, offsetRad);
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
}

function pointInPolygon(x: number, y: number, verts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x;
    const yi = verts[i].y;
    const xj = verts[j].x;
    const yj = verts[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function clipToHex(data: Buffer, width: number, height: number, vertices: Point[]): Buffer {
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!pointInPolygon(x + 0.5, y + 0.5, vertices)) {
        out[i + 3] = 0;
      }
    }
  }
  return out;
}

async function processImage(inputPath: string, outputPath: string): Promise<number> {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`Expected RGBA: ${inputPath}`);

  const mat = detectMatColor(data, width, height);
  const { offsetDeg, center, radii: rawRadii } = findBestHex(data, width, height, mat.br, mat.bg, mat.bb);
  const radii = normalizeRadii(rawRadii).map((r) => r * 0.985);
  const vertices = radiiToVertices(center, radii, offsetDeg);

  if (vertices.length !== 6) {
    throw new Error(`Fant ikke 6 hjørner i ${inputPath}`);
  }

  const clipped = clipToHex(data, width, height, vertices);

  await sharp(clipped, { raw: { width, height, channels: 4 } })
    .rotate(FLAT_TO_POINTY_ROTATION, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .trim()
    .resize({
      width: width >= height ? MAX_OUTPUT_PX : undefined,
      height: height > width ? MAX_OUTPUT_PX : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  return offsetDeg;
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
    const offset = await processImage(join(SOURCE_DIR, file), out);
    console.log(`${file} → hex/${stem}.png (rot=${offset}°)`);
  }

  console.log(`\nProsesserte ${sources.length} brikker til ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
