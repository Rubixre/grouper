import type { Board, BoardSize } from './types';
import { getBoardMapping } from './mapping';
import { RESOURCE_LABELS, type ProdResource } from './playerStats';
import { getVertices } from './settlements';

/** Kort beskrivelse av et hjørne for UI (H-node + tilstøtende hex). */
export function describeSettlementVertex(
  board: Board,
  boardSize: BoardSize,
  vertexId: string
): { label: string; tiles: string } {
  const mapping = getBoardMapping(boardSize);
  const corner = mapping.cornerByVertexId.get(vertexId);
  const tiles = adjacentTileSummary(board, vertexId);
  const label = corner?.label ?? 'Indre hjørne';
  return { label, tiles };
}

export function formatSettlementVertexLine(
  board: Board,
  boardSize: BoardSize,
  vertexId: string,
  prefix: string
): string {
  const { label, tiles } = describeSettlementVertex(board, boardSize, vertexId);
  return tiles ? `${prefix} ${label} · ${tiles}` : `${prefix} ${label}`;
}

function adjacentTileSummary(board: Board, vertexId: string): string {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId);
  if (!vertex) return '';

  const parts: string[] = [];
  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (!tile || tile.kind !== 'land' || !tile.resource || tile.resource === 'desert') {
      continue;
    }
    const name = RESOURCE_LABELS[tile.resource as ProdResource];
    parts.push(tile.number != null ? `${name} ${tile.number}` : name);
  }
  return parts.join(' / ');
}
