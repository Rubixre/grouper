import type { HexCoord } from './types';
import type { BoardSize } from './boardLayout';
import {
  getEdgeHexCount,
  getHarborTriplePieceCount,
  getSingleEdgeHexSet,
  getSingleEdgePieceCount,
  SINGLE_EDGE_PIECE_COORDS,
} from './boardLayout';
import { getBoardMapping } from './mapping';
import { coordKey } from './hex';

export const HEXES_PER_PIECE = 3;

export function ringPosToKIndex(pos: number, size: BoardSize = 'base'): number {
  const count = getEdgeHexCount(size);
  return ((pos % count) + count) % count + 1;
}

export function kIndexToRingPos(kIndex: number): number {
  return kIndex - 1;
}

function tripleEdgeHexCount(size: BoardSize): number {
  return getEdgeHexCount(size) - getSingleEdgePieceCount(size);
}

export function tripleEdgeKLabels(size: BoardSize = 'base'): string[] {
  const mapping = getBoardMapping(size);
  const singles = getSingleEdgeHexSet(size);
  return mapping.edgeHexes
    .filter((e) => !singles.has(coordKey(e.coord)))
    .map((e) => e.label);
}

export function ringStartForGroup(
  groupIndex: number,
  rotation: number,
  size: BoardSize = 'base'
): number {
  const tripleCount = tripleEdgeHexCount(size);
  return (
    (groupIndex * HEXES_PER_PIECE - 1 + rotation * HEXES_PER_PIECE + tripleCount) %
    tripleCount
  );
}

export function kIndexForGroupSlot(
  groupIndex: number,
  offset: number,
  rotation: number,
  size: BoardSize = 'base'
): number {
  const labels = tripleEdgeKLabels(size);
  const tripleCount = labels.length;
  const pos =
    (ringStartForGroup(groupIndex, rotation, size) + offset + tripleCount) % tripleCount;
  return Number(labels[pos].slice(1));
}

export function kLabelForGroupSlot(
  groupIndex: number,
  offset: number,
  rotation: number,
  size: BoardSize = 'base'
): string {
  return `K${kIndexForGroupSlot(groupIndex, offset, rotation, size)}`;
}

export interface EdgePiece {
  groupIndex: number;
  label: string;
  kLabels: [string, string, string];
  coords: [HexCoord, HexCoord, HexCoord];
}

export interface SingleEdgePiece {
  groupIndex: number;
  label: string;
  kLabel: string;
  coord: HexCoord;
}

export function getEdgePieces(rotation: number, size: BoardSize = 'base'): EdgePiece[] {
  const mapping = getBoardMapping(size);
  const pieceCount = getHarborTriplePieceCount(size);

  return Array.from({ length: pieceCount }, (_, groupIndex) => {
    const kLabels = [0, 1, 2].map((offset) =>
      kLabelForGroupSlot(groupIndex, offset, rotation, size)
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

export function getSingleEdgePieces(size: BoardSize = 'base'): SingleEdgePiece[] {
  if (size === 'base') return [];

  const mapping = getBoardMapping(size);
  const tripleCount = getHarborTriplePieceCount(size);

  return SINGLE_EDGE_PIECE_COORDS.map((coord, i) => {
    const key = coordKey(coord);
    const edge = mapping.edgeByCoord.get(key);
    if (!edge) throw new Error(`Missing single edge hex at ${key}`);
    return {
      groupIndex: tripleCount + i,
      label: `B${tripleCount + i + 1}`,
      kLabel: edge.label,
      coord,
    };
  });
}

export function randomEdgeRotation(size: BoardSize = 'base'): number {
  return Math.floor(Math.random() * getHarborTriplePieceCount(size));
}

export function edgePieceGroupMap(
  rotation: number,
  size: BoardSize = 'base'
): Map<string, number> {
  const map = new Map<string, number>();
  for (const piece of getEdgePieces(rotation, size)) {
    for (const coord of piece.coords) {
      map.set(coordKey(coord), piece.groupIndex);
    }
  }
  for (const piece of getSingleEdgePieces(size)) {
    map.set(coordKey(piece.coord), piece.groupIndex);
  }
  return map;
}

export const DEFAULT_EDGE_GROUPS = [
  ['K18', 'K1', 'K2'],
  ['K3', 'K4', 'K5'],
  ['K6', 'K7', 'K8'],
  ['K9', 'K10', 'K11'],
  ['K12', 'K13', 'K14'],
  ['K15', 'K16', 'K17'],
] as const;
