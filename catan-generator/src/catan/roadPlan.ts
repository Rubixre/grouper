import type { Board, PlacedSettlement } from './types';
import { coordKey } from './hex';
import { getLandSet } from './boardLayout';
import {
  getVertices,
  vertexRoadDistance,
} from './settlements';

/** Canonical undirected edge key */
export function roadEdgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Legal opening-road targets: graph neighbors of the settlement. */
export function getRoadTargets(vertexId: string): string[] {
  const v = getVertices().get(vertexId);
  return v ? [...v.neighbors] : [];
}

export function isLegalRoadTarget(fromVertexId: string, toVertexId: string): boolean {
  return getRoadTargets(fromVertexId).includes(toVertexId);
}

/**
 * Score how good it is to point the opening road from `from` toward `to`.
 * Higher = more expansion room / harbor reach / less contested.
 */
export function scoreRoadDirection(
  fromVertexId: string,
  toVertexId: string,
  board: Board,
  placed: PlacedSettlement[]
): number {
  if (!isLegalRoadTarget(fromVertexId, toVertexId)) return -Infinity;

  const vertices = getVertices();
  const landSet = getLandSet();
  const tip = vertices.get(toVertexId);
  if (!tip) return -Infinity;

  // Open land vertices reachable in 1–2 hops beyond the first road step
  // (not going back to `from`).
  let room = 0;
  const seen = new Set<string>([fromVertexId, toVertexId]);
  const frontier = [toVertexId];
  const depth = new Map<string, number>([[toVertexId, 0]]);
  while (frontier.length > 0) {
    const cur = frontier.shift()!;
    const d = depth.get(cur)!;
    if (d >= 2) continue;
    const v = vertices.get(cur);
    if (!v) continue;
    for (const n of v.neighbors) {
      if (seen.has(n)) continue;
      seen.add(n);
      depth.set(n, d + 1);
      frontier.push(n);
      const nv = vertices.get(n);
      if (nv && nv.hexes.some((h) => landSet.has(coordKey(h)))) {
        // Prefer spots that are still legal for a future settlement
        const blocked = placed.some(
          (p) => p.vertexId === n || getVertices().get(p.vertexId)?.neighbors.includes(n)
        );
        if (!blocked) room += d === 0 ? 0.35 : 0.55;
      }
    }
  }

  // Harbor nodes near the tip / along the branch
  let harbor = 0;
  for (const h of board.harbors) {
    for (const node of h.nodeVertexIds) {
      const dFromTip = vertexRoadDistance(toVertexId, node);
      if (dFromTip === null) continue;
      if (dFromTip <= 2) {
        const kindBonus = h.definition.harbor.kind === 'generic' ? 0.25 : 0.4;
        harbor = Math.max(harbor, kindBonus * (1 - dFromTip * 0.25));
      }
    }
  }

  // Contested: opponent road already points into this corridor
  let contest = 0;
  for (const p of placed) {
    if (!p.roadToVertexId) continue;
    // Opponent road tip close to our tip / target
    const dTip = vertexRoadDistance(p.roadToVertexId, toVertexId);
    if (dTip !== null && dTip <= 2) contest += 0.35 * (1 - dTip * 0.3);
    // Opponent settlement sits on / next to our tip
    const dSet = vertexRoadDistance(p.vertexId, toVertexId);
    if (dSet !== null && dSet <= 1) contest += 0.45;
  }

  // Connect with own earlier opening road when placing #2
  let connect = 0;
  const own = placed.filter((p) => p.roadToVertexId);
  // Caller may pass only prior placements; if any prior settlement's road
  // points toward `from` or `to`, reward chaining.
  for (const p of own) {
    if (!p.roadToVertexId) continue;
    if (p.roadToVertexId === fromVertexId || p.roadToVertexId === toVertexId) {
      connect += 0.5;
    }
    const d = vertexRoadDistance(p.roadToVertexId, toVertexId);
    if (d !== null && d <= 2) connect += 0.2 * (1 - d * 0.25);
  }

  return room + harbor + connect - contest;
}

export function rankRoadDirections(
  fromVertexId: string,
  board: Board,
  placed: PlacedSettlement[]
): { toVertexId: string; score: number }[] {
  return getRoadTargets(fromVertexId)
    .map((toVertexId) => ({
      toVertexId,
      score: scoreRoadDirection(fromVertexId, toVertexId, board, placed),
    }))
    .sort((a, b) => b.score - a.score || a.toVertexId.localeCompare(b.toVertexId));
}

export function pickBestRoadDirection(
  fromVertexId: string,
  board: Board,
  placed: PlacedSettlement[]
): string | null {
  return rankRoadDirections(fromVertexId, board, placed)[0]?.toVertexId ?? null;
}

/** Attach a setup road if missing (lookahead / legacy placements). */
export function withSetupRoad(
  placement: PlacedSettlement,
  board: Board,
  priorPlaced: PlacedSettlement[]
): PlacedSettlement {
  if (
    placement.roadToVertexId &&
    isLegalRoadTarget(placement.vertexId, placement.roadToVertexId)
  ) {
    return placement;
  }
  const roadToVertexId = pickBestRoadDirection(
    placement.vertexId,
    board,
    priorPlaced
  );
  return roadToVertexId ? { ...placement, roadToVertexId } : placement;
}

/**
 * How much an opponent opening road contests expansion from `vertexId`.
 * Used to shrink soft expansion when rivals already claim nearby corridors.
 */
export function roadContestPenalty(
  vertexId: string,
  placed: PlacedSettlement[],
  selfPlayer?: number
): number {
  let penalty = 0;
  for (const p of placed) {
    if (selfPlayer !== undefined && p.player === selfPlayer) continue;
    if (!p.roadToVertexId) continue;
    const dTip = vertexRoadDistance(vertexId, p.roadToVertexId);
    const dSet = vertexRoadDistance(vertexId, p.vertexId);
    if (dTip !== null && dTip <= 2) {
      penalty += 0.018 * (1 - dTip * 0.35);
    }
    if (dSet !== null && dSet <= 2) {
      penalty += 0.01 * (1 - dSet * 0.35);
    }
  }
  return Math.min(penalty, 0.045);
}

/**
 * Bonus when placing near your own opening-road tip (continuation / longest road).
 */
export function ownRoadContinuationBonus(
  vertexId: string,
  placed: PlacedSettlement[],
  selfPlayer: number
): number {
  const own = placed.filter((p) => p.player === selfPlayer && p.roadToVertexId);
  if (own.length === 0) return 0;
  let best = 0;
  for (const p of own) {
    const tip = p.roadToVertexId!;
    const dTip = vertexRoadDistance(vertexId, tip);
    if (dTip === null) continue;
    if (dTip === 0) best = Math.max(best, 0.04);
    else if (dTip === 1) best = Math.max(best, 0.055);
    else if (dTip === 2) best = Math.max(best, 0.025);
  }
  return best;
}
