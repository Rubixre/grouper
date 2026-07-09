import type { HexCoord } from './types';
import { EDGE_HEX_COUNT, HARBOR_PIECE_COUNT } from './boardLayout';
import { getBoardMapping } from './mapping';
import { coordKey } from './hex';

export const HEXES_PER_PIECE = 3;

/** Ring position 0 = K1, …, 17 = K18 (clockwise) */
export function ringPosToKIndex(pos: number): number {
  return ((pos % EDGE_HEX_COUNT) + EDGE_HEX_COUNT) % EDGE_HEX_COUNT + 1;
}

export function kIndexToRingPos(kIndex: number): number {
  return kIndex - 1;
}

/** Start ring position for piece group g at rotation r (G0 default: K18,K1,K2) */
export function ringStartForGroup(groupIndex: number, rotation: number): number {
  return (groupIndex * HEXES_PER_PIECE - 1 + rotation * HEXES_PER_PIECE + EDGE_HEX_COUNT) % EDGE_HEX_COUNT;
}

/** 1-based K index for slot within a piece group */
export function kIndexForGroupSlot(
  groupIndex: number,
  offset: number,
  rotation: number
): number {
  const pos = (ringStartForGroup(groupIndex, rotation) + offset + EDGE_HEX_COUNT) % EDGE_HEX_COUNT;
  return ringPosToKIndex(pos);
}

export function kLabelForGroupSlot(
  groupIndex: number,
  offset: number,
  rotation: number
): string {
  return `K${kIndexForGroupSlot(groupIndex, offset, rotation)}`;
}

export interface EdgePiece {
  groupIndex: number;
  /** Physical piece id B1–B6 */
  label: string;
  kLabels: [string, string, string];
  coords: [HexCoord, HexCoord, HexCoord];
}

export function getEdgePieces(rotation: number): EdgePiece[] {
  const mapping = getBoardMapping();

  return Array.from({ length: HARBOR_PIECE_COUNT }, (_, groupIndex) => {
    const kLabels = [0, 1, 2].map(
      (offset) => kLabelForGroupSlot(groupIndex, offset, rotation)
    ) as [string, string, string];

    const coords = kLabels.map((label) => {
      const edge = mapping.edgeByLabel.get(label);
      if (!edge) throw new Error(`Missing edge hex ${label}`);
      return edge.coord;
    }) as [HexCoord, HexCoord, HexCoord];

    return {
      groupIndex,
      label: `B${groupIndex + 1}`,
      kLabels,
      coords,
    };
  });
}

export function randomEdgeRotation(): number {
  return Math.floor(Math.random() * HARBOR_PIECE_COUNT);
}

/** coord key → piece group index at this rotation */
export function edgePieceGroupMap(rotation: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const piece of getEdgePieces(rotation)) {
    for (const coord of piece.coords) {
      map.set(coordKey(coord), piece.groupIndex);
    }
  }
  return map;
}

/** Default groups at rotation 0 for reference */
export const DEFAULT_EDGE_GROUPS = [
  ['K18', 'K1', 'K2'],
  ['K3', 'K4', 'K5'],
  ['K6', 'K7', 'K8'],
  ['K9', 'K10', 'K11'],
  ['K12', 'K13', 'K14'],
  ['K15', 'K16', 'K17'],
] as const;
