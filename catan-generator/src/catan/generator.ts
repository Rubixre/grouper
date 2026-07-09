import type {
  Board,
  GeneratorSettings,
  HexCoord,
  HexTile,
  ResourceType,
} from './types';
import { DEFAULT_SETTINGS } from './types';
import { BASE_HEX_COORDS, buildCoastSlots } from './boardLayout';
import { placeHarborPieces } from './harbors';
import { coordKey, getBoardNeighbors } from './hex';

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

function violatesNumberAdjacency(
  hexes: Map<string, HexTile>,
  coord: HexCoord,
  number: number,
  settings: GeneratorSettings,
  boardSet: Set<string>
): boolean {
  const neighbors = getBoardNeighbors(coord, boardSet);
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
  boardSet: Set<string>
): boolean {
  if (!settings.noAdjacentSameResource || resource === 'desert') return false;
  const neighbors = getBoardNeighbors(coord, boardSet);
  for (const n of neighbors) {
    const tile = hexes.get(coordKey(n));
    if (tile && tile.resource === resource) return true;
  }
  return false;
}

function tryPlaceResources(
  coords: HexCoord[],
  settings: GeneratorSettings,
  boardSet: Set<string>,
  maxAttempts = 5000
): Map<string, HexTile> | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(RESOURCES);
    const hexes = new Map<string, HexTile>();
    let valid = true;

    for (let i = 0; i < coords.length; i++) {
      const coord = coords[i];
      const resource = shuffled[i];
      if (violatesResourceAdjacency(hexes, coord, resource, settings, boardSet)) {
        valid = false;
        break;
      }
      hexes.set(coordKey(coord), { coord, resource, number: null });
    }

    if (valid) return hexes;
  }
  return null;
}

function tryPlaceNumbers(
  hexes: Map<string, HexTile>,
  settings: GeneratorSettings,
  boardSet: Set<string>,
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
      if (
        violatesNumberAdjacency(hexes, tile.coord, number, settings, boardSet)
      ) {
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
  const boardSet = new Set(BASE_HEX_COORDS.map(coordKey));
  const coastSlots = buildCoastSlots();

  for (let attempt = 0; attempt < 200; attempt++) {
    const hexes = tryPlaceResources(BASE_HEX_COORDS, settings, boardSet);
    if (!hexes) continue;
    if (!tryPlaceNumbers(hexes, settings, boardSet)) continue;

    const { harbors, rotation } = placeHarborPieces();

    return {
      hexes: BASE_HEX_COORDS.map((c) => hexes.get(coordKey(c))!),
      harbors,
      coastSlots,
      rotation,
    };
  }

  return null;
}
