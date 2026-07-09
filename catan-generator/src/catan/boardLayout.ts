import type { CoastSlot, HexCoord } from './types';
import { coordKey, getNeighbors, hexEdgeMidpoint } from './hex';

/** Seven centered rows: 4 + 5 + 6 + 7 + 6 + 5 + 4 = 37 hexes */
export const ROW_COUNTS = [4, 5, 6, 7, 6, 5, 4] as const;

export const EDGE_HEX_COUNT = 18;
export const LAND_HEX_COUNT = 19;
export const COAST_SLOT_COUNT = 18;
export const HARBOR_PIECE_COUNT = 6;

/**
 * Build a centered row using odd-r offset → axial conversion.
 * This keeps every row visually centered in pixel space.
 */
function rowHexes(r: number, count: number): HexCoord[] {
  const startCol = count % 2 === 1 ? -(count - 1) / 2 : -count / 2;
  return Array.from({ length: count }, (_, i) => {
    const col = startCol + i;
    const q = col - (r - (r & 1)) / 2;
    return { q, r };
  });
}

/** Build all 37 hex coordinates, rows centered on q = 0 */
export function buildBoardCoords(): HexCoord[] {
  const coords: HexCoord[] = [];
  const centerRow = Math.floor(ROW_COUNTS.length / 2);

  for (let i = 0; i < ROW_COUNTS.length; i++) {
    const r = i - centerRow;
    coords.push(...rowHexes(r, ROW_COUNTS[i]));
  }

  return coords;
}

export const BOARD_HEX_COORDS: HexCoord[] = buildBoardCoords();

let edgeHexCache: Set<string> | null = null;
let landHexCache: HexCoord[] | null = null;

export function getBoardSet(): Set<string> {
  return new Set(BOARD_HEX_COORDS.map(coordKey));
}

/** Outer ring of 18 hexes (at least one neighbor outside the board) */
export function getEdgeHexSet(): Set<string> {
  if (edgeHexCache) return edgeHexCache;

  const boardSet = getBoardSet();
  edgeHexCache = new Set(
    BOARD_HEX_COORDS.filter((coord) =>
      getNeighbors(coord).some((n) => !boardSet.has(coordKey(n)))
    ).map(coordKey)
  );

  return edgeHexCache;
}

export function isEdgeHex(coord: HexCoord): boolean {
  return getEdgeHexSet().has(coordKey(coord));
}

/** Interior 19 hexes that receive resources and numbers */
export function getLandHexCoords(): HexCoord[] {
  if (landHexCache) return landHexCache;

  const edgeSet = getEdgeHexSet();
  landHexCache = BOARD_HEX_COORDS.filter((c) => !edgeSet.has(coordKey(c)));
  return landHexCache;
}

export function getLandSet(): Set<string> {
  return new Set(getLandHexCoords().map(coordKey));
}

function coastEdgeAngle(hex: HexCoord, edge: number): number {
  const mid = hexEdgeMidpoint(hex, edge, 1);
  return Math.atan2(mid.y, mid.x);
}

/**
 * Build 18 coast slots from outward-facing edges on edge hexes.
 */
export function buildCoastSlots(): CoastSlot[] {
  const boardSet = getBoardSet();
  const allEdges: Omit<CoastSlot, 'index'>[] = [];

  for (const hex of BOARD_HEX_COORDS) {
    if (!isEdgeHex(hex)) continue;
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
  for (let i = 0; i < COAST_SLOT_COUNT; i++) {
    const src = allEdges[Math.floor((i * allEdges.length) / COAST_SLOT_COUNT)];
    slots.push({ index: i, hex: src.hex, edge: src.edge });
  }

  return slots;
}

/** Slots covered by a harbor piece starting at `startSlot` */
export function harborSlotsForPiece(startSlot: number): number[] {
  return [0, 1, 2].map((i) => (startSlot + i) % COAST_SLOT_COUNT);
}

/** @deprecated Use BOARD_HEX_COORDS */
export const BASE_HEX_COORDS = BOARD_HEX_COORDS;
