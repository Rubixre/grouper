import type { BoardSize, HexCoord, ResourceType } from './types';
import { getLandHexCoords } from './boardLayout';
import { hexToPixel } from './hex';
import {
  createEmptyLandDraft,
  isPhotoBoardNumber,
  landDraftKey,
  PHOTO_BOARD_NUMBERS,
  type LandHexDraft,
  type PhotoBoardNumber,
} from './boardFromPhoto';
import { NUMBERS_BASE, NUMBERS_EXTENSION_56 } from './generator';

/** Transformasjon som mapper aksiale hex-koordinater → bildepiksler (fast hex-overlay). */
export interface ImageOverlayTransform {
  /** Hex-senter (q=0,r=0) i bildekoordinater */
  centerX: number;
  centerY: number;
  /** Avstand sentrum→hjørne i piksler (pointy-top) */
  hexSize: number;
  /** Rotasjon i grader (positiv = med klokken) */
  rotationDeg: number;
}

/**
 * Justering av selve bildet under et fast hex-nett.
 * Pan/zoom/rotasjon er i bildepiksel-rom (natural size), rundt bildesenter.
 */
export interface ImageAdjust {
  panX: number;
  panY: number;
  zoom: number;
  rotationDeg: number;
}

export function defaultImageAdjust(): ImageAdjust {
  return { panX: 0, panY: 0, zoom: 1, rotationDeg: 0 };
}

export function nudgeImageAdjust(
  adjust: ImageAdjust,
  patch: Partial<ImageAdjust>
): ImageAdjust {
  return {
    panX: patch.panX ?? adjust.panX,
    panY: patch.panY ?? adjust.panY,
    zoom: clamp(patch.zoom ?? adjust.zoom, 0.4, 3),
    rotationDeg: patch.rotationDeg ?? adjust.rotationDeg,
  };
}

export function scaleImageAdjustForRecognition(
  adjust: ImageAdjust,
  scale: number
): ImageAdjust {
  if (scale === 1) return adjust;
  return {
    ...adjust,
    panX: adjust.panX * scale,
    panY: adjust.panY * scale,
  };
}

/**
 * Map overlay-/visningspiksel (fast hex-nett) → kildebildepiksel
 * etter at bildet er panet/zoomet/rotert rundt sentrum.
 */
export function displayToImagePixel(
  x: number,
  y: number,
  imageWidth: number,
  imageHeight: number,
  adjust: ImageAdjust
): { x: number; y: number } {
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  const dx = x - cx - adjust.panX;
  const dy = y - cy - adjust.panY;
  const rad = (-adjust.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  const z = adjust.zoom === 0 ? 1 : adjust.zoom;
  return {
    x: cx + rx / z,
    y: cy + ry / z,
  };
}

export interface ResourceGuess {
  resource: ResourceType;
  confidence: number;
  rgb: { r: number; g: number; b: number };
}

export interface HexRecognitionResult {
  coord: HexCoord;
  resource: ResourceGuess | null;
  number: number | null;
  numberConfidence: number;
}

export interface BoardRecognitionResult {
  hexes: HexRecognitionResult[];
  recognizedResources: number;
  recognizedNumbers: number;
}

export type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

/** Minimalt bildebuffer-interface (browser ImageData eller test-shim). */
export interface RgbaImageBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max <= 1e-6 ? 0 : d / max;
  return { h, s, v: max };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function readPixel(image: RgbaImageBuffer, x: number, y: number): Rgb | null {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= image.width || iy >= image.height) return null;
  const idx = (iy * image.width + ix) * 4;
  return { r: image.data[idx]!, g: image.data[idx + 1]!, b: image.data[idx + 2]! };
}

/** Avvis hav, tallskive-krem og nesten-svart skygge. */
export function isTerrainSamplePixel(rgb: Rgb): boolean {
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  // Hav / blå duk
  if (hsv.h >= 175 && hsv.h <= 260 && hsv.s > 0.18 && hsv.v > 0.2) return false;
  // Lys tallskive (krem/hvit) — ikke terreng
  if (hsv.v > 0.78 && hsv.s < 0.28) return false;
  if (hsv.v > 0.85 && hsv.s < 0.35) return false;
  // Nesten svart (vei/skygge)
  if (hsv.v < 0.12) return false;
  return true;
}

/**
 * HSV-først klassifisering for Catan-brikker under varierende lys.
 * Unngår den gamle fellen der lav metning alltid ble ørken/malm.
 */
