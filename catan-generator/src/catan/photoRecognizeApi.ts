import type { BoardSize, HexCoord, ResourceType } from './types';
import { getLandHexCoords } from './boardLayout';
import {
  isPhotoBoardNumber,
  type PhotoBoardNumber,
} from './boardFromPhoto';
import {
  axialToImagePixel,
  displayToImagePixel,
  loadImageDataFromUrl,
  scaleImageAdjustForRecognition,
  scaleTransformForRecognition,
  type BoardRecognitionResult,
  type HexRecognitionResult,
  type ImageAdjust,
  type ImageOverlayTransform,
  type ResourceGuess,
} from './photoRecognize';

const RESOURCE_SET = new Set<ResourceType>([
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
  'desert',
]);

export type VisionApiConfig = {
  /** OpenAI-kompatibel API-nøkkel */
  apiKey: string;
  /** Default: https://api.openai.com/v1 */
  baseUrl?: string;
  /** Default: gpt-4o-mini */
  model?: string;
};

const SESSION_KEY = 'catan.visionApiKey';
const SESSION_BASE = 'catan.visionApiBase';
const SESSION_MODEL = 'catan.visionApiModel';

export function loadVisionApiConfigFromSession(): Partial<VisionApiConfig> {
  try {
    return {
      apiKey: sessionStorage.getItem(SESSION_KEY) ?? undefined,
      baseUrl: sessionStorage.getItem(SESSION_BASE) ?? undefined,
      model: sessionStorage.getItem(SESSION_MODEL) ?? undefined,
    };
  } catch {
    return {};
  }
}

export function saveVisionApiConfigToSession(config: Partial<VisionApiConfig>): void {
  try {
    if (config.apiKey != null) sessionStorage.setItem(SESSION_KEY, config.apiKey);
    if (config.baseUrl != null) sessionStorage.setItem(SESSION_BASE, config.baseUrl);
    if (config.model != null) sessionStorage.setItem(SESSION_MODEL, config.model);
  } catch {
    /* ignore */
  }
}

export function clearVisionApiConfigSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_BASE);
    sessionStorage.removeItem(SESSION_MODEL);
  } catch {
    /* ignore */
  }
}

/** Env-fallback for lokal prototype (`VITE_OPENAI_API_KEY`). */
export function visionApiConfigFromEnv(): Partial<VisionApiConfig> {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    apiKey: env.VITE_OPENAI_API_KEY,
    baseUrl: env.VITE_OPENAI_BASE_URL,
    model: env.VITE_OPENAI_VISION_MODEL,
  };
}

function resolveConfig(config: VisionApiConfig): Required<VisionApiConfig> {
  const fromEnv = visionApiConfigFromEnv();
  return {
    apiKey: config.apiKey || fromEnv.apiKey || '',
    baseUrl: (config.baseUrl || fromEnv.baseUrl || 'https://api.openai.com/v1').replace(
      /\/$/,
      ''
    ),
    model: config.model || fromEnv.model || 'gpt-4o-mini',
  };
}

type CropCell = {
  index: number;
  coord: HexCoord;
  canvas: HTMLCanvasElement;
};

/**
 * Crop hvert land-hex rundt sentrum (etter bildejustering).
 * Returnerer celler klare for collage.
 */
export async function cropLandHexes(
  imageUrl: string,
  transform: ImageOverlayTransform,
  imageAdjust: ImageAdjust,
  boardSize: BoardSize
): Promise<{ cells: CropCell[]; naturalW: number; naturalH: number; scale: number }> {
  const { imageData, width, height, scale } = await loadImageDataFromUrl(imageUrl);
  const t = scaleTransformForRecognition(transform, scale);
  const adj = scaleImageAdjustForRecognition(imageAdjust, scale);
  const landCoords = getLandHexCoords(boardSize);
  const cropSize = Math.max(48, Math.round(t.hexSize * 1.55));

  const cells: CropCell[] = landCoords.map((coord, index) => {
    const display = axialToImagePixel(coord, t);
    const { x: cx, y: cy } = displayToImagePixel(
      display.x,
      display.y,
      width,
      height,
      adj
    );
    const canvas = document.createElement('canvas');
    canvas.width = cropSize;
    canvas.height = cropSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D-context utilgjengelig');

    // Tegn fra ImageData via midlertidig canvas
    const src = document.createElement('canvas');
    src.width = width;
    src.height = height;
    const sctx = src.getContext('2d');
    if (!sctx) throw new Error('2D-context utilgjengelig');
    sctx.putImageData(imageData, 0, 0);

    const half = cropSize / 2;
    ctx.fillStyle = '#1a3a4a';
    ctx.fillRect(0, 0, cropSize, cropSize);
    ctx.drawImage(
      src,
      cx - half,
      cy - half,
      cropSize,
      cropSize,
      0,
      0,
      cropSize,
      cropSize
    );
    return { index, coord, canvas };
  });

  return { cells, naturalW: width, naturalH: height, scale };
}

