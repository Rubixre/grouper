import type { BoardSize, HexCoord, ResourceType } from './types';
import { getLandHexCoords } from './boardLayout';
import { hexToPixel } from './hex';
import {
  createEmptyLandDraft,
  isPhotoBoardNumber,
  landDraftKey,
  type LandHexDraft,
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
  /** Tallgjetning — ofte null i v1 (krever bedre OCR/pip-telling) */
  number: number | null;
  numberConfidence: number;
}

export interface BoardRecognitionResult {
  hexes: HexRecognitionResult[];
  recognizedResources: number;
  recognizedNumbers: number;
}

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

/** Typiske Catan-brikkefarger (sRGB-prototyper). */
const RESOURCE_PROTOTYPES: Record<ResourceType, Rgb[]> = {
  wood: [
    { r: 34, g: 90, b: 45 },
    { r: 46, g: 110, b: 55 },
    { r: 28, g: 70, b: 38 },
  ],
  brick: [
    { r: 170, g: 70, b: 40 },
    { r: 190, g: 85, b: 50 },
    { r: 140, g: 55, b: 35 },
  ],
  sheep: [
    { r: 120, g: 170, b: 70 },
    { r: 140, g: 185, b: 85 },
    { r: 100, g: 155, b: 60 },
  ],
  wheat: [
    { r: 210, g: 180, b: 60 },
    { r: 225, g: 195, b: 70 },
    { r: 190, g: 160, b: 45 },
  ],
  ore: [
    { r: 90, g: 95, b: 105 },
    { r: 70, g: 75, b: 85 },
    { r: 110, g: 115, b: 125 },
  ],
  desert: [
    { r: 195, g: 175, b: 120 },
    { r: 210, g: 190, b: 140 },
    { r: 180, g: 160, b: 110 },
  ],
};

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

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  // Litt ekstra vekt på grønn (terrengskille)
  return Math.sqrt(dr * dr + dg * dg * 1.2 + db * db);
}

/**
 * Klassifiser gjennomsnittsfarge til nærmeste ressursprototype.
 * Bruker RGB-avstand + HSV-regler for å skille nærliggende farger.
 */