export function classifyResourceFromRgb(rgb: Rgb): ResourceGuess {
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const { h, s, v } = hsv;

  type Cand = { resource: ResourceType; score: number };
  const cands: Cand[] = [];

  // Tegl: oransje/rød
  if ((h <= 35 || h >= 345) && s >= 0.22 && v >= 0.22 && v <= 0.9) {
    cands.push({ resource: 'brick', score: 0.55 + s * 0.35 + (h < 25 || h > 350 ? 0.1 : 0) });
  }

  // Korn: gul/gull (høyere metning enn ørken)
  if (h >= 35 && h <= 70 && s >= 0.28 && v >= 0.35) {
    cands.push({ resource: 'wheat', score: 0.5 + Math.min(s, 0.7) * 0.4 + (v > 0.45 ? 0.08 : 0) });
  }

  // Tømmer: mørk grønn
  if (h >= 75 && h <= 165 && s >= 0.18 && v <= 0.55) {
    cands.push({
      resource: 'wood',
      score: 0.5 + s * 0.25 + (v < 0.42 ? 0.2 : 0.05) + (h < 140 ? 0.05 : 0),
    });
  }

  // Ull: lysere / mer gulgrønn
  if (h >= 65 && h <= 150 && s >= 0.2 && v >= 0.4) {
    cands.push({
      resource: 'sheep',
      score: 0.48 + s * 0.2 + (v > 0.5 ? 0.18 : 0) + (h >= 85 && h <= 130 ? 0.08 : 0),
    });
  }

  // Ørken: varm beige, lav–middels metning (ikke «alt grått»)
  if (h >= 25 && h <= 55 && s >= 0.12 && s <= 0.48 && v >= 0.45 && v <= 0.92) {
    // Straff hvis for mettet (da er det oftere korn)
    const satPenalty = s > 0.38 ? (s - 0.38) * 0.8 : 0;
    cands.push({ resource: 'desert', score: 0.42 + (0.35 - Math.abs(s - 0.28)) - satPenalty });
  }

  // Malm: kjølig grå, lav metning, ikke varm beige
  if (s <= 0.28 && v >= 0.22 && v <= 0.78) {
    const warm = h >= 25 && h <= 55;
    if (!warm || s < 0.14) {
      cands.push({
        resource: 'ore',
        score:
          0.42 +
          (0.28 - s) * 0.7 +
          (v > 0.32 && v < 0.62 ? 0.14 : 0) +
          (warm ? -0.12 : 0.08),
      });
    }
  }

  // Hvis både wood og sheep matcher: skill på value
  const wood = cands.find((c) => c.resource === 'wood');
  const sheep = cands.find((c) => c.resource === 'sheep');
  if (wood && sheep) {
    if (v < 0.46) sheep.score *= 0.55;
    else wood.score *= 0.55;
  }

  // Hvis både wheat og desert: skill på metning
  const wheat = cands.find((c) => c.resource === 'wheat');
  const desert = cands.find((c) => c.resource === 'desert');
  if (wheat && desert) {
    if (s >= 0.4) desert.score *= 0.45;
    else wheat.score *= 0.55;
  }

  // Malm vs ørken: kjølig/mørk → malm, varm/lys → ørken
  const ore = cands.find((c) => c.resource === 'ore');
  if (ore && desert) {
    const warmBeige = h >= 22 && h <= 58 && s >= 0.1;
    if (warmBeige && v >= 0.55) {
      ore.score *= 0.45;
      desert.score += 0.12;
    } else if (!warmBeige || v < 0.5 || s < 0.1) {
      desert.score *= 0.4;
      ore.score += 0.12;
    }
  }

  cands.sort((a, b) => b.score - a.score);
  if (cands.length === 0) {
    // Siste utvei: varm→ørken, kjølig→malm, ellers ull/tømmer på grønt hint
    let resource: ResourceType = 'ore';
    if (h >= 70 && h <= 160) resource = v < 0.45 ? 'wood' : 'sheep';
    else if (h >= 20 && h <= 70) resource = s > 0.35 ? 'wheat' : 'desert';
    else if (h <= 20 || h >= 340) resource = 'brick';
    return { resource, confidence: 0.3, rgb };
  }

  const best = cands[0]!;
  const second = cands[1]?.score ?? 0;
  const margin = best.score - second;
  const confidence = clamp(0.35 + best.score * 0.4 + margin * 0.35, 0.3, 0.97);
  return { resource: best.resource, confidence, rgb };
}

export function axialToImagePixel(
  coord: HexCoord,
  transform: ImageOverlayTransform
): { x: number; y: number } {
  const local = hexToPixel(coord, transform.hexSize);
  const rad = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = transform.centerX + local.x * cos - local.y * sin;
  const y = transform.centerY + local.x * sin + local.y * cos;
  return { x, y };
}

/** Standard overlay som fitter landhexene inn i bildet med margin. */
export function defaultOverlayTransform(
  imageWidth: number,
  imageHeight: number,
  landCoords: HexCoord[],
  margin = 0.08
): ImageOverlayTransform {
  const unit = 1;
  const centers = landCoords.map((c) => hexToPixel(c, unit));
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const boardW = maxX - minX + 2;
  const boardH = maxY - minY + 2;
  const usableW = imageWidth * (1 - 2 * margin);
  const usableH = imageHeight * (1 - 2 * margin);
  const hexSize = Math.min(usableW / boardW, usableH / boardH);
  const boardCenterX = ((minX + maxX) / 2) * hexSize;
  const boardCenterY = ((minY + maxY) / 2) * hexSize;
  return {
    centerX: imageWidth / 2 - boardCenterX,
    centerY: imageHeight / 2 - boardCenterY,
    hexSize,
    rotationDeg: 0,
  };
}

/**
 * Sample terreng i ring rundt tallskiven (tallbrikken ligger oppå ressursen).
 * Filtrerer bort krem/hav; bruker median for robusthet mot støy.
 */
export function sampleTerrainColor(
  imageData: RgbaImageBuffer,
  cx: number,
  cy: number,
  hexSize: number,
  excludeRadius = 0
): Rgb | null {
  // Start utenfor tallskiven — ikke sample kremflaten som «ørkenbeige»
  const inner = Math.max(hexSize * 0.36, excludeRadius * 1.12, hexSize * 0.28);
  const outer = Math.max(inner + hexSize * 0.12, hexSize * 0.6);
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  for (let ring = 0; ring < 5; ring++) {
    const rad = inner + ((ring + 0.5) / 5) * (outer - inner);
    const count = 24 + ring * 8;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const px = readPixel(imageData, cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
      if (!px || !isTerrainSamplePixel(px)) continue;
      rs.push(px.r);
      gs.push(px.g);
      bs.push(px.b);
    }
  }

  if (rs.length < 12) return null;
  const mid = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  return { r: mid(rs), g: mid(gs), b: mid(bs) };
}

/** @deprecated bruk sampleTerrainColor */
export function sampleRingAverage(
  imageData: RgbaImageBuffer,
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  _sampleCount = 48
): Rgb | null {
  return sampleTerrainColor(
    imageData,
    cx,
    cy,
    (innerRadius + outerRadius) / 0.9
  );
}