/** Bygg merket collage (én bilde til Vision-API). */
export function buildLabeledCollage(
  cells: CropCell[],
  cols = 5
): { dataUrl: string; mimeType: 'image/jpeg' } {
  if (cells.length === 0) throw new Error('Ingen hex å croppe');
  const cellW = cells[0]!.canvas.width;
  const cellH = cells[0]!.canvas.height;
  const labelH = 22;
  const gap = 4;
  const rows = Math.ceil(cells.length / cols);
  const out = document.createElement('canvas');
  out.width = cols * (cellW + gap) + gap;
  out.height = rows * (cellH + labelH + gap) + gap;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D-context utilgjengelig');
  ctx.fillStyle = '#0f1720';
  ctx.fillRect(0, 0, out.width, out.height);

  cells.forEach((cell, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gap + col * (cellW + gap);
    const y = gap + row * (cellH + labelH + gap);
    ctx.drawImage(cell.canvas, x, y);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x, y + cellH, cellW, labelH);
    ctx.fillStyle = '#0f1720';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `#${cell.index} (${cell.coord.q},${cell.coord.r})`,
      x + cellW / 2,
      y + cellH + labelH / 2
    );
  });

  return {
    dataUrl: out.toDataURL('image/jpeg', 0.85),
    mimeType: 'image/jpeg',
  };
}

function buildPrompt(boardSize: BoardSize, cellCount: number): string {
  const deserts = boardSize === 'base' ? 1 : 2;
  const numbered = cellCount - deserts;
  return [
    'You are reading Settlers of Catan terrain hex photos.',
    'The image is a labeled collage of land hex crops from one board photo.',
    'Each tile shows terrain with a number chit ON TOP of the resource (except desert).',
    'Desert NEVER has a number chit.',
    'Numbers 6 and 8 are typically printed in red.',
    'Some numbers (especially 6 and 9) have a small period/dot marking orientation.',
    'There is NO pip arc on these tokens — read the digit itself.',
    `Board size: ${boardSize}. Expect about ${deserts} desert(s) and ${numbered} numbered hexes.`,
    'Valid resources: wood, brick, sheep, wheat, ore, desert.',
    'Valid numbers: 2,3,4,5,6,8,9,10,11,12 (null for desert).',
    'Return ONLY compact JSON (no markdown):',
    '{"hexes":[{"index":0,"resource":"wood","number":6},{"index":1,"resource":"desert","number":null}]}',
    `Include every index from 0 to ${cellCount - 1} exactly once.`,
    'If unsure, still guess the most likely resource/number.',
  ].join(' ');
}

type ApiHex = { index: number; resource: string; number: number | null };

function parseApiJson(text: string): ApiHex[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]!.trim() : trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('API returnerte ikke JSON-objekt');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { hexes?: ApiHex[] };
  if (!Array.isArray(parsed.hexes)) throw new Error('JSON mangler hexes[]');
  return parsed.hexes;
}

function toResourceGuess(resource: string, rgb = { r: 128, g: 128, b: 128 }): ResourceGuess | null {
  if (!RESOURCE_SET.has(resource as ResourceType)) return null;
  return {
    resource: resource as ResourceType,
    confidence: 0.8,
    rgb,
  };
}

export function apiHexesToRecognitionResult(
  apiHexes: ApiHex[],
  landCoords: HexCoord[]
): BoardRecognitionResult {
  const byIndex = new Map(apiHexes.map((h) => [h.index, h]));
  const hexes: HexRecognitionResult[] = landCoords.map((coord, index) => {
    const hit = byIndex.get(index);
    const resource = hit ? toResourceGuess(hit.resource) : null;
    let number: number | null = null;
    let numberConfidence = 0.2;
    if (resource?.resource === 'desert') {
      number = null;
      numberConfidence = 0.95;
    } else if (
      hit &&
      hit.number != null &&
      isPhotoBoardNumber(hit.number)
    ) {
      number = hit.number as PhotoBoardNumber;
      numberConfidence = 0.8;
    }
    return { coord, resource, number, numberConfidence };
  });

  return {
    hexes,
    recognizedResources: hexes.filter((h) => h.resource).length,
    recognizedNumbers: hexes.filter(
      (h) => h.resource?.resource === 'desert' || h.number !== null
    ).length,
  };
}

/**
 * Rask Vision-API-prototype: collage av hex-crops → OpenAI-kompatibel chat/completions.
 */
export async function recognizeBoardWithVisionApi(
  imageUrl: string,
  transform: ImageOverlayTransform,
  imageAdjust: ImageAdjust,
  boardSize: BoardSize,
  config: VisionApiConfig
): Promise<BoardRecognitionResult> {
  const resolved = resolveConfig(config);
  if (!resolved.apiKey) {
    throw new Error(
      'Mangler API-nøkkel. Sett den i feltet under, eller VITE_OPENAI_API_KEY i .env'
    );
  }

  const { cells } = await cropLandHexes(imageUrl, transform, imageAdjust, boardSize);
  const { dataUrl, mimeType } = buildLabeledCollage(cells);
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const prompt = buildPrompt(boardSize, cells.length);

  const url = `${resolved.baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolved.apiKey}`,
    },
    body: JSON.stringify({
      model: resolved.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Vision-API feilet (${response.status}): ${errText.slice(0, 240) || response.statusText}`
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('Tomt svar fra Vision-API');

  const apiHexes = parseApiJson(content);
  return apiHexesToRecognitionResult(
    apiHexes,
    cells.map((c) => c.coord)
  );
}
