import type {
  Board,
  BoardSize,
  GeneratorSettings,
  HexCoord,
  HexTile,
  ResourceType,
} from './types';
import { DEFAULT_SETTINGS } from './types';
import {
  buildCoastSlots,
  clearBoardCaches,
  getBoardHexCoords,
  getLandHexCoords,
  isEdgeHex,
  setBoardSize,
} from './boardLayout';
import {
  BASE_IDENTITY_ORDER,
  randomBaseEdgeOrder,
} from './edgePieces';
import {
  EXTENSION_IDENTITY_ORDER,
  randomExtensionEdgeOrder,
} from './extensionLayout';
import { placeHarbors } from './harbors';
import { resetBoardMapping } from './mapping';
import { resetVertices } from './settlements';
import { coordKey } from './hex';

/** Gyldige tallskiver (uten 7). */
export const PHOTO_BOARD_NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as const;

export type PhotoBoardNumber = (typeof PHOTO_BOARD_NUMBERS)[number];

export interface LandHexDraft {
  coord: HexCoord;
  resource: ResourceType | null;
  number: number | null;
}

export interface PhotoDraftValidation {
  errors: string[];
  warnings: string[];
  filledCount: number;
  totalCount: number;
  complete: boolean;
}

const STANDARD_BASE_RESOURCE_COUNTS: Record<ResourceType, number> = {
  wood: 4,
  brick: 3,
  sheep: 4,
  wheat: 4,
  ore: 3,
  desert: 1,
};

const ALL_RESOURCES: ResourceType[] = [
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
  'desert',
];

export function createEmptyLandDraft(boardSize: BoardSize = 'base'): LandHexDraft[] {
  return getLandHexCoords(boardSize).map((coord) => ({
    coord,
    resource: null,
    number: null,
  }));
}

export function isPhotoBoardNumber(value: number): value is PhotoBoardNumber {
  return (PHOTO_BOARD_NUMBERS as readonly number[]).includes(value);
}

export function landDraftKey(draft: Pick<LandHexDraft, 'coord'>): string {
  return coordKey(draft.coord);
}

export function isLandHexComplete(draft: LandHexDraft): boolean {
  if (!draft.resource) return false;
  if (draft.resource === 'desert') return draft.number === null;
  return draft.number !== null && isPhotoBoardNumber(draft.number);
}

export function validateLandDraft(
  drafts: LandHexDraft[],
  boardSize: BoardSize = 'base'
): PhotoDraftValidation {
  const expected = getLandHexCoords(boardSize);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (drafts.length !== expected.length) {
    errors.push(
      `Forventet ${expected.length} landhex, fant ${drafts.length}.`
    );
  }

  const expectedKeys = new Set(expected.map(coordKey));
  const seen = new Set<string>();
  for (const draft of drafts) {
    const key = coordKey(draft.coord);
    if (!expectedKeys.has(key)) {
      errors.push(`Ukjent landhex ${key}.`);
    }
    if (seen.has(key)) {
      errors.push(`Duplikat landhex ${key}.`);
    }
    seen.add(key);
  }

  let filledCount = 0;
  for (const draft of drafts) {
    if (!draft.resource) continue;

    if (draft.resource === 'desert') {
      if (draft.number !== null) {
        errors.push(`Ørken på ${coordKey(draft.coord)} skal ikke ha tall.`);
        continue;
      }
      filledCount += 1;
      continue;
    }

    if (draft.number === null) {
      continue;
    }
    if (!isPhotoBoardNumber(draft.number)) {
      errors.push(
        `Ugyldig tall ${draft.number} på ${coordKey(draft.coord)} (bruk 2–12 uten 7).`
      );
      continue;
    }
    filledCount += 1;
  }

  const totalCount = expected.length;
  const complete =
    filledCount === totalCount &&
    drafts.every(isLandHexComplete) &&
    errors.length === 0;

  if (!complete && filledCount < totalCount) {
    // Soft progress hint only when applying
  }

  if (boardSize === 'base' && drafts.every((d) => d.resource)) {
    const counts = Object.fromEntries(
      ALL_RESOURCES.map((r) => [r, 0])
    ) as Record<ResourceType, number>;
    for (const draft of drafts) {
      if (draft.resource) counts[draft.resource] += 1;
    }
    for (const resource of ALL_RESOURCES) {
      const expectedCount = STANDARD_BASE_RESOURCE_COUNTS[resource];
      if (counts[resource] !== expectedCount) {
        warnings.push(
          `${resource}: ${counts[resource]} (standard er ${expectedCount})`
        );
      }
    }
  }

  return { errors, warnings, filledCount, totalCount, complete };
}

/**
 * Bygg et spillbart Board fra ferdig utfylt land-utkast.
 * Havner trekkes som ved vanlig generering (tilfeldig/fast iht. settings).
 */
export function buildBoardFromLandDraft(
  drafts: LandHexDraft[],
  settings: GeneratorSettings = DEFAULT_SETTINGS,
  boardSize: BoardSize = 'base'
): { ok: true; board: Board } | { ok: false; error: string } {
  const validation = validateLandDraft(drafts, boardSize);
  if (!validation.complete) {
    const detail =
      validation.errors[0] ??
      `Fyll inn alle ${validation.totalCount} landhex (ressurs + tall, ørken uten tall).`;
    return { ok: false, error: detail };
  }

  setBoardSize(boardSize);
  clearBoardCaches();
  resetVertices();
  resetBoardMapping();

  const hexCoords = getBoardHexCoords(boardSize);
  const coastSlots = buildCoastSlots(boardSize);

  const landHexes = new Map<string, HexTile>();
  for (const draft of drafts) {
    const key = coordKey(draft.coord);
    landHexes.set(key, {
      coord: draft.coord,
      kind: 'land',
      resource: draft.resource!,
      number: draft.resource === 'desert' ? null : draft.number,
    });
  }

  for (const coord of getLandHexCoords(boardSize)) {
    if (!landHexes.has(coordKey(coord))) {
      return { ok: false, error: `Mangler landhex ${coordKey(coord)}.` };
    }
  }

  const extensionEdgeOrder =
    boardSize === 'extension56'
      ? settings.randomHarbors
        ? randomExtensionEdgeOrder()
        : EXTENSION_IDENTITY_ORDER
      : undefined;
  const edgePieceOrder =
    boardSize === 'base'
      ? settings.randomHarbors
        ? randomBaseEdgeOrder()
        : [...BASE_IDENTITY_ORDER]
      : undefined;

  const edgeRotation = 0;
  const harbors = placeHarbors(
    edgeRotation,
    1,
    boardSize,
    extensionEdgeOrder ?? EXTENSION_IDENTITY_ORDER,
    edgePieceOrder ?? BASE_IDENTITY_ORDER
  );

  const hexes: HexTile[] = hexCoords.map((coord) => {
    if (isEdgeHex(coord, boardSize)) {
      return { coord, kind: 'edge', resource: null, number: null };
    }
    return landHexes.get(coordKey(coord))!;
  });

  return {
    ok: true,
    board: {
      boardSize,
      hexes,
      harbors,
      coastSlots,
      edgeRotation,
      edgePieceOrder,
      extensionEdgeOrder,
    },
  };
}