function luminance(rgb: Rgb): number {
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

/** Forventet pip-antall på standard Catan-tallskive. */
export function expectedPipCount(n: number): number {
  switch (n) {
    case 2:
    case 12:
      return 1;
    case 3:
    case 11:
      return 2;
    case 4:
    case 10:
      return 3;
    case 5:
    case 9:
      return 4;
    case 6:
    case 8:
      return 5;
    default:
      return 0;
  }
}

export function numberPoolForBoardSize(boardSize: BoardSize): number[] {
  return boardSize === 'base' ? [...NUMBERS_BASE] : [...NUMBERS_EXTENSION_56];
}

interface CreamDisc {
  x: number;
  y: number;
  radius: number;
  score: number;
}

/**
 * Finn kremfarget tallskive nær hex-senter.
 * Start i hex-senter (stabilt); små nudges bare hvis det øker scoren klart.
 */
export function locateCreamDisc(
  imageData: RgbaImageBuffer,
  cx: number,
  cy: number,
  hexSize: number
): CreamDisc | null {
  const radii = [hexSize * 0.185, hexSize * 0.2, hexSize * 0.215, hexSize * 0.23];
  let best: CreamDisc | null = null;

  for (const radius of radii) {
    const score = creamDiscScore(imageData, cx, cy, radius);
    if (!best || score > best.score) {
      best = { x: cx, y: cy, radius, score };
    }
  }

  const searchR = hexSize * 0.055;
  const step = Math.max(1.2, hexSize * 0.03);
  for (let oy = -searchR; oy <= searchR; oy += step) {
    for (let ox = -searchR; ox <= searchR; ox += step) {
      if (ox === 0 && oy === 0) continue;
      if (ox * ox + oy * oy > searchR * searchR) continue;
      const centerBias = 1 - (Math.hypot(ox, oy) / (searchR + 1)) * 0.55;
      for (const radius of radii) {
        const raw = creamDiscScore(imageData, cx + ox, cy + oy, radius);
        const score = raw * centerBias;
        if (best && score > best.score + 0.05) {
          best = { x: cx + ox, y: cy + oy, radius, score };
        }
      }
    }
  }

  if (!best || best.score < 0.35) return null;
  return best;
}

function creamDiscScore(
  imageData: RgbaImageBuffer,
  cx: number,
  cy: number,
  radius: number
): number {
  let cream = 0;
  let total = 0;
  let ink = 0;
  let outerCream = 0;
  let outerTotal = 0;

  const innerSamples = 36;
  for (let i = 0; i < innerSamples; i++) {
    const ang = (i / innerSamples) * Math.PI * 2;
    for (const rFrac of [0.25, 0.5, 0.72]) {
      const r = radius * rFrac;
      const px = readPixel(imageData, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      if (!px) continue;
      total += 1;
      const hsv = rgbToHsv(px.r, px.g, px.b);
      const lum = luminance(px);
      if (hsv.v >= 0.65 && hsv.s <= 0.32) cream += 1;
      else if (hsv.v >= 0.72 && hsv.s <= 0.42) cream += 0.55;
      if (lum < 150 && (hsv.v < 0.75 || hsv.s > 0.4)) ink += 1;
    }
    const outerPx = readPixel(
      imageData,
      cx + Math.cos(ang) * radius * 0.9,
      cy + Math.sin(ang) * radius * 0.9
    );
    if (outerPx) {
      outerTotal += 1;
      const hsv = rgbToHsv(outerPx.r, outerPx.g, outerPx.b);
      if (hsv.v >= 0.62 && hsv.s <= 0.38) outerCream += 1;
    }
  }
  if (total < 12) return 0;

  const creamRatio = cream / total;
  const outerCreamRatio = outerTotal > 0 ? outerCream / outerTotal : 0;
  const inkRatio = ink / total;

  // Må være en kremskive — ikke terreng med litt lyst midtparti
  if (creamRatio < 0.35 || outerCreamRatio < 0.4) return creamRatio * 0.1;

  // Tallbrikke har sifferblekk; ørkensand kan være krem uten blekk
  if (inkRatio < 0.012) return creamRatio * 0.12 + outerCreamRatio * 0.05;

  const inkTerm =
    inkRatio >= 0.015 && inkRatio <= 0.5 ? 0.3 : inkRatio < 0.012 ? -0.2 : 0.08;

  return creamRatio * 0.45 + outerCreamRatio * 0.22 + inkTerm;
}

/** True når vi har en ekte tallbrikke (krem + blekk), ikke bare lyst terreng. */
export function isNumberTokenDisc(disc: CreamDisc | null): boolean {
  return !!disc && disc.score >= 0.35;
}

export interface NumberTokenFeatures {
  isRed: boolean;
  wideDigit: boolean;
  /** Blekk øverst / nederst i token-lokal orientering (9 > 5). */
  topHeavyRatio: number;
  /** Blekk nederst / øverst (6 > 8). */
  bottomHeavyRatio: number;
  inkRatio: number;
  discScore: number;
  hasOrientationDot: boolean;
  /** Estimert «ned»-vinkel (atan2) fra punktum bak tallet, eller null. */
  downAngle: number | null;
  /** Bredde/høyde for sifferets bbox. */
  digitAspect: number;
  /** Andel blekk i venstre halvdel (3/åpne siffer lavere). */
  leftInkRatio: number;
}

/** Roter punkt slik at token-«ned» blir +Y. */
export function toTokenLocal(
  x: number,
  y: number,
  downAngle: number
): { x: number; y: number } {
  const rot = Math.PI / 2 - downAngle;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * Finn orienteringspunktum («punktum bak tallet»).
 * Returnerer tyngdepunktet til en liten, isolert blekk-klump utenfor hovedsifferet.
 */
export function findOrientationDot(
  inkPixels: { x: number; y: number }[],
  radius: number
): { x: number; y: number } | null {
  if (inkPixels.length < 6) return null;

  // Enkel grid-clustering
  const cell = Math.max(1.2, radius * 0.06);
  const buckets = new Map<string, { x: number; y: number; n: number }>();
  for (const p of inkPixels) {
    const kx = Math.round(p.x / cell);
    const ky = Math.round(p.y / cell);
    const key = `${kx},${ky}`;
    const b = buckets.get(key);
    if (b) {
      b.x += p.x;
      b.y += p.y;
      b.n += 1;
    } else {
      buckets.set(key, { x: p.x, y: p.y, n: 1 });
    }
  }

  type Comp = { x: number; y: number; n: number; cells: string[] };
  const cellKeys = [...buckets.keys()];
  const visited = new Set<string>();
  const comps: Comp[] = [];

  const neighbors = (key: string): string[] => {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    const out: string[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const k = `${x + dx},${y + dy}`;
        if (buckets.has(k)) out.push(k);
      }
    }
    return out;
  };

  for (const start of cellKeys) {
    if (visited.has(start)) continue;
    const stack = [start];
    visited.add(start);
    let sx = 0;
    let sy = 0;
    let n = 0;
    const cells: string[] = [];
    while (stack.length) {
      const k = stack.pop()!;
      cells.push(k);
      const b = buckets.get(k)!;
      sx += b.x;
      sy += b.y;
      n += b.n;
      for (const nb of neighbors(k)) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        stack.push(nb);
      }
    }
    comps.push({ x: sx / n, y: sy / n, n, cells });
  }

  if (comps.length === 0) return null;
  comps.sort((a, b) => b.n - a.n);
  const main = comps[0]!;
  const mainR = Math.hypot(main.x, main.y);

  // Punktum: liten komponent, ikke for nær siffer-kjernen, innenfor skiven
  const minDot = Math.max(2, inkPixels.length * 0.01);
  const maxDot = Math.max(8, inkPixels.length * 0.18);
  let best: Comp | null = null;
  let bestScore = -Infinity;
  for (const c of comps.slice(1)) {
    if (c.n < minDot || c.n > maxDot) continue;
    const r = Math.hypot(c.x, c.y);
    if (r < radius * 0.2 || r > radius * 0.95) continue;
    // Helst litt utenfor hovedsifferets radius
    const distMain = Math.hypot(c.x - main.x, c.y - main.y);
    if (distMain < radius * 0.15) continue;
    const score =
      (1 - c.n / (maxDot + 1)) * 0.5 +
      Math.min(1, distMain / (radius * 0.4)) * 0.35 +
      (r > mainR ? 0.15 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return null;
  return { x: best.x, y: best.y };
}

/**
 * Estimer brikkens «ned»-retning fra orienteringspunktum bak tallet.
 * Faller tilbake til null hvis punktum ikke finnes.
 */
export function estimateTokenDownAngle(
  inkPixels: { x: number; y: number }[],
  radius: number
): number | null {
  const dot = findOrientationDot(inkPixels, radius);
  if (!dot) return null;
  return Math.atan2(dot.y, dot.x);
}

/** @deprecated Pip-bue brukes ikke lenger — beholdt for bakoverkompatibilitet. */
export function countPipsBottomArc(
  inkPixels: { x: number; y: number }[],
  radius: number
): number {
  const dot = findOrientationDot(inkPixels, radius);
  return dot ? 1 : 0;
}

/**
 * Trekk trekk ut fra tallskiven.
 * Orientering fra punktum bak tallet; 6/8 er røde; ingen pip-bue.
 */
export function extractNumberTokenFeatures(
  imageData: RgbaImageBuffer,
  disc: CreamDisc
): NumberTokenFeatures | null {
  const { x: cx, y: cy, radius } = disc;
  const samples: { x: number; y: number; rgb: Rgb; lum: number; hsv: Hsv }[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const rgb = readPixel(imageData, cx + dx, cy + dy);
      if (!rgb) continue;
      samples.push({
        x: dx,
        y: dy,
        rgb,
        lum: luminance(rgb),
        hsv: rgbToHsv(rgb.r, rgb.g, rgb.b),
      });
    }
  }
  if (samples.length < 24) return null;

  const lums = samples.map((s) => s.lum).sort((a, b) => a - b);
  const medianLum = lums[Math.floor(lums.length / 2)]!;
  const creamLums = samples
    .filter((s) => s.hsv.v >= 0.62 && s.hsv.s <= 0.35)
    .map((s) => s.lum)
    .sort((a, b) => a - b);
  const creamMedian =
    creamLums.length >= 8
      ? creamLums[Math.floor(creamLums.length / 2)]!
      : medianLum;
  const darkThresh = Math.min(creamMedian - 35, 160);

  const ink = samples.filter((s) => {
    if (s.lum > darkThresh) return false;
    if (s.lum > creamMedian * 0.78) return false;
    return true;
  });
  if (ink.length < 4) {
    return {
      isRed: false,
      wideDigit: false,
      topHeavyRatio: 1,
      bottomHeavyRatio: 1,
      inkRatio: ink.length / samples.length,
      discScore: disc.score,
      hasOrientationDot: false,
      downAngle: null,
      digitAspect: 1,
      leftInkRatio: 0.5,
    };
  }

  const redInk = ink.filter((s) => {
    const { h, s: sat } = s.hsv;
    return sat > 0.35 && (h <= 35 || h >= 335);
  });
  const isRed = redInk.length / ink.length > 0.22;

  const downAngle = estimateTokenDownAngle(ink, radius);
  const hasOrientationDot = downAngle != null;
  const localInk =
    downAngle == null
      ? ink
      : ink.map((p) => {
          const loc = toTokenLocal(p.x, p.y, downAngle);
          return { ...p, x: loc.x, y: loc.y };
        });

  // Ekskluder punktum (nedre ytre) fra sifferanalyse når vi har orientering
  const digitInk = localInk.filter((s) => {
    const r = Math.hypot(s.x, s.y);
    if (r >= radius * 0.55) return false;
    // Punktum bak tallet ligger typisk «ned» og litt utenfor sifferet
    if (hasOrientationDot && s.y > radius * 0.28 && r > radius * 0.22) return false;
    return true;
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let upper = 0;
  let lower = 0;
  let left = 0;
  let right = 0;
  for (const p of digitInk) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    if (p.y < -radius * 0.02) upper += 1;
    else lower += 1;
    if (p.x < 0) left += 1;
    else right += 1;
  }
  const digitWidth = digitInk.length > 5 ? maxX - minX : 0;
  const digitHeight = digitInk.length > 5 ? maxY - minY : 0;
  const wideDigit = digitWidth > radius * 0.55;
  const digitAspect =
    digitHeight > 1e-3 ? digitWidth / digitHeight : wideDigit ? 1.2 : 0.7;
  const topHeavyRatio =
    upper + lower === 0 ? 1 : lower === 0 ? 1 : upper / lower;
  const bottomHeavyRatio =
    upper + lower === 0 ? 1 : upper === 0 ? 2 : lower / upper;
  const leftInkRatio =
    left + right === 0 ? 0.5 : left / (left + right);

  return {
    isRed,
    wideDigit,
    topHeavyRatio,
    bottomHeavyRatio,
    inkRatio: ink.length / samples.length,
    discScore: disc.score,
    hasOrientationDot,
    downAngle,
    digitAspect,
    leftInkRatio,
  };
}

/** Soft-score for hvert lovlige tall: rød=6/8, punktum-orientering, sifferform (ingen pip-bue). */
export function scoreNumberHypotheses(
  features: NumberTokenFeatures
): Partial<Record<PhotoBoardNumber, number>> {
  const scores: Partial<Record<PhotoBoardNumber, number>> = {};
  if (features.inkRatio < 0.02) return scores;

  const clearlyFive = features.topHeavyRatio < 0.9;
  const clearlyNine = features.topHeavyRatio > 1.35;
  const preferSix = features.bottomHeavyRatio >= 1.15;
  const orientBoost = features.hasOrientationDot ? 0.1 : 0;

  // Rødt blekk ⇒ 6 eller 8. Skill på tyngde (6 mer nederst) og punktum.
  if (features.isRed) {
    scores[6] = (preferSix ? 0.92 : 0.7) + orientBoost;
    scores[8] = (preferSix ? 0.68 : 0.92) + orientBoost;
    if (features.hasOrientationDot && preferSix) scores[6]! += 0.08;
    for (const n of PHOTO_BOARD_NUMBERS) {
      if (n !== 6 && n !== 8) scores[n] = -0.25;
    }
    return scores;
  }

  for (const n of PHOTO_BOARD_NUMBERS) {
    if (n === 6 || n === 8) {
      scores[n] = -0.25; // ikke rød → ikke 6/8
      continue;
    }

    let score = 0.4 + orientBoost + Math.min(0.08, features.discScore * 0.1);
    const expectWide = n >= 10;
    if (features.wideDigit === expectWide) score += 0.32;
    else score -= 0.3;

    if (n === 5) {
      if (clearlyFive) score += 0.28;
      else if (clearlyNine) score -= 0.12;
      else score += 0.02;
    }
    if (n === 9) {
      if (clearlyNine) score += 0.32;
      else if (clearlyFive) score -= 0.1;
      else score += 0.04;
      // 9 har typisk punktum bak for å skille fra 6
      if (features.hasOrientationDot) score += 0.1;
    }

    if (n === 10) score += features.digitAspect > 0.95 ? 0.1 : 0.02;
    if (n === 11) score += features.digitAspect > 1.05 ? 0.12 : features.wideDigit ? 0.05 : -0.05;
    if (n === 12) score += features.digitAspect > 0.9 ? 0.08 : 0;

    if (n === 2) score += 0.06;
    if (n === 3) score += features.leftInkRatio < 0.42 ? 0.12 : 0.04;
    if (n === 4) score += features.digitAspect < 0.85 ? 0.1 : 0.05;

    scores[n] = score;
  }
  return scores;
}

export function bestNumberFromFeatures(
  features: NumberTokenFeatures
): { number: PhotoBoardNumber | null; confidence: number } {
  const scores = scoreNumberHypotheses(features);
  let best: PhotoBoardNumber | null = null;
  let bestScore = -Infinity;
  let second = -Infinity;
  for (const n of PHOTO_BOARD_NUMBERS) {
    const s = scores[n];
    if (s == null) continue;
    if (s > bestScore) {
      second = bestScore;
      bestScore = s;
      best = n;
    } else if (s > second) {
      second = s;
    }
  }
  if (best == null || bestScore < 0.2) {
    return { number: null, confidence: 0.15 };
  }
  const margin = bestScore - (Number.isFinite(second) ? second : 0);
  const confidence = clamp(0.35 + bestScore * 0.35 + margin * 0.4, 0.3, 0.95);
  return { number: best, confidence };
}

/**
 * Analyser tallskiven: krever bekreftet krem-tallbrikke med blekk.
 * Ørken har aldri tallbrikke — kall ikke denne for ørken-hex.
 */
export function guessNumberFromCenterPatch(
  imageData: RgbaImageBuffer,
  cx: number,
  cy: number,
  hexSize: number,
  resource: ResourceType | null,
  disc?: CreamDisc | null
): {
  number: number | null;
  confidence: number;
  scores?: Partial<Record<PhotoBoardNumber, number>>;
  hasDisc?: boolean;
} {
  if (resource === 'desert') {
    return { number: null, confidence: 0.95, scores: {}, hasDisc: false };
  }

  const found = disc === undefined ? locateCreamDisc(imageData, cx, cy, hexSize) : disc;
  if (!isNumberTokenDisc(found)) {
    // Ingen tallbrikke → ikke gjett tall fra terrengtekstur
    return { number: null, confidence: 0.08, scores: {}, hasDisc: false };
  }

  const features = extractNumberTokenFeatures(imageData, found!);
  if (!features || features.inkRatio < 0.02) {
    return { number: null, confidence: 0.15, scores: {}, hasDisc: true };
  }

  const scores = scoreNumberHypotheses(features);
  const best = bestNumberFromFeatures(features);
  return { ...best, scores, hasDisc: true };
}

/** Hvor ørken-aktig er en terrengfarge (høyere = mer ørken). */
export function desertLikeness(rgb: Rgb): number {
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const warm = hsv.h >= 20 && hsv.h <= 60 ? 1 : hsv.h >= 15 && hsv.h <= 70 ? 0.45 : 0;
  const satOk = hsv.s >= 0.08 && hsv.s <= 0.5 ? 1 - Math.abs(hsv.s - 0.28) : 0.15;
  const valOk = hsv.v >= 0.42 && hsv.v <= 0.95 ? hsv.v : 0.2;
  return warm * 0.45 + satOk * 0.25 + valOk * 0.3;
}

/**
 * Klassifiser ressurs på nytt uten ørken-kandidat (når tallbrikke finnes).
 */
export function classifyNonDesertResource(rgb: Rgb): ResourceGuess {
  const base = classifyResourceFromRgb(rgb);
  if (base.resource !== 'desert') return base;
  // Fall tilbake til malm for beige som egentlig var tallskive-lekkasje / lys malm
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  if (hsv.s < 0.22 || hsv.v < 0.55) {
    return { resource: 'ore', confidence: Math.max(base.confidence, 0.5), rgb };
  }
  // Varm og mettet uten ørken-lov → korn
  if (hsv.h >= 35 && hsv.h <= 70 && hsv.s >= 0.28) {
    return { resource: 'wheat', confidence: 0.45, rgb };
  }
  return { resource: 'ore', confidence: 0.48, rgb };
}

export function expectedDesertCount(boardSize: BoardSize): number {
  return boardSize === 'base' ? 1 : 2;
}

/**
 * Tilordne ørken hardt: ørken har ALDRI tallbrikke.
 * Hex med tallbrikke kan ikke være ørken. Blant hex uten tallbrikke
 * plukkes de mest ørken-aktige opp til forventet antall.
 */
export function assignDesertsByNumberTokens(
  entries: {
    resource: ResourceGuess | null;
    hasNumberToken: boolean;
    terrainRgb: Rgb | null;
  }[],
  desertCount: number
): (ResourceGuess | null)[] {
  const out = entries.map((e) => e.resource);

  // 1) Tallbrikke ⇒ aldri ørken
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i]!.hasNumberToken) continue;
    const g = out[i];
    if (g?.resource === 'desert') {
      out[i] = entries[i]!.terrainRgb
        ? classifyNonDesertResource(entries[i]!.terrainRgb!)
        : { resource: 'ore', confidence: 0.55, rgb: g.rgb };
    }
  }

  // 2) Kandidater uten tallbrikke
  const candidates = entries
    .map((e, i) => ({
      i,
      score: e.hasNumberToken
        ? -1
        : e.terrainRgb
          ? desertLikeness(e.terrainRgb)
          : 0.2,
    }))
    .filter((c) => c.score >= 0)
    .sort((a, b) => b.score - a.score);

  const desertIdx = new Set(
    candidates.slice(0, Math.max(0, desertCount)).map((c) => c.i)
  );

  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.hasNumberToken) continue;
    if (desertIdx.has(i)) {
      const rgb = entries[i]!.terrainRgb ?? out[i]?.rgb ?? { r: 200, g: 180, b: 125 };
      out[i] = { resource: 'desert', confidence: 0.85, rgb };
    } else if (out[i]?.resource === 'desert') {
      // Ekstra «ørken» uten tallbrikke men ikke valgt → malm
      out[i] = entries[i]!.terrainRgb
        ? classifyNonDesertResource(entries[i]!.terrainRgb!)
        : { resource: 'ore', confidence: 0.5, rgb: out[i]!.rgb };
    }
  }

  return out;
}

