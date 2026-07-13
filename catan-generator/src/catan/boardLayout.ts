import type { CoastSlot, HexCoord } from './types';
import { coordKey, getNeighbors, hexEdgeMidpoint } from './hex';

export type BoardSize = 'base' | 'extension56';

/** Grunnspill: 4 + 5 + 6 + 7 + 6 + 5 + 4 = 37 hexer */
export const ROW_COUNTS_BASE = [4, 5, 6, 7, 6, 5, 4] as const;

/** 15 nye hexer lagt til grunnbrettet (5–6 spillere) → 52 totalt, 30 land, 22 kant */
export const EXPANSION_HEX_ADDITIONS: HexCoord[] = [
  { q: -1, r: -3 },
  { q: -1, r: 4 },
  { q: -2, r: -2 },
  { q: -2, r: 4 },
  { q: -3, r: -1 },
  { q: -3, r: 4 },
  { q: -4, r: 0 },
  { q: -4, r: 1 },
  { q: -4, r: 2 },
  { q: -4, r: 3 },
  { q: -4, r: 4 },
  { q: 0, r: 4 },
  { q: 1, r: 3 },
  { q: 2, r: 2 },
  { q: 3, r: 1 },
];

/** Fire enkelt-hex kantbrikker (B7–B10) i utvidelsen */
export const SINGLE_EDGE_PIECE_COORDS: HexCoord[] = [
  { q: -4, r: 0 },
  { q: -4, r: 4 },
  { q: 0, r: 4 },
  { q: 3, r: 1 },
];

export const BOARD_SIZE_CONFIG = {
  base: {
    label: 'Grunnspill (3–4 spillere)',
    rowCounts: ROW_COUNTS_BASE,
    totalHexes: 37,
    landCount: 19,
    edgeCount: 18,
    harborTriplePieceCount: 6,
    singleEdgePieceCount: 0,
    coastSlotCount: 18,
  },
  extension56: {
    label: 'Utvidelse 5–6 spillere',
    rowCounts: null,
    totalHexes: 52,
    landCount: 30,
    edgeCount: 22,
    harborTriplePieceCount: 6,
    singleEdgePieceCount: 4,
    coastSlotCount: 22,
  },
} as const;

/** @deprecated use ROW_COUNTS_BASE */
export const ROW_COUNTS = ROW_COUNTS_BASE;

let activeBoardSize: BoardSize = 'base';
const boardHexCache = new Map<BoardSize, HexCoord[]>();
const edgeHexCache = new Map<BoardSize, Set<string>>();
const landHexCache = new Map<BoardSize, HexCoord[]>();

function rowHexes(r: number, count: number): HexCoord[] {
  const startCol = count % 2 === 1 ? -(count - 1) / 2 : -count / 2;
  return Array.from({ length: count }, (_, i) => {
    const col = startCol + i;
    const q = col - (r - (r & 1)) / 2;
    return { q, r };
  });
}

function buildBoardCoordsFromRows(rowCounts: readonly number[]): HexCoord[] {
  const coords: HexCoord[] = [];
  const centerRow = Math.floor(rowCounts.length / 2);

  for (let i = 0; i < rowCounts.length; i++) {
    const r = i - centerRow;
    coords.push(...rowHexes(r, rowCounts[i]));
  }

  return coords;
}

function buildBaseBoardCoords(): HexCoord[] {
  return buildBoardCoordsFromRows(ROW_COUNTS_BASE);
}

function buildExtensionBoardCoords(): HexCoord[] {
  const base = buildBaseBoardCoords();
  const keys = new Set(base.map(coordKey));
  const merged = [...base];
  for (const coord of EXPANSION_HEX_ADDITIONS) {
    const key = coordKey(coord);
    if (!keys.has(key)) {
      keys.add(key);
      merged.push(coord);
    }
  }
  return merged;
}

export function getBoardSize(): BoardSize {
  return activeBoardSize;
}

export function setBoardSize(size: BoardSize): void {
  activeBoardSize = size;
}

export function clearBoardCaches(): void {
  boardHexCache.clear();
  edgeHexCache.clear();
  landHexCache.clear();
}

export function getBoardHexCoords(size: BoardSize = activeBoardSize): HexCoord[] {
  if (!boardHexCache.has(size)) {
    boardHexCache.set(
      size,
      size === 'base' ? buildBaseBoardCoords() : buildExtensionBoardCoords()
    );
  }
  return boardHexCache.get(size)!;
}

