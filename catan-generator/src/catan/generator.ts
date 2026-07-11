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
  getLandHexCount,
  getLandHexCoords,
  getLandSet,
  isEdgeHex,
  setBoardSize,
} from './boardLayout';
import { randomEdgeRotation } from './edgePieces';
import {
  EXTENSION_IDENTITY_ORDER,
  randomExtensionEdgeOrder,
} from './extensionLayout';
import { placeHarbors } from './harbors';
import { resetBoardMapping } from './mapping';
import { resetVertices } from './settlements';
import { coordKey, getNeighbors } from './hex';

/** 19 landhexer – standard grunnspill */
const RESOURCES_BASE: ResourceType[] = [
  'wood',
  'wood',
  'wood',
  'wood',
  'brick',
  'brick',
  'brick',
  'sheep',
  'sheep',
  'sheep',
  'sheep',
  'wheat',
  'wheat',
  'wheat',
  'wheat',
  'ore',
  'ore',
  'ore',
  'desert',
];

/** +2 av hver ressurs + 1 ørken for 5–6 spillere */
const RESOURCES_EXTENSION: ResourceType[] = [
  'wood',
  'wood',
  'brick',
  'brick',
  'sheep',
  'sheep',
  'wheat',
  'wheat',
  'ore',
  'ore',
  'desert',
];

const NUMBERS_BASE = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

/** 10 ekstra tallbrikker – utvidelse har 2×2/12 og 3×(3–6, 8–11) totalt */
const NUMBERS_EXTENSION = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

/** Full tallbrikk-pool for 5–6 spillere (28 nummererte landhexer) */
export const NUMBERS_EXTENSION_56 = [...NUMBERS_BASE, ...NUMBERS_EXTENSION];

function resourcesForSize(size: BoardSize): ResourceType[] {
  return size === 'base'
    ? RESOURCES_BASE
    : [...RESOURCES_BASE, ...RESOURCES_EXTENSION];
}

function numbersForSize(size: BoardSize): number[] {
  return size === 'base' ? NUMBERS_BASE : NUMBERS_EXTENSION_56;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getLandNeighbors(coord: HexCoord, landSet: Set<string>): HexCoord[] {
  return getNeighbors(coord).filter((n) => landSet.has(coordKey(n)));
}

function violatesNumberAdjacency(
  hexes: Map<string, HexTile>,
  coord: HexCoord,
  number: number,
  settings: GeneratorSettings,
  landSet: Set<string>
): boolean {
  const neighbors = getLandNeighbors(coord, landSet);
  for (const n of neighbors) {
    const tile = hexes.get(coordKey(n));
    if (!tile?.number) continue;
    const nn = tile.number;

    if (!settings.allowAdjacent6And8) {
      if ((number === 6 && nn === 8) || (number === 8 && nn === 6)) return true;
    }
    if (!settings.allowAdjacent2And12) {
      if ((number === 2 && nn === 12) || (number === 12 && nn === 2)) return true;
    }
    if (!settings.allowAdjacentSameNumber && number === nn) return true;
  }
  return false;
}

function violatesResourceAdjacency(
  hexes: Map<string, HexTile>,
  coord: HexCoord,
  resource: ResourceType,
  settings: GeneratorSettings,
  landSet: Set<string>
): boolean {
  if (settings.allowAdjacentSameResource || resource === 'desert') return false;
  const neighbors = getLandNeighbors(coord, landSet);
  for (const n of neighbors) {
    const tile = hexes.get(coordKey(n));
    if (tile?.resource === resource) return true;
  }
  return false;
}

function tryPlaceResources(
  landCoords: HexCoord[],
  resources: ResourceType[],
  settings: GeneratorSettings,
  landSet: Set<string>,
  maxAttempts = 5000
): Map<string, HexTile> | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(resources);
    const hexes = new Map<string, HexTile>();
    let valid = true;

    for (let i = 0; i < landCoords.length; i++) {
      const coord = landCoords[i];
      const resource = shuffled[i];
      if (violatesResourceAdjacency(hexes, coord, resource, settings, landSet)) {
        valid = false;
        break;
      }
      hexes.set(coordKey(coord), {
        coord,
        kind: 'land',
        resource,
        number: null,
      });
    }

    if (valid) return hexes;
  }
  return null;
}

function tryPlaceNumbers(
  hexes: Map<string, HexTile>,
  numbers: number[],
  settings: GeneratorSettings,
  landSet: Set<string>,
  maxAttempts = 5000
): boolean {
  const nonDesert = [...hexes.values()].filter((h) => h.resource !== 'desert');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(numbers);
    const numberMap = new Map<string, number>();
    let valid = true;

    for (let i = 0; i < nonDesert.length; i++) {
      const tile = nonDesert[i];
      const number = shuffled[i];
      if (violatesNumberAdjacency(hexes, tile.coord, number, settings, landSet)) {
        valid = false;
        break;
      }
      numberMap.set(coordKey(tile.coord), number);
    }

    if (valid) {
      for (const [key, num] of numberMap) {
        const tile = hexes.get(key)!;
        tile.number = num;
      }
      return true;
    }
  }
  return false;
}

export function generateBoard(
  settings: GeneratorSettings = DEFAULT_SETTINGS,
  boardSize: BoardSize = 'base'
): Board | null {
  setBoardSize(boardSize);
  clearBoardCaches();
  resetVertices();
  resetBoardMapping();

  const hexCoords = getBoardHexCoords(boardSize);
  const landCoords = getLandHexCoords(boardSize);
  const landSet = getLandSet(boardSize);
  const coastSlots = buildCoastSlots(boardSize);
  const resources = resourcesForSize(boardSize);
  const numbers = numbersForSize(boardSize);

  if (landCoords.length !== getLandHexCount(boardSize)) {
    throw new Error(
      `Land hex mismatch: expected ${getLandHexCount(boardSize)}, got ${landCoords.length}`
    );
  }

  for (let attempt = 0; attempt < 300; attempt++) {
    const landHexes = tryPlaceResources(landCoords, resources, settings, landSet);
    if (!landHexes) continue;
    if (!tryPlaceNumbers(landHexes, numbers, settings, landSet)) continue;

    const extensionEdgeOrder =
      boardSize === 'extension56'
        ? settings.randomHarbors
          ? randomExtensionEdgeOrder()
          : EXTENSION_IDENTITY_ORDER
        : undefined;
    const edgeRotation =
      boardSize === 'extension56'
        ? 0
        : settings.randomHarbors
          ? randomEdgeRotation(boardSize)
          : 0;
    const harbors = placeHarbors(
      edgeRotation,
      1,
      boardSize,
      extensionEdgeOrder ?? EXTENSION_IDENTITY_ORDER
    );

    const hexes: HexTile[] = hexCoords.map((coord) => {
      if (isEdgeHex(coord, boardSize)) {
        return { coord, kind: 'edge', resource: null, number: null };
      }
      return landHexes.get(coordKey(coord))!;
    });

    return {
      boardSize,
      hexes,
      harbors,
      coastSlots,
      edgeRotation,
      extensionEdgeOrder,
    };
  }

  return null;
}