/**
 * @deprecated Bruk assignDesertsByNumberTokens. Beholdt for tester.
 * Kremskive ⇒ ikke ørken; ingen skive alene avgjør ikke ørken lenger.
 */
export function reconcileOreDesertWithDisc(
  guess: ResourceGuess | null,
  hasCreamDisc: boolean
): ResourceGuess | null {
  if (!guess) return guess;
  if (hasCreamDisc && guess.resource === 'desert') {
    return classifyNonDesertResource(guess.rgb);
  }
  return guess;
}

/**
 * Tilordne tall globalt mot kjent Catan-pool.
 * Kun sterke lokale treff — fyller IKKE inn svake gjetninger (bedre tomt enn feil).
 */
export function assignNumbersWithPool(
  hexScores: {
    scores: Partial<Record<PhotoBoardNumber, number>>;
    localNumber: number | null;
    localConfidence: number;
    hasToken?: boolean;
  }[],
  pool: number[]
): { number: PhotoBoardNumber | null; confidence: number }[] {
  const n = hexScores.length;
  const result: { number: PhotoBoardNumber | null; confidence: number }[] = hexScores.map(
    () => ({ number: null, confidence: 0.2 })
  );

  const available = [...pool];
  const usedHex = new Set<number>();

  type Cand = { hi: number; num: PhotoBoardNumber; score: number };
  const cands: Cand[] = [];
  for (let hi = 0; hi < n; hi++) {
    if (hexScores[hi]!.hasToken === false) continue;
    const scores = hexScores[hi]!.scores;
    // Finn beste og nest beste for margin
    let bestNum: PhotoBoardNumber | null = null;
    let bestScore = -Infinity;
    let second = -Infinity;
    for (const num of PHOTO_BOARD_NUMBERS) {
      const score = scores[num];
      if (score == null) continue;
      if (score > bestScore) {
        second = bestScore;
        bestScore = score;
        bestNum = num;
      } else if (score > second) {
        second = score;
      }
    }
    if (bestNum == null || bestScore < 0.45) continue;
    const margin = bestScore - (Number.isFinite(second) ? second : 0);
    // Rød 6/8: lavere margin-krav; ellers krev tydelig vinner
    const isRedPair = bestNum === 6 || bestNum === 8;
    if (!isRedPair && margin < 0.06 && bestScore < 0.7) continue;
    cands.push({
      hi,
      num: bestNum,
      score: bestScore + margin * 0.5,
    });
  }
  cands.sort((a, b) => b.score - a.score);

  for (const c of cands) {
    if (usedHex.has(c.hi)) continue;
    const idx = available.indexOf(c.num);
    if (idx < 0) {
      // Prøv alternativ for rød: 6↔8
      if (c.num === 6 || c.num === 8) {
        const alt = c.num === 6 ? 8 : 6;
        const altIdx = available.indexOf(alt);
        if (altIdx < 0) continue;
        available.splice(altIdx, 1);
        usedHex.add(c.hi);
        result[c.hi] = {
          number: alt,
          confidence: clamp(0.45 + c.score * 0.3, 0.4, 0.9),
        };
      }
      continue;
    }
    available.splice(idx, 1);
    usedHex.add(c.hi);
    result[c.hi] = {
      number: c.num,
      confidence: clamp(0.45 + c.score * 0.35, 0.42, 0.96),
    };
  }

  return result;
}

