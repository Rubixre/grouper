import type { BoardSize, HexCoord, ResourceType } from './types';
import { getLandHexCoords } from './boardLayout';
import { hexToPixel } from './hex';
import {
  createEmptyLandDraft,
  isPhotoBoardNumber,
  landDraftKey,
  type LandHexDraft,
  type PhotoBoardNumber,
} from './boardFromPhoto';

/** Transformasjon som mapper aksiale hex-koordinater → bildepiksler. */
export interface ImageOverlayTransform {
  /** Hex-senter (q=0,r=0) i bildekoordinater */
  centerX: number;
  centerY: number;
  /** Avstand sentrum→hjørne i piksler (pointy-top) */
  hexSize: number;
  /** Rotasjon i grader (positiv = med klokken) */
  rotationDeg: number;
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
  if (s <= 0.22 && v >= 0.22 && v <= 0.72) {
    const warm = h >= 25 && h <= 55;
    if (!warm || s < 0.12) {
      cands.push({
        resource: 'ore',
        score: 0.4 + (0.22 - s) * 0.8 + (v > 0.35 && v < 0.6 ? 0.12 : 0),
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

/**
 * Analyser tallskiven i sentrum: pip-antall + rød sifferfarge + bredde (1 vs 2 siffer).
 *
 * Pip → {1,2,3,4,5}; rød + 5 → 6, sort + 5 → 8;
 * bredt blekk → tosifret (10/11/12), smalt → 2/3/4/5/9.
 */
export function guessNumberFromCenterPatch(
  imageData: RgbaImageBuffer,
  cx: number,
  cy: number,
  hexSize: number,
  resource: ResourceType | null
): { number: number | null; confidence: number } {
  const isDesert = resource === 'desert';
  if (isDesert) return { number: null, confidence: 0.92 };

  const radius = Math.max(6, hexSize * 0.22);
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

  if (samples.length < 20) return { number: null, confidence: 0 };

  const lums = samples.map((s) => s.lum).sort((a, b) => a - b);
  const medianLum = lums[Math.floor(lums.length / 2)]!;
  const p20 = lums[Math.floor(lums.length * 0.2)]!;

  // Tallskive er typisk lysere enn terreng; hvis hele senteret er mørkt/sandete → ofte ørkenfeil
  const brightShare =
    samples.filter((s) => s.lum > medianLum * 0.9 && s.hsv.v > 0.55).length / samples.length;

  // Mørke piksler = siffer + pips
  const darkThresh = Math.min(p20 + 18, medianLum - 25);
  const dark = samples.filter((s) => s.lum < darkThresh && s.hsv.v < 0.55);
  if (dark.length < 6) {
    // Lite blekk — kanskje ørken uten skive, eller undereksponert
    if (brightShare < 0.25) {
      return { number: null, confidence: 0.2 };
    }
    return { number: null, confidence: 0.15 };
  }

  // Rød andel blant mørke (6/8 er røde)
  const redDark = dark.filter((s) => {
    const { h, s: sat } = s.hsv;
    return sat > 0.25 && (h <= 25 || h >= 345);
  });
  const isRedNumber = redDark.length / dark.length > 0.18;

  // Pip-sone: ytre ring av skiven
  const pipInner = radius * 0.55;
  const pipOuter = radius * 0.95;
  const pipPixels = dark.filter((s) => {
    const r = Math.hypot(s.x, s.y);
    return r >= pipInner && r <= pipOuter;
  });

  // Enkel vinkel-clustering for pip-telling
  const pipCount = countPipsByAngle(pipPixels, radius);

  // Sifferbredde i indre sirkel
  const digitPixels = dark.filter((s) => Math.hypot(s.x, s.y) < radius * 0.5);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of digitPixels) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  const digitWidth = digitPixels.length > 4 ? maxX - minX : 0;
  const wideDigit = digitWidth > radius * 0.72; // tosifret

  let upper = 0;
  let lower = 0;
  for (const p of digitPixels) {
    if (p.y < 0) upper += 1;
    else lower += 1;
  }
  const topHeavy = lower === 0 ? 2 : upper / lower;

  let mapped = mapPipsToNumber(pipCount, isRedNumber, wideDigit);
  if (mapped === 5 || (pipCount === 4 && mapped != null)) {
    mapped = preferFiveOverNine(topHeavy) ? 5 : 9;
  }
  if (mapped == null) return { number: null, confidence: 0.2 };

  let confidence = 0.45 + Math.min(pipCount, 5) * 0.06;
  if (pipCount === 5) confidence += 0.15; // 6/8 skilles tydelig av farge
  if (wideDigit || pipCount <= 3) confidence += 0.08;
  confidence = clamp(confidence, 0.35, 0.9);

  return { number: mapped, confidence };
}

function countPipsByAngle(
  pipPixels: { x: number; y: number }[],
  radius: number
): number {
  if (pipPixels.length < 3) return 0;
  const bins = new Array(24).fill(0) as number[];
  for (const p of pipPixels) {
    let ang = Math.atan2(p.y, p.x); // -pi..pi
    if (ang < 0) ang += Math.PI * 2;
    const bin = Math.min(23, Math.floor((ang / (Math.PI * 2)) * 24));
    bins[bin]! += 1;
  }
  const thresh = Math.max(2, pipPixels.length / 30);
  let clusters = 0;
  let inCluster = false;
  for (let i = 0; i < 24; i++) {
    const hot = bins[i]! >= thresh;
    if (hot && !inCluster) {
      clusters += 1;
      inCluster = true;
    } else if (!hot) {
      inCluster = false;
    }
  }
  // Wrap-around: første og siste bin samme cluster
  if (bins[0]! >= thresh && bins[23]! >= thresh && clusters >= 2) {
    clusters -= 1;
  }

  // Fallback: estimer fra pip-piksler / typisk pip-størrelse
  if (clusters === 0) {
    const approx = Math.round(pipPixels.length / Math.max(8, radius * 0.35));
    return clamp(approx, 0, 5);
  }
  return clamp(clusters, 0, 5);
}

export function mapPipsToNumber(
  pipCount: number,
  isRed: boolean,
  wideDigit: boolean
): PhotoBoardNumber | null {
  const p = clamp(Math.round(pipCount), 0, 5);
  if (p <= 0) return null;
  if (p === 5) return isRed ? 6 : 8;
  if (p === 4) return 5; // justeres til 9 av caller ved behov
  if (p === 3) return wideDigit ? 10 : 4;
  if (p === 2) return wideDigit ? 11 : 3;
  if (p === 1) return wideDigit ? 12 : 2;
  return null;
}

/** 5 vs 9: 9 har mer blekk øverst (løkke). */
export function preferFiveOverNine(topHeavyRatio: number): boolean {
  // topHeavyRatio = darkInUpper / darkInLower; 9 typisk > 1.15
  return topHeavyRatio < 1.12;
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
  boardSize: BoardSize = 'base'
): BoardRecognitionResult {
  const landCoords = getLandHexCoords(boardSize);
  const hexes: HexRecognitionResult[] = [];

  for (const coord of landCoords) {
    const { x, y } = axialToImagePixel(coord, transform);
    const terrain = sampleTerrainColor(imageData, x, y, transform.hexSize);

    let resourceGuess: ResourceGuess | null = terrain
      ? classifyResourceFromRgb(terrain)
      : null;

    const numberGuess = guessNumberFromCenterPatch(
      imageData,
      x,
      y,
      transform.hexSize,
      resourceGuess?.resource ?? null
    );

    // Ingen tallskive + usikker malm/ørken → hell heller ørken
    if (
      resourceGuess &&
      (resourceGuess.resource === 'ore' || resourceGuess.resource === 'desert') &&
      numberGuess.number === null &&
      numberGuess.confidence >= 0.8 &&
      resourceGuess.confidence < 0.55
    ) {
      resourceGuess = {
        ...resourceGuess,
        resource: 'desert',
        confidence: Math.max(resourceGuess.confidence, 0.55),
      };
    }

    const number =
      resourceGuess?.resource === 'desert'
        ? null
        : numberGuess.number !== null && isPhotoBoardNumber(numberGuess.number)
          ? numberGuess.number
          : null;

    hexes.push({
      coord,
      resource: resourceGuess,
      number,
      numberConfidence: numberGuess.confidence,
    });
  }

  return {
    hexes,
    recognizedResources: hexes.filter((h) => h.resource).length,
    recognizedNumbers: hexes.filter(
      (h) => h.resource?.resource === 'desert' || h.number !== null
    ).length,
  };
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
