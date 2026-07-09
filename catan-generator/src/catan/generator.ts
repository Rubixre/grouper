import type {
  Board,
  GeneratorSettings,
  HexCoord,
  HexTile,
  ResourceType,
} from './types';
import { DEFAULT_SETTINGS } from './types';
import {
  BOARD_HEX_COORDS,
  buildCoastSlots,
  getLandHexCoords,
  getLandSet,
  isEdgeHex,
} from './boardLayout';
import { placeHarborPieces } from './harbors';
import { coordKey, getNeighbors } from './hex';

/** 19 land tiles (standard base-game distribution) */
const RESOURCES: ResourceType[] = [
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

const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

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

    if (settings.noAdjacent6And8) {
      if ((number === 6 && nn === 8) || (number === 8 && nn === 6)) return true;
    }
    if (settings.noAdjacent2And12) {
      if ((number === 2 && nn === 12) || (number === 12 && nn === 2)) return true;
    }
    if (settings.noAdjacentSameNumber && number === nn) return true;
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
  if (!settings.noAdjacentSameResource || resource === 'desert') return false;
  const neighbors = getLandNeighbors(coord, landSet);
  for (const n of neighbors) {
    const tile = hexes.get(coordKey(n));
    if (tile?.resource === resource) return true;
  }
  return false;
}

function tryPlaceResources(
  landCoords: HexCoord[],
  settings: GeneratorSettings,
  landSet: Set<string>,
  maxAttempts = 5000
): Map<string, HexTile> | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(RESOURCES);
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
  settings: GeneratorSettings,
  landSet: Set<string>,
  maxAttempts = 5000
): boolean {
  const nonDesert = [...hexes.values()].filter((h) => h.resource !== 'desert');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(NUMBERS);
    const numbers = new Map<string, number>();
    let valid = true;

    for (let i = 0; i < nonDesert.length; i++) {
      const tile = nonDesert[i];
      const number = shuffled[i];
      if (violatesNumberAdjacency(hexes, tile.coord, number, settings, landSet)) {
        valid = false;
        break;
      }
      numbers.set(coordKey(tile.coord), number);
    }

    if (valid) {
      for (const [key, num] of numbers) {
        const tile = hexes.get(key)!;
        tile.number = num;
      }
      return true;
    }
  }
  return false;
}

export function generateBoard(
  settings: GeneratorSettings = DEFAULT_SETTINGS
): Board | null {
  const landCoords = getLandHexCoords();
  const landSet = getLandSet();
  const coastSlots = buildCoastSlots();

  for (let attempt = 0; attempt < 200; attempt++) {
    const landHexes = tryPlaceResources(landCoords, settings, landSet);
    if (!landHexes) continue;
    if (!tryPlaceNumbers(landHexes, settings, landSet)) continue;

    const { harbors, rotation } = placeHarborPieces();

    const hexes: HexTile[] = BOARD_HEX_COORDS.map((coord) => {
      if (isEdgeHex(coord)) {
        return { coord, kind: 'edge', resource: null, number: null };
      }
      return landHexes.get(coordKey(coord))!;
    });

    return {
      hexes,
      harbors,
      coastSlots,
      rotation,
    };
  }

  return null;
}