export function mapPipsToNumber(
  pipCount: number,
  isRed: boolean,
  wideDigit: boolean
): PhotoBoardNumber | null {
  const p = clamp(Math.round(pipCount), 0, 5);
  if (p <= 0) return null;
  if (p === 5) return isRed ? 6 : 8;
  if (p === 4) return 5;
  if (p === 3) return wideDigit ? 10 : 4;
  if (p === 2) return wideDigit ? 11 : 3;
  if (p === 1) return wideDigit ? 12 : 2;
  return null;
}

/** 5 vs 9: 9 har mer blekk øverst (løkke). Ambivalent → ingen sterk preferanse. */
export function preferFiveOverNine(topHeavyRatio: number): boolean {
  return topHeavyRatio < 0.95;
}

/** Bakoverkompatibel stub — bruk guessNumberFromCenterPatch. */
export function guessNumberFromCenter(
  resource: ResourceType | null,
  _centerRgb: Rgb | null
): { number: number | null; confidence: number } {
  if (resource === 'desert') return { number: null, confidence: 0.9 };
  return { number: null, confidence: 0 };
}

export function recognizeBoardFromImageData(
  imageData: RgbaImageBuffer,
  transform: ImageOverlayTransform,
  boardSize: BoardSize = 'base',
  imageAdjust: ImageAdjust = defaultImageAdjust()
): BoardRecognitionResult {
  const landCoords = getLandHexCoords(boardSize);
  const sampleHexSize = transform.hexSize / (imageAdjust.zoom || 1);

  type Pending = {
    coord: HexCoord;
    terrainRgb: Rgb | null;
    resource: ResourceGuess | null;
    disc: CreamDisc | null;
    hasNumberToken: boolean;
    localNumber: number | null;
    localConfidence: number;
    scores: Partial<Record<PhotoBoardNumber, number>>;
  };

  const pending: Pending[] = [];

  for (const coord of landCoords) {
    const display = axialToImagePixel(coord, transform);
    const { x, y } = displayToImagePixel(
      display.x,
      display.y,
      imageData.width,
      imageData.height,
      imageAdjust
    );

    // Tallbrikken ligger oppå ressursen — finn den først
    const disc = locateCreamDisc(imageData, x, y, sampleHexSize);
    const hasNumberToken = isNumberTokenDisc(disc);

    const terrain = sampleTerrainColor(
      imageData,
      x,
      y,
      sampleHexSize,
      hasNumberToken && disc ? disc.radius : sampleHexSize * 0.2
    );

    const resourceGuess: ResourceGuess | null = terrain
      ? classifyResourceFromRgb(terrain)
      : null;

    pending.push({
      coord,
      terrainRgb: terrain,
      resource: resourceGuess,
      disc,
      hasNumberToken,
      localNumber: null,
      localConfidence: 0.1,
      scores: {},
    });
  }

  // Ørken = ingen tallbrikke (hard regel + forventet antall)
  const desertAssigned = assignDesertsByNumberTokens(
    pending.map((p) => ({
      resource: p.resource,
      hasNumberToken: p.hasNumberToken,
      terrainRgb: p.terrainRgb,
    })),
    expectedDesertCount(boardSize)
  );
  for (let i = 0; i < pending.length; i++) {
    pending[i]!.resource = desertAssigned[i] ?? pending[i]!.resource;
  }

  // Tall kun der det finnes tallbrikke (ørken har aldri)
  for (const p of pending) {
    if (p.resource?.resource === 'desert' || !p.hasNumberToken) {
      p.localNumber = null;
      p.localConfidence = p.resource?.resource === 'desert' ? 0.95 : 0.08;
      p.scores = {};
      continue;
    }
    const display = axialToImagePixel(p.coord, transform);
    const { x, y } = displayToImagePixel(
      display.x,
      display.y,
      imageData.width,
      imageData.height,
      imageAdjust
    );
    const numberGuess = guessNumberFromCenterPatch(
      imageData,
      x,
      y,
      sampleHexSize,
      p.resource?.resource ?? null,
      p.disc
    );
    p.localNumber = numberGuess.number;
    p.localConfidence = numberGuess.confidence;
    p.scores = numberGuess.scores ?? {};
  }

  const numberedIdx: number[] = [];
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i]!;
    if (p.resource?.resource === 'desert') continue;
    if (!p.hasNumberToken) continue;
    numberedIdx.push(i);
  }

  const pool = numberPoolForBoardSize(boardSize);
  const assignment = assignNumbersWithPool(
    numberedIdx.map((i) => ({
      scores: pending[i]!.scores,
      localNumber: pending[i]!.localNumber,
      localConfidence: pending[i]!.localConfidence,
      hasToken: true,
    })),
    numberedIdx.length === pool.length
      ? pool
      : pickPoolSubset(pool, numberedIdx.length)
  );

  const hexes: HexRecognitionResult[] = pending.map((p, i) => {
    if (p.resource?.resource === 'desert') {
      return {
        coord: p.coord,
        resource: p.resource,
        number: null,
        numberConfidence: 0.95,
      };
    }
    const slot = numberedIdx.indexOf(i);
    if (slot < 0) {
      return {
        coord: p.coord,
        resource: p.resource,
        number: null,
        numberConfidence: 0.1,
      };
    }
    const assigned = assignment[slot];
    const number =
      assigned?.number != null && isPhotoBoardNumber(assigned.number)
        ? assigned.number
        : null;
    return {
      coord: p.coord,
      resource: p.resource,
      number,
      numberConfidence: assigned?.confidence ?? p.localConfidence,
    };
  });

  return {
    hexes,
    recognizedResources: hexes.filter((h) => h.resource).length,
    recognizedNumbers: hexes.filter(
      (h) => h.resource?.resource === 'desert' || h.number !== null
    ).length,
  };
}

