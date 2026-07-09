import type { CoastSlot, HexCoord } from './types';
import { coordKey, hexEdgeMidpoint, hexNeighbor } from './hex';

/** Standard base-game 19 hex layout (axial coordinates) */
export const BASE_HEX_COORDS: HexCoord[] = [
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  { q: 2, r: 1 },
  { q: 0, r: 2 },
  { q: 1, r: 2 },
  { q: 2, r: 2 },
];

export const COAST_SLOT_COUNT = 18;
export const HARBOR_PIECE_COUNT = 6;

export function getBoardSet(): Set<string> {
  return new Set(BASE_HEX_COORDS.map(coordKey));
}

function coastEdgeAngle(hex: HexCoord, edge: number): number {
  const mid = hexEdgeMidpoint(hex, edge, 1);
  return Math.atan2(mid.y, mid.x);
}

/**
 * Build 18 coast slots evenly sampled from the outward-facing perimeter edges.
 * Catan's frame divides the coast into 18 segments; 6 harbor pieces span 3 each.
 */
export function buildCoastSlots(): CoastSlot[] {
  const boardSet = getBoardSet();
  const allEdges: Omit<CoastSlot, 'index'>[] = [];

  for (const hex of BASE_HEX_COORDS) {
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = hexNeighbor(hex, edge);
      if (!boardSet.has(coordKey(neighbor))) {
        allEdges.push({ hex, edge });
      }
    }
  }

  allEdges.sort((a, b) => coastEdgeAngle(a.hex, a.edge) - coastEdgeAngle(b.hex, b.edge));

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
