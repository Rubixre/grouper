import type { Board, HexCoord, PlacedSettlement } from './types';
import { NUMBER_PROB } from './placementModel';
import { coordKey } from './hex';
import { getVertices } from './settlements';

export interface RobberHexAdvice {
  coord: HexCoord;
  key: string;
  score: number;
  /** Opponent expected pip hit on this hex (cities count double). */
  opponentPip: number;
  /** Your expected pip hit on this hex. */
  selfPip: number;
  number: number | null;
  resource: string | null;
  reason: string;
}

function pipOnHex(
  board: Board,
  placements: PlacedSettlement[],
  hexKey: string,
  playerFilter: (player: number) => boolean
): number {
  const tile = board.hexes.find((h) => coordKey(h.coord) === hexKey);
  if (!tile || tile.kind !== 'land' || !tile.number || tile.resource === 'desert') {
    return 0;
  }
  const prob = NUMBER_PROB[tile.number] ?? 0;
  const vertices = getVertices();
  let pip = 0;
  for (const p of placements) {
    if (!playerFilter(p.player)) continue;
    const v = vertices.get(p.vertexId);
    if (!v) continue;
    if (!v.hexes.some((h) => coordKey(h) === hexKey)) continue;
    pip += prob * (p.isCity ? 2 : 1);
  }
  return pip;
}

/**
 * Rank land hexes for robber placement: hit opponents, spare yourself,
 * prefer red numbers and sole-owner opponent hexes.
 */
export function rankRobberTargets(
  board: Board,
  placements: PlacedSettlement[],
  selfPlayer: number,
  currentRobberKey: string | null = null
): RobberHexAdvice[] {
  const advice: RobberHexAdvice[] = [];

  for (const tile of board.hexes) {
    if (tile.kind !== 'land' || !tile.resource || tile.resource === 'desert') continue;
    if (tile.number == null) continue;
    const key = coordKey(tile.coord);
    if (currentRobberKey && key === currentRobberKey) continue;

    const opponentPip = pipOnHex(board, placements, key, (p) => p !== selfPlayer);
    const selfPip = pipOnHex(board, placements, key, (p) => p === selfPlayer);
    if (opponentPip <= 0 && selfPip <= 0) continue;

    const red = tile.number === 6 || tile.number === 8 ? 1 : 0;
    const soleOwnerBonus =
      opponentPip > 0 && selfPip === 0 ? 0.35 * opponentPip : 0;
    const score =
      opponentPip * 1.35 - selfPip * 1.1 + red * 0.08 + soleOwnerBonus;

    const reasons: string[] = [];
    if (opponentPip > 0) {
      reasons.push(`treffer motstander ${(opponentPip * 36).toFixed(1)}/36`);
    }
    if (selfPip > 0) {
      reasons.push(`treffer deg ${(selfPip * 36).toFixed(1)}/36`);
    }
    if (red) reasons.push('rødt tall');
    if (soleOwnerBonus > 0) reasons.push('kun motstander');

    advice.push({
      coord: tile.coord,
      key,
      score,
      opponentPip,
      selfPip,
      number: tile.number,
      resource: tile.resource,
      reason: reasons.join(' · ') || 'nøytral',
    });
  }

  advice.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return advice;
}