/** Velg en lovlig delmengde av tallpoolen (bevarer relative antall best mulig). */
function pickPoolSubset(pool: number[], count: number): number[] {
  if (count >= pool.length) return [...pool];
  // Foretrekk å beholde vanlige tall (4–10) når vi må kutte
  const sorted = [...pool].sort((a, b) => {
    const rank = (n: number) =>
      n === 6 || n === 8 ? 0 : n === 5 || n === 9 ? 1 : n === 4 || n === 10 ? 2 : 3;
    return rank(a) - rank(b) || a - b;
  });
  return sorted.slice(0, count);
}

/** Slå gjenkjenningsresultat inn i et land-utkast. */
export function applyRecognitionToDraft(
  draft: LandHexDraft[],
  recognition: BoardRecognitionResult,
  options: { overwriteResources?: boolean; overwriteNumbers?: boolean } = {}
): LandHexDraft[] {
  const { overwriteResources = true, overwriteNumbers = true } = options;
  const byKey = new Map(
    recognition.hexes.map((h) => [`${h.coord.q},${h.coord.r}`, h])
  );

  return draft.map((d) => {
    const hit = byKey.get(landDraftKey(d));
    if (!hit) return d;
    const next: LandHexDraft = { ...d };
    if (overwriteResources && hit.resource) {
      next.resource = hit.resource.resource;
      if (next.resource === 'desert') next.number = null;
    }
    if (overwriteNumbers) {
      if (next.resource === 'desert') next.number = null;
      else if (hit.number !== null && hit.numberConfidence >= 0.35) {
        next.number = hit.number;
      }
    } else if (next.resource === 'desert') {
      next.number = null;
    }
    return next;
  });
}