export function classifyResourceFromRgb(rgb: Rgb): ResourceGuess {
  let best: ResourceType = 'desert';
  let bestDist = Infinity;
  for (const [resource, prototypes] of Object.entries(RESOURCE_PROTOTYPES) as [
    ResourceType,
    Rgb[],
  ][]) {
    for (const proto of prototypes) {
      const d = colorDistance(rgb, proto);
      if (d < bestDist) {
        bestDist = d;
        best = resource;
      }
    }
  }

  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  // Heuristikker for typiske feilklassifiseringer (etter prototype-match)
  if (hsv.s < 0.18 && hsv.v > 0.45 && hsv.v < 0.85) {
    // Grå uten metning → malm eller ørken
    best = hsv.v > 0.62 ? 'desert' : 'ore';
    bestDist = Math.min(bestDist, 40);
  } else if (
    hsv.h >= 30 &&
    hsv.h <= 55 &&
    hsv.s >= 0.18 &&
    hsv.s <= 0.45 &&
    hsv.v > 0.55
  ) {
    // Beige/sand med lav–middels metning → ørken (før korn-regelen)
    best = 'desert';
    bestDist = Math.min(bestDist, 35);
  } else if (hsv.h >= 40 && hsv.h <= 58 && hsv.s > 0.45 && hsv.v > 0.5) {
    best = 'wheat';
  } else if (hsv.h >= 8 && hsv.h <= 28 && hsv.s > 0.4 && hsv.v > 0.3) {
    best = 'brick';
  } else if (hsv.h >= 70 && hsv.h <= 150 && hsv.s > 0.25) {
    // Mørk grønn = tømmer, lysende = ull
    best =
      hsv.v < 0.42 || (hsv.h < 130 && hsv.s > 0.4 && hsv.v < 0.55)
        ? 'wood'
        : 'sheep';
  } else if (hsv.h >= 55 && hsv.h <= 95 && hsv.s > 0.3 && hsv.v > 0.4) {
    best = 'sheep';
  }

  // Konfidens: 1 ved dist 0, faller mot 0 ved dist ~120
  const confidence = Math.max(0.15, Math.min(0.98, 1 - bestDist / 120));
  return { resource: best, confidence, rgb };
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
  const boardW = maxX - minX + 2; // +2 unit radii approx
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Minimalt bildebuffer-interface (browser ImageData eller test-shim). */
export interface RgbaImageBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function sampleRingAverage(
  imageData: RgbaImageBuffer,
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  sampleCount = 48
): Rgb | null {
  const { width, height, data } = imageData;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (let i = 0; i < sampleCount; i++) {
    const ang = (i / sampleCount) * Math.PI * 2;
    const rad = innerRadius + ((i % 3) / 2) * (outerRadius - innerRadius);
    const x = Math.round(cx + Math.cos(ang) * rad);
    const y = Math.round(cy + Math.sin(ang) * rad);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = (y * width + x) * 4;
    r += data[idx]!;
    g += data[idx + 1]!;
    b += data[idx + 2]!;
    n += 1;
  }

  if (n < 8) return null;
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * Gjett tall fra senterpatch. V1: bare ørken → null; ellers ingen gjetning
 * (pip-telling/OCR kommer senere). Returnerer alltid null for ikke-ørken.
 */
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
  let recognizedResources = 0;
  let recognizedNumbers = 0;

  for (const coord of landCoords) {
    const { x, y } = axialToImagePixel(coord, transform);
    const ring = sampleRingAverage(
      imageData,
      x,
      y,
      transform.hexSize * 0.32,
      transform.hexSize * 0.52
    );
    const center = sampleRingAverage(
      imageData,
      x,
      y,
      transform.hexSize * 0.02,
      transform.hexSize * 0.16,
      24
    );

    let resourceGuess: ResourceGuess | null = null;
    if (ring) {
      resourceGuess = classifyResourceFromRgb(ring);
      if (resourceGuess.confidence >= 0.28) recognizedResources += 1;
      else resourceGuess = null;
    }

    const numberGuess = guessNumberFromCenter(
      resourceGuess?.resource ?? null,
      center
    );
    if (
      numberGuess.number !== null &&
      isPhotoBoardNumber(numberGuess.number) &&
      numberGuess.confidence >= 0.5
    ) {
      recognizedNumbers += 1;
    } else if (resourceGuess?.resource === 'desert') {
      recognizedNumbers += 1; // ørken «har» tall = ingen
    }

    hexes.push({
      coord,
      resource: resourceGuess,
      number:
        resourceGuess?.resource === 'desert'
          ? null
          : numberGuess.number !== null && isPhotoBoardNumber(numberGuess.number)
            ? numberGuess.number
            : null,
      numberConfidence: numberGuess.confidence,
    });
  }

  return { hexes, recognizedResources, recognizedNumbers };
}

/** Slå gjenkjenningsresultat inn i et land-utkast (beholder manuelle tall om ønskelig). */
export function applyRecognitionToDraft(
  draft: LandHexDraft[],
  recognition: BoardRecognitionResult,
  options: { overwriteResources?: boolean; overwriteNumbers?: boolean } = {}
): LandHexDraft[] {
  const { overwriteResources = true, overwriteNumbers = false } = options;
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
      else if (hit.number !== null) next.number = hit.number;
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

/** Last bilde-URL til ImageData (browser). */
export async function loadImageDataFromUrl(
  url: string
): Promise<{ imageData: ImageData; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Kunne ikke laste bilde'));
    el.src = url;
  });

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D-context utilgjengelig');
  ctx.drawImage(img, 0, 0);
  return { imageData: ctx.getImageData(0, 0, width, height), width, height };
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
