/**
 * Klipper brikkefoto langs innerkant av alle 6 lyse kanter og eksporterer hex-PNG.
 * Kjør: npm run process:tiles
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_DIR = join(ROOT, 'src/assets/tiles');
const OUTPUT_DIR = join(SOURCE_DIR, 'hex');

const MAX_OUTPUT_PX = 520;
const MAT_THRESHOLD = 42;
const FLAT_TO_POINTY_ROTATION = 30;
const CREAM_RUN_MIN = 4;
const INNER_INSET = 0.972;

type Point = { x: number; y: number };

function colorDist(r: number, g: number, b: number, br: number, bg: number, bb: number): number {
  const dr = r - br;
  const dg = g - bg;
  const db = b - bb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isMatColor(r: number, g: number, b: number, br: number, bg: number, bb: number): boolean {
  return colorDist(r, g, b, br, bg, bb) <= MAT_THRESHOLD;
}

function isFeltGreen(r: number, g: number, b: number, br: number, bg: number, bb: number): boolean {
  return (
    g > r + 16 &&
    g > b + 10 &&
    g > 85 &&
    colorDist(r, g, b, br, bg, bb) <= 36
  );
}


function isCreamBorder(r: number, g: number, b: number): boolean {
  if (g > r + 16) return false;
  if (Math.abs(r - g) > 28) return false;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread > 72) return false;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 185 && r > 150 && g > 145 && b > 108;
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
    out[idx * 4 + 3] = 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  return out;
}

function touchesTransparent(data: Buffer, width: number, height: number, x: number, y: number): boolean {
  const i = (y * width + x) * 4;
  if (x > 0 && data[i - 4 + 3] < 40) return true;
  if (x < width - 1 && data[i + 4 + 3] < 40) return true;
  if (y > 0 && data[i - width * 4 + 3] < 40) return true;
  if (y < height - 1 && data[i + width * 4 + 3] < 40) return true;
  return false;
}

function peelEdgeGreens(
  data: Buffer,
  width: number,
  height: number,
  br: number,
  bg: number,
  bb: number,
  passes = 8
): Buffer {
  const out = Buffer.from(data);
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (out[i + 3] < 40) continue;
        if (!isFeltGreen(out[i], out[i + 1], out[i + 2], br, bg, bb)) continue;
        if (!touchesTransparent(out, width, height, x, y)) continue;
        out[i + 3] = 0;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

function opaqueCenter(data: Buffer, width: number, height: number): Point {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 40) continue;
      sx += x;
      sy += y;
      n++;
    }
  }
  return { x: sx / n, y: sy / n };
}

function samplePixel(data: Buffer, width: number, height: number, x: number, y: number) {
  const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i = (yi * width + xi) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

function edgeNormalAngle(edgeIndex: number, rotationOffsetRad: number): number {
  return rotationOffsetRad + Math.PI / 6 + (edgeIndex * Math.PI) / 3;
}

function maxOpaqueAlongRay(
  data: Buffer,
  width: number,
  height: number,
  center: Point,
  angle: number
): number {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let best = 0;
  for (let r = 8; r < Math.max(width, height); r++) {
    const { a } = samplePixel(data, width, height, center.x + r * dirX, center.y + r * dirY);
    if (a < 40) break;
    best = r;
  }
  return best;
}

/** Fra kanten innover langs én kant – finn inner apothem etter krem/filt-båndet */
function findInnerApothemInward(
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
  const outer = maxOpaqueAlongRay(data, width, height, center, angle);
  if (outer < 24) return 0;

  let borderRun = 0;
  for (let r = outer; r >= 8; r--) {
    const { r: pr, g, b, a } = samplePixel(data, width, height, center.x + r * dirX, center.y + r * dirY);
    if (a < 40) continue;

    const border = isCreamBorder(pr, g, b) || isFeltGreen(pr, g, b, br, bg, bb);
    if (border) {
      borderRun++;
    } else if (borderRun >= CREAM_RUN_MIN) {
      return r;
    } else {
      borderRun = 0;
    }
  }

  return outer * 0.86;
}

function findApothemsForRotation(
  data: Buffer,
  width: number,
  height: number,
  center: Point,
  rotationOffsetDeg: number,
  br: number,
  bg: number,
  bb: number
): number[] {
  const offsetRad = (rotationOffsetDeg * Math.PI) / 180;
  return Array.from({ length: 6 }, (_, i) =>
    findInnerApothemInward(data, width, height, center, edgeNormalAngle(i, offsetRad), br, bg, bb)
  );
}

function findBestRotation(
  data: Buffer,
  width: number,
  height: number,
  center: Point,
  br: number,
  bg: number,
  bb: number
): { offsetDeg: number; apothems: number[] } {
  let bestOffset = 0;
  let bestApothems: number[] = [];
  let bestScore = Infinity;

  for (let offset = -14; offset <= 14; offset++) {
    const apothems = findApothemsForRotation(data, width, height, center, offset, br, bg, bb);
    const valid = apothems.filter((a) => a > 60);
    if (valid.length < 6) continue;

    const minA = Math.min(...valid);
    const maxA = Math.max(...valid);
    const ratio = maxA / minA;
    const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
    const variance = valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length;

    const score = ratio * 3 + variance / (mean * mean) * 1000;
    if (score < bestScore) {
      bestScore = score;
      bestOffset = offset;
      bestApothems = apothems;
    }
  }

  if (bestApothems.length === 0) {
    bestApothems = findApothemsForRotation(data, width, height, center, 0, br, bg, bb);
  }

  return { offsetDeg: bestOffset, apothems: bestApothems };
}