export function freshDraftWithRecognition(
  recognition: BoardRecognitionResult,
  boardSize: BoardSize
): LandHexDraft[] {
  return applyRecognitionToDraft(
    createEmptyLandDraft(boardSize),
    recognition,
    { overwriteResources: true, overwriteNumbers: true }
  );
}

/** Last bilde-URL til ImageData (browser). `scale` mapper overlay-koordinater → buffer. */
export async function loadImageDataFromUrl(
  url: string
): Promise<{ imageData: ImageData; width: number; height: number; scale: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Kunne ikke laste bilde'));
    el.src = url;
  });

  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  // Nedskaler svært store foto for raskere/stabil sampling
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D-context utilgjengelig');
  ctx.drawImage(img, 0, 0, w, h);
  return { imageData: ctx.getImageData(0, 0, w, h), width: w, height: h, scale };
}

/** Skaler overlay fra visnings-/natural-koordinater til gjenkjenningsbuffer. */
export function scaleTransformForRecognition(
  transform: ImageOverlayTransform,
  scale: number
): ImageOverlayTransform {
  if (scale === 1) return transform;
  return {
    centerX: transform.centerX * scale,
    centerY: transform.centerY * scale,
    hexSize: transform.hexSize * scale,
    rotationDeg: transform.rotationDeg,
  };
}

export function nudgeTransform(
  transform: ImageOverlayTransform,
  patch: Partial<ImageOverlayTransform>
): ImageOverlayTransform {
  return {
    ...transform,
    ...patch,
    hexSize: clamp(patch.hexSize ?? transform.hexSize, 8, 400),
    rotationDeg: patch.rotationDeg ?? transform.rotationDeg,
  };
}
