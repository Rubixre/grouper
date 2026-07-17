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
  // Lys tallskive (krem/hvit)
  if (hsv.v > 0.82 && hsv.s < 0.22) return false;
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
 * Sample terreng i ring rundt tallskiven.
 * Filtrerer bort krem/hav; bruker median for robusthet mot støy.
 */
export function sampleTerrainColor(
  imageData: RgbaImageBuffer,
  cx: number,
  cy: number,
  hexSize: number
): Rgb | null {
  const inner = hexSize * 0.34;
  const outer = hexSize * 0.58;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  for (let ring = 0; ring < 4; ring++) {
    const rad = inner + ((ring + 0.5) / 4) * (outer - inner);
    const count = 20 + ring * 8;
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

  if (!best || best.score < 0.25) return null;
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

  const inkTerm =
    inkRatio >= 0.015 && inkRatio <= 0.45 ? 0.25 : inkRatio < 0.008 ? -0.15 : 0.05;

  return creamRatio * 0.5 + outerCreamRatio * 0.25 + inkTerm;
}

export interface NumberTokenFeatures {
  pipCount: number;
  isRed: boolean;
  wideDigit: boolean;
  topHeavyRatio: number;
  inkRatio: number;
  discScore: number;
  /** Estimert «ned»-vinkel for brikken (atan2), eller null. */
  downAngle: number | null;
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
 * Estimer brikkens «ned»-retning fra pip-ringen (tyngdepunkt av ytre blekk).
 * Pipene ligger alltid i en bue under sifferet, uansett rotasjon.
 */
export function estimateTokenDownAngle(
  inkPixels: { x: number; y: number }[],
  radius: number
): number | null {
  const pipInner = radius * 0.38;
  const pipOuter = radius * 0.99;
  const ring = inkPixels.filter((s) => {
    const r = Math.hypot(s.x, s.y);
    return r >= pipInner && r <= pipOuter;
  });
  if (ring.length < 3) return null;

  let sx = 0;
  let sy = 0;
  for (const p of ring) {
    sx += p.x;
    sy += p.y;
  }
  if (Math.hypot(sx, sy) < radius * 0.15) {
    // Nesten jevnt rundt — fall tilbake til bilde-ned
    return Math.PI / 2;
  }
  return Math.atan2(sy, sx);
}

/**
 * Trekk trekk ut fra tallskiven. Pipene på ekte Catan-brikker ligger i
 * en bue under sifferet — vi normaliserer først til token-lokal orientering
 * så rotasjon av brikken ikke ødelegger pip-/sifferanalyse.
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
  // Blekk relativt til krem — ikke til blandet median (terreng kan trekke ned)
  const darkThresh = Math.min(creamMedian - 35, 160);

  const ink = samples.filter((s) => {
    if (s.lum > darkThresh) return false;
    if (s.lum > creamMedian * 0.78) return false;
    return true;
  });
  if (ink.length < 4) {
    return {
      pipCount: 0,
      isRed: false,
      wideDigit: false,
      topHeavyRatio: 1,
      inkRatio: ink.length / samples.length,
      discScore: disc.score,
      downAngle: null,
    };
  }

  const redInk = ink.filter((s) => {
    const { h, s: sat } = s.hsv;
    return sat > 0.35 && (h <= 35 || h >= 335);
  });
  const isRed = redInk.length / ink.length > 0.12;

  const downAngle = estimateTokenDownAngle(ink, radius);
  const localInk =
    downAngle == null
      ? ink
      : ink.map((p) => {
          const loc = toTokenLocal(p.x, p.y, downAngle);
          return { ...p, x: loc.x, y: loc.y };
        });

  // Siffer: indre del av skiven, i token-lokal orientering
  const digitInk = localInk.filter((s) => Math.hypot(s.x, s.y) < radius * 0.52);
  let minX = Infinity;
  let maxX = -Infinity;
  let upper = 0;
  let lower = 0;
  for (const p of digitInk) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    if (p.y < -radius * 0.02) upper += 1;
    else lower += 1;
  }
  const digitWidth = digitInk.length > 5 ? maxX - minX : 0;
  const wideDigit = digitWidth > radius * 0.55;
  const topHeavyRatio =
    upper + lower === 0
      ? 1
      : lower === 0
        ? 1
        : upper / lower;

  const pipCount = countPipsBottomArc(localInk, radius);

  return {
    pipCount,
    isRed,
    wideDigit,
    topHeavyRatio,
    inkRatio: ink.length / samples.length,
    discScore: disc.score,
    downAngle,
  };
}

/**
 * Tell pips langs bunnbue i token-lokal orientering (ned = +Y).
 * Bruker vinkel-topper med minsteavstand — x-gap alene smelter sammen overlapping.
 */
export function countPipsBottomArc(
  inkPixels: { x: number; y: number }[],
  radius: number
): number {
  const pipInner = radius * 0.4;
  const pipOuter = radius * 0.98;

  const bottom = inkPixels.filter((s) => {
    const r = Math.hypot(s.x, s.y);
    // Hold siffer-sonen utenfor (øvre/midtre del i token-lokal)
    return s.y >= radius * 0.12 && r >= pipInner && r <= pipOuter;
  });

  if (bottom.length >= 2) {
    // Bunnbue i lokal orientering: ca. 0..π (nedre halvplan via atan2)
    const peaks = countAngularPeaks(bottom, 0.05 * Math.PI, 0.95 * Math.PI, 5);
    if (peaks >= 1) return peaks;
  }

  const ring = inkPixels.filter((s) => {
    const r = Math.hypot(s.x, s.y);
    return r >= pipInner && r <= pipOuter;
  });
  if (ring.length < 2) return ring.length >= 1 ? 1 : 0;
  return countAngularPeaks(ring, 0, Math.PI * 2, 5);
}

function countAngularPeaks(
  pixels: { x: number; y: number }[],
  angMin: number,
  angMax: number,
  maxPips: number
): number {
  if (pixels.length < 2) return pixels.length >= 1 ? 1 : 0;
  const span = angMax - angMin;
  if (span <= 1e-6) return 0;

  const binCount = 48;
  const bins = new Array(binCount).fill(0) as number[];
  for (const p of pixels) {
    let ang = Math.atan2(p.y, p.x);
    if (ang < 0) ang += Math.PI * 2;
    if (ang < angMin || ang > angMax) continue;
    const t = (ang - angMin) / span;
    const bin = Math.min(binCount - 1, Math.floor(t * binCount));
    bins[bin]! += 1;
  }

  const smooth = bins.map((_, i) => {
    const a = bins[Math.max(0, i - 1)]!;
    const b = bins[i]!;
    const c = bins[Math.min(binCount - 1, i + 1)]!;
    return a * 0.25 + b * 0.5 + c * 0.25;
  });

  const peakThresh = Math.max(0.55, pixels.length / 55);
  const candidates: { i: number; v: number }[] = [];
  for (let i = 1; i < binCount - 1; i++) {
    const v = smooth[i]!;
    if (v >= peakThresh && v >= smooth[i - 1]! && v >= smooth[i + 1]!) {
      candidates.push({ i, v });
    }
  }
  candidates.sort((a, b) => b.v - a.v);

  const minBinSep = Math.max(2, Math.floor(binCount / (maxPips + 3)));
  const kept: number[] = [];
  for (const c of candidates) {
    if (kept.every((k) => Math.abs(k - c.i) >= minBinSep)) {
      kept.push(c.i);
    }
    if (kept.length >= maxPips) break;
  }
  return clamp(kept.length, 0, 5);
}

/** Soft-score for hvert lovlige tall gitt pip/farge/bredde. */
export function scoreNumberHypotheses(
  features: NumberTokenFeatures
): Partial<Record<PhotoBoardNumber, number>> {
  const scores: Partial<Record<PhotoBoardNumber, number>> = {};
  if (features.pipCount <= 0 && features.inkRatio < 0.04) return scores;

  const preferFive = preferFiveOverNine(features.topHeavyRatio);

  // Rødt blekk ≈ alltid 6 eller 8 (begge har 5 pips). Pip-telling er da sekundær.
  if (features.isRed) {
    const pipBoost = features.pipCount >= 4 ? 0.15 : features.pipCount >= 2 ? 0.05 : 0;
    scores[6] = 0.88 + pipBoost;
    scores[8] = 0.86 + pipBoost;
    for (const n of PHOTO_BOARD_NUMBERS) {
      if (n !== 6 && n !== 8) scores[n] = -0.2;
    }
    return scores;
  }

  for (const n of PHOTO_BOARD_NUMBERS) {
    if (n === 6 || n === 8) {
      scores[n] = -0.15; // ikke rød → sjelden 6/8
      continue;
    }
    const pipExp = expectedPipCount(n);
    const pipErr = Math.abs(features.pipCount - pipExp);
    let score = 0.55 - pipErr * 0.28;

    const expectWide = n >= 10;
    if (features.wideDigit === expectWide) score += 0.28;
    else score -= 0.25;

    if (n === 5) score += preferFive ? 0.22 : 0.06;
    if (n === 9) score += preferFive ? -0.06 : 0.22;

    if (n === 5 || n === 9 || n === 4 || n === 10) score += 0.03;
    score += Math.min(0.1, features.discScore * 0.12);
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
 * Analyser tallskiven i sentrum: lokaliser krem-skive, tell bunnbue-pips
 * (rotasjonsnormalisert), skill rød 6/8 og bredde for 10–12.
 */
export function guessNumberFromCenterPatch(
  imageData: RgbaImageBuffer,
  cx: number,
  cy: number,
  hexSize: number,
  resource: ResourceType | null
): {
  number: number | null;
  confidence: number;
  scores?: Partial<Record<PhotoBoardNumber, number>>;
  hasDisc?: boolean;
} {
  if (resource === 'desert') {
    return { number: null, confidence: 0.92, scores: {}, hasDisc: false };
  }

  const disc = locateCreamDisc(imageData, cx, cy, hexSize);
  if (!disc) {
    // Fallback: anta skive i hex-senter
    const fallback: CreamDisc = {
      x: cx,
      y: cy,
      radius: hexSize * 0.2,
      score: 0.2,
    };
    const features = extractNumberTokenFeatures(imageData, fallback);
    if (!features || features.pipCount <= 0) {
      return { number: null, confidence: 0.12, scores: {}, hasDisc: false };
    }
    const best = bestNumberFromFeatures(features);
    return {
      ...best,
      scores: scoreNumberHypotheses(features),
      hasDisc: false,
    };
  }

  const features = extractNumberTokenFeatures(imageData, disc);
  if (!features) return { number: null, confidence: 0.1, scores: {}, hasDisc: true };
  if (features.pipCount <= 0 && features.inkRatio < 0.03) {
    return { number: null, confidence: 0.2, scores: {}, hasDisc: true };
  }

  const scores = scoreNumberHypotheses(features);
  const best = bestNumberFromFeatures(features);
  return { ...best, scores, hasDisc: true };
}

/**
 * Reconcile malm/ørken med tallskive: kremskive ⇒ ikke ørken;
 * ingen skive + varm beige ⇒ ørken.
 */
export function reconcileOreDesertWithDisc(
  guess: ResourceGuess | null,
  hasCreamDisc: boolean
): ResourceGuess | null {
  if (!guess) return guess;
  if (guess.resource !== 'ore' && guess.resource !== 'desert') return guess;

  const hsv = rgbToHsv(guess.rgb.r, guess.rgb.g, guess.rgb.b);
  const warmBeige =
    hsv.h >= 22 && hsv.h <= 58 && hsv.s >= 0.1 && hsv.s <= 0.5 && hsv.v >= 0.45;

  if (hasCreamDisc) {
    if (guess.resource === 'desert') {
      return {
        resource: 'ore',
        confidence: Math.max(guess.confidence, 0.55),
        rgb: guess.rgb,
      };
    }
    return {
      ...guess,
      confidence: Math.max(guess.confidence, 0.55),
    };
  }

  // Ingen tallskive: ørken er mer sannsynlig ved varm beige
  if (warmBeige && hsv.v >= 0.52) {
    return {
      resource: 'desert',
      confidence: Math.max(guess.confidence, 0.6),
      rgb: guess.rgb,
    };
  }
  if (guess.resource === 'desert' && (!warmBeige || hsv.v < 0.48)) {
    return {
      resource: 'ore',
      confidence: Math.max(guess.confidence * 0.9, 0.45),
      rgb: guess.rgb,
    };
  }
  return guess;
}

/**
 * Tilordne tall globalt mot kjent Catan-pool (2×6, 2×8, …).
 * Retter lokale pip-feil når ressursene allerede er greie.
 */
export function assignNumbersWithPool(
  hexScores: {
    scores: Partial<Record<PhotoBoardNumber, number>>;
    localNumber: number | null;
    localConfidence: number;
  }[],
  pool: number[]
): { number: PhotoBoardNumber | null; confidence: number }[] {
  const n = hexScores.length;
  const result: { number: PhotoBoardNumber | null; confidence: number }[] = hexScores.map(
    (h) => ({
      number:
        h.localNumber !== null && isPhotoBoardNumber(h.localNumber)
          ? h.localNumber
          : null,
      confidence: h.localConfidence,
    })
  );

  const available = [...pool];
  const usedHex = new Set<number>();

  type Cand = { hi: number; num: PhotoBoardNumber; score: number };
  const cands: Cand[] = [];
  for (let hi = 0; hi < n; hi++) {
    for (const num of PHOTO_BOARD_NUMBERS) {
      const score = hexScores[hi]!.scores[num];
      if (score == null || score < 0.18) continue;
      cands.push({ hi, num, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);

  // Nullstill og bygg på nytt fra scores + pool
  for (let i = 0; i < n; i++) {
    result[i] = { number: null, confidence: hexScores[i]!.localConfidence * 0.5 };
  }

  for (const c of cands) {
    if (usedHex.has(c.hi)) continue;
    const idx = available.indexOf(c.num);
    if (idx < 0) continue;
    available.splice(idx, 1);
    usedHex.add(c.hi);
    result[c.hi] = {
      number: c.num,
      confidence: clamp(0.4 + c.score * 0.4, 0.4, 0.96),
    };
  }

  // Fyll resten med beste gjenværende pool-tall
  for (let hi = 0; hi < n; hi++) {
    if (result[hi]!.number != null) continue;
    let bestNum: PhotoBoardNumber | null = null;
    let bestScore = -Infinity;
    const uniq = [...new Set(available)] as PhotoBoardNumber[];
    for (const num of uniq) {
      const s = hexScores[hi]!.scores[num] ?? -1;
      if (s > bestScore) {
        bestScore = s;
        bestNum = num;
      }
    }
    if (bestNum != null && bestScore > 0.05) {
      const idx = available.indexOf(bestNum);
      if (idx >= 0) {
        available.splice(idx, 1);
        result[hi] = {
          number: bestNum,
          confidence: clamp(0.32 + bestScore * 0.35, 0.3, 0.85),
        };
      }
    }
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

/** 5 vs 9: 9 har mer blekk øverst (løkke). Ambivalent → 5. */
export function preferFiveOverNine(topHeavyRatio: number): boolean {
  return topHeavyRatio < 1.28;
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
  const pending: {
    coord: HexCoord;
    resource: ResourceGuess | null;
    localNumber: number | null;
    localConfidence: number;
    scores: Partial<Record<PhotoBoardNumber, number>>;
  }[] = [];

  for (const coord of landCoords) {
    const display = axialToImagePixel(coord, transform);
    const { x, y } = displayToImagePixel(
      display.x,
      display.y,
      imageData.width,
      imageData.height,
      imageAdjust
    );
    const terrain = sampleTerrainColor(imageData, x, y, sampleHexSize);

    let resourceGuess: ResourceGuess | null = terrain
      ? classifyResourceFromRgb(terrain)
      : null;

    // Finn tallskive før ørken-avgjørelse — skive betyr aldri ørken
    const disc = locateCreamDisc(imageData, x, y, sampleHexSize);
    const hasDisc = !!disc && disc.score >= 0.25;
    resourceGuess = reconcileOreDesertWithDisc(resourceGuess, hasDisc);

    const numberGuess =
      resourceGuess?.resource === 'desert'
        ? { number: null, confidence: 0.92, scores: {} as Partial<Record<PhotoBoardNumber, number>> }
        : guessNumberFromCenterPatch(
            imageData,
            x,
            y,
            sampleHexSize,
            resourceGuess?.resource ?? null
          );

    pending.push({
      coord,
      resource: resourceGuess,
      localNumber: numberGuess.number,
      localConfidence: numberGuess.confidence,
      scores: numberGuess.scores ?? {},
    });
  }

  // Global talltilordning for ikke-ørken
  const numberedIdx: number[] = [];
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i]!;
    if (p.resource?.resource === 'desert') continue;
    numberedIdx.push(i);
  }

  const pool = numberPoolForBoardSize(boardSize);
  const assignment = assignNumbersWithPool(
    numberedIdx.map((i) => ({
      scores: pending[i]!.scores,
      localNumber: pending[i]!.localNumber,
      localConfidence: pending[i]!.localConfidence,
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
        numberConfidence: Math.max(p.localConfidence, 0.85),
      };
    }
    const slot = numberedIdx.indexOf(i);
    const assigned = slot >= 0 ? assignment[slot] : null;
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