function findOuterApothems(
  data: Buffer,
  width: number,
  height: number,
  center: Point,
  rotationOffsetDeg: number
): number[] {
  const offsetRad = (rotationOffsetDeg * Math.PI) / 180;
  return Array.from({ length: 6 }, (_, i) => {
    const outer = maxOpaqueAlongRay(data, width, height, center, edgeNormalAngle(i, offsetRad));
    return outer * 0.9;
  });
}

function normalizeApothems(
  data: Buffer,
  width: number,
  height: number,
  center: Point,
  apothems: number[],
  rotationOffsetDeg: number
): number[] {
  const valid = apothems.filter((a) => a > 50);
  if (valid.length < 4) return findOuterApothems(data, width, height, center, rotationOffsetDeg);

  const minA = Math.min(...valid);
  const maxA = Math.max(...valid);
  if (maxA / minA > 1.7 || minA < 180) {
    return findOuterApothems(data, width, height, center, rotationOffsetDeg);
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const adjusted = apothems.map((a) => (a < median * 0.85 ? median * 0.93 : a));

  if (Math.max(...adjusted) / Math.min(...adjusted) < 1.15) {
    return adjusted.map(() => median * 0.965);
  }

  return adjusted;
}

function apothemsToVertices(center: Point, apothems: number[], rotationOffsetDeg: number): Point[] {
  const offsetRad = (rotationOffsetDeg * Math.PI) / 180;
  const vertices: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a1 = apothems[i];
    const a2 = apothems[(i + 1) % 6];
    const n1x = Math.cos(edgeNormalAngle(i, offsetRad));
    const n1y = Math.sin(edgeNormalAngle(i, offsetRad));
    const n2x = Math.cos(edgeNormalAngle((i + 1) % 6, offsetRad));
    const n2y = Math.sin(edgeNormalAngle((i + 1) % 6, offsetRad));
    const det = n1x * n2y - n1y * n2x;
    if (Math.abs(det) < 1e-6) continue;
    vertices.push({
      x: center.x + (a1 * n2y - a2 * n1y) / det,
      y: center.y + (a2 * n1x - a1 * n2x) / det,
    });
  }
  return vertices;
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

function shrinkVertices(vertices: Point[], center: Point, factor: number): Point[] {
  return vertices.map((v) => ({
    x: center.x + (v.x - center.x) * factor,
    y: center.y + (v.y - center.y) * factor,
  }));
}

function clipToHex(data: Buffer, width: number, height: number, vertices: Point[]): Buffer {
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] < 40) continue;
      if (!pointInPolygon(x + 0.5, y + 0.5, vertices)) {
        out[i + 3] = 0;
      }
    }
  }
  return out;
}

function removeCreamPixels(
  data: Buffer,
  width: number,
  height: number
): Buffer {
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] < 40) continue;
      if (isCreamBorder(out[i], out[i + 1], out[i + 2])) {
        out[i + 3] = 0;
      }
    }
  }
  return out;
}

function detectMatColor(data: Buffer, width: number, height: number) {
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
  return {
    br: Math.round(br / bgCount),
    bg: Math.round(bg / bgCount),
    bb: Math.round(bb / bgCount),
  };
}

async function processImage(inputPath: string, outputPath: string): Promise<number> {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`Expected RGBA: ${inputPath}`);

  const { br, bg, bb } = detectMatColor(data, width, height);
  const cleaned = floodRemoveMat(data, width, height, br, bg, bb);

  const trimmed = await sharp(cleaned, { raw: { width, height, channels: 4 } })
    .trim()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = trimmed.info.width;
  const h = trimmed.info.height;
  const center = opaqueCenter(trimmed.data, w, h);

  const { offsetDeg, apothems: rawApothems } = findBestRotation(trimmed.data, w, h, center, br, bg, bb);
  const apothems = normalizeApothems(trimmed.data, w, h, center, rawApothems, offsetDeg);
  const rawVertices = apothemsToVertices(center, apothems, offsetDeg);
  if (rawVertices.length !== 6) {
    throw new Error(`Klarte ikke bygge 6 kanthjørner i ${inputPath}`);
  }

  const clipVertices = shrinkVertices(rawVertices, center, INNER_INSET);
  let clipped = clipToHex(trimmed.data, w, h, clipVertices);
  clipped = removeCreamPixels(clipped, w, h);
  clipped = peelEdgeGreens(clipped, w, h, br, bg, bb);

  const rotated = await sharp(clipped, { raw: { width: w, height: h, channels: 4 } })
    .rotate(FLAT_TO_POINTY_ROTATION, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .trim()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rw = rotated.info.width;
  const rh = rotated.info.height;
  let final = removeCreamPixels(rotated.data, rw, rh);
  final = peelEdgeGreens(final, rw, rh, br, bg, bb, 10);

  await sharp(final, { raw: { width: rw, height: rh, channels: 4 } })
    .resize({
      width: w >= h ? MAX_OUTPUT_PX : undefined,
      height: h > w ? MAX_OUTPUT_PX : undefined,
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