/** @deprecated use getBoardHexCoords('base') */
export const BOARD_HEX_COORDS: HexCoord[] = buildBaseBoardCoords();

export function getEdgeHexCount(size: BoardSize = activeBoardSize): number {
  return BOARD_SIZE_CONFIG[size].edgeCount;
}

export function getLandHexCount(size: BoardSize = activeBoardSize): number {
  return BOARD_SIZE_CONFIG[size].landCount;
}

export function getHarborTriplePieceCount(size: BoardSize = activeBoardSize): number {
  return BOARD_SIZE_CONFIG[size].harborTriplePieceCount;
}

export function getSingleEdgePieceCount(size: BoardSize = activeBoardSize): number {
  return BOARD_SIZE_CONFIG[size].singleEdgePieceCount;
}

/** @deprecated use getHarborTriplePieceCount() */
export const HARBOR_PIECE_COUNT = 6;
/** @deprecated */
export const EDGE_HEX_COUNT = 18;
/** @deprecated */
export const LAND_HEX_COUNT = 19;
/** @deprecated */
export const COAST_SLOT_COUNT = 18;

export function getBoardSet(size: BoardSize = activeBoardSize): Set<string> {
  return new Set(getBoardHexCoords(size).map(coordKey));
}

export function getEdgeHexSet(size: BoardSize = activeBoardSize): Set<string> {
  if (!edgeHexCache.has(size)) {
    const boardSet = getBoardSet(size);
    edgeHexCache.set(
      size,
      new Set(
        getBoardHexCoords(size)
          .filter((coord) =>
            getNeighbors(coord).some((n) => !boardSet.has(coordKey(n)))
          )
          .map(coordKey)
      )
    );
  }
  return edgeHexCache.get(size)!;
}

export function isEdgeHex(coord: HexCoord, size: BoardSize = activeBoardSize): boolean {
  return getEdgeHexSet(size).has(coordKey(coord));
}

export function getLandHexCoords(size: BoardSize = activeBoardSize): HexCoord[] {
  if (!landHexCache.has(size)) {
    const edgeSet = getEdgeHexSet(size);
    landHexCache.set(
      size,
      getBoardHexCoords(size).filter((c) => !edgeSet.has(coordKey(c)))
    );
  }
  return landHexCache.get(size)!;
}

export function getLandSet(size: BoardSize = activeBoardSize): Set<string> {
  return new Set(getLandHexCoords(size).map(coordKey));
}

export function getSingleEdgeHexSet(size: BoardSize = activeBoardSize): Set<string> {
  if (size === 'base') return new Set();
  return new Set(SINGLE_EDGE_PIECE_COORDS.map(coordKey));
}

function coastEdgeAngle(hex: HexCoord, edge: number): number {
  const mid = hexEdgeMidpoint(hex, edge, 1);
  return Math.atan2(mid.y, mid.x);
}

export function buildCoastSlots(size: BoardSize = activeBoardSize): CoastSlot[] {
  const boardSet = getBoardSet(size);
  const slotCount = BOARD_SIZE_CONFIG[size].coastSlotCount;
  const allEdges: Omit<CoastSlot, 'index'>[] = [];

  for (const hex of getBoardHexCoords(size)) {
    if (!isEdgeHex(hex, size)) continue;
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = getNeighbors(hex)[edge];
      if (!boardSet.has(coordKey(neighbor))) {
        allEdges.push({ hex, edge });
      }
    }
  }

  allEdges.sort(
    (a, b) => coastEdgeAngle(a.hex, a.edge) - coastEdgeAngle(b.hex, b.edge)
  );

  const slots: CoastSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    const src = allEdges[Math.floor((i * allEdges.length) / slotCount)];
    slots.push({ index: i, hex: src.hex, edge: src.edge });
  }

  return slots;
}

/** Slots covered by a harbor piece starting at `startSlot` */
export function harborSlotsForPiece(
  startSlot: number,
  size: BoardSize = activeBoardSize
): number[] {
  const count = BOARD_SIZE_CONFIG[size].coastSlotCount;
  return [0, 1, 2].map((i) => (startSlot + i) % count);
}

/** @deprecated Use getBoardHexCoords */
export const BASE_HEX_COORDS = BOARD_HEX_COORDS;
