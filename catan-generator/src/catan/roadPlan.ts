import type { Board, PlacedSettlement, ResourceType } from './types';
import type { StrategyProfileId } from './resourceWeights';
import { NUMBER_PROB } from './placementModel';
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

export interface RoadScoringContext {
  selfPlayer?: number;
  strategy?: StrategyProfileId;
  playerCount?: number;
  /** Player's raw pip production by resource (from placed settlements). */
  production?: Partial<Record<ResourceType, number>>;
}

/**
 * Compute raw pip production per resource for a player's placed settlements.
 */
export function computePlayerProduction(
  board: Board,
  placed: PlacedSettlement[],
  player: number
): Partial<Record<ResourceType, number>> {
  const vertices = getVertices();
  const result: Partial<Record<ResourceType, number>> = {};
  for (const p of placed) {
    if (p.player !== player) continue;
    const v = vertices.get(p.vertexId);
    if (!v) continue;
    for (const hex of v.hexes) {
      const tile = board.hexes.find(
        (h) => h.coord.q === hex.q && h.coord.r === hex.r
      );
      if (!tile || tile.kind !== 'land' || !tile.resource || tile.resource === 'desert') continue;
      if (tile.number != null) {
        result[tile.resource] = (result[tile.resource] ?? 0) + (NUMBER_PROB[tile.number] ?? 0);
      }
    }
  }
  return result;
}

/**
 * Rate how good a potential expansion vertex is:
 * - 3-hex strongly preferred over 2-hex/1-hex
 * - pip production quality matters
 *
 * Risk filtering is handled upstream: callers pass predicted placements
 * (after simulating opponents) so blocked vertices are already excluded.
 */
function expansionVertexQuality(
  vertexId: string,
  board: Board,
  production?: Partial<Record<ResourceType, number>>,
): number {
  const vertices = getVertices();
  const landSet = getLandSet();
  const v = vertices.get(vertexId);
  if (!v) return 0;

  const producingHexes = v.hexes.filter((hex) => {
    if (!landSet.has(coordKey(hex))) return false;
    const tile = board.hexes.find(
      (h) => h.coord.q === hex.q && h.coord.r === hex.r
    );
    return Boolean(
      tile &&
        tile.kind === 'land' &&
        tile.resource &&
        tile.resource !== 'desert' &&
        tile.number != null
    );
  });
  const hexCount = producingHexes.length;
  if (hexCount === 0) return 0;

  let pipSum = 0;
  let missingResourceBonus = 0;
  for (const hex of producingHexes) {
    const tile = board.hexes.find(
      (h) => h.coord.q === hex.q && h.coord.r === hex.r
    );
    if (!tile || tile.kind !== 'land' || !tile.resource || tile.resource === 'desert') continue;
    if (tile.number != null) {
      const pip = NUMBER_PROB[tile.number] ?? 0;
      pipSum += pip;
      const current = production?.[tile.resource] ?? 0;
      if (current < 0.08) missingResourceBonus += pip * 0.9;
      else if (current < 0.14) missingResourceBonus += pip * 0.45;
    }
  }

  const hexBonus = hexCount >= 3 ? 1.0 : hexCount === 2 ? 0.55 : 0.25;

  return hexBonus * 0.5 + pipSum * 2.0 + missingResourceBonus;
}

/**
 * Score how good it is to point the opening road from `from` toward `to`.
 * Evaluates expansion quality (hex count, production, risk), harbor reach,
 * opponent contest/cutoff, and own-road chaining.
 */
export function scoreRoadDirection(
  fromVertexId: string,
  toVertexId: string,
  board: Board,
  placed: PlacedSettlement[],
  ctx: RoadScoringContext = {}
): number {
  if (!isLegalRoadTarget(fromVertexId, toVertexId)) return -Infinity;

  const vertices = getVertices();
  const landSet = getLandSet();
  const tip = vertices.get(toVertexId);
  if (!tip) return -Infinity;

  const isLongestRoadStrategy =
    ctx.strategy === 'longestRoad' || ctx.strategy === 'both';

  // Quality-weighted expansion: best reachable settlement candidate + count bonus.
  // Capped so it doesn't drown out harbor value.
  let bestExpansion = 0;
  let openCount = 0;
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
        const blocked = placed.some(
          (p) => p.vertexId === n || getVertices().get(p.vertexId)?.neighbors.includes(n)
        );
        if (!blocked) {
          openCount++;
          const quality = expansionVertexQuality(n, board, ctx.production);
          bestExpansion = Math.max(bestExpansion, quality);
        }
      }
    }
  }
  // Best expansion spot dominates, small bonus for having alternatives
  const room = bestExpansion * 1.05 + Math.min(openCount, 4) * 0.06;

  // Harbor should mostly be a tie-breaker unless the player already has strong
  // production of that exact resource.
  let harbor = 0;
  for (const h of board.harbors) {
    for (const node of h.nodeVertexIds) {
      const dFromTip = vertexRoadDistance(toVertexId, node);
      if (dFromTip === null) continue;
      if (dFromTip <= 1) {
        const hDef = h.definition.harbor;
        let bonus: number;
        if (hDef.kind === 'generic') {
          bonus = 0.08;
        } else {
          const prod = ctx.production?.[hDef.resource] ?? 0;
          if (prod < 0.12) bonus = 0.06;
          else if (prod < 0.2) bonus = 0.18;
          else bonus = 0.35 + Math.min(prod - 0.2, 0.22) * 5.0;
        }
        const distFactor = dFromTip === 0 ? 1.0 : 0.6;
        harbor = Math.max(harbor, bonus * distFactor);
      }
    }
  }

  // Contested: opponent road already points into this corridor.
  // For longest-road strategy: contesting (cutting off) an opponent who already
  // built into this corridor can be *positive* if we can block their path.
  let contest = 0;
  let cutoffBonus = 0;
  for (const p of placed) {
    if (ctx.selfPlayer !== undefined && p.player === ctx.selfPlayer) continue;
    if (!p.roadToVertexId) continue;
    const dTip = vertexRoadDistance(p.roadToVertexId, toVertexId);
    if (dTip !== null && dTip <= 2) {
      contest += 0.35 * (1 - dTip * 0.3);
      if (isLongestRoadStrategy && dTip <= 1) {
        cutoffBonus += 0.3 * (1 - dTip * 0.4);
      }
    }
    const dSet = vertexRoadDistance(p.vertexId, toVertexId);
    if (dSet !== null && dSet <= 1) contest += 0.45;
  }

  if (ctx.selfPlayer !== undefined && ctx.playerCount !== undefined && ctx.playerCount > 2) {
    const positionalAggression = ctx.selfPlayer / (ctx.playerCount - 1);
    cutoffBonus *= 0.5 + 0.5 * positionalAggression;
  }

  const contestScale =
    bestExpansion >= 1.4 ? 0.35 : bestExpansion >= 1.15 ? 0.55 : 1.0;
  return room + harbor + cutoffBonus - contest * contestScale;
}

export interface RoadDirectionBreakdown {
  toVertexId: string;
  score: number;
  room: number;
  harbor: number;
  /** Which harbor resource matched, or 'generisk' */
  harborMatch: string;
  cutoff: number;
  contest: number;
}

/**
 * Detailed breakdown per road direction — used for UI explanation.
 */
export function scoreRoadDirectionDetailed(
  fromVertexId: string,
  toVertexId: string,
  board: Board,
  placed: PlacedSettlement[],
  ctx: RoadScoringContext = {}
): RoadDirectionBreakdown | null {
  if (!isLegalRoadTarget(fromVertexId, toVertexId)) return null;

  const vertices = getVertices();
  const landSet = getLandSet();
  const tip = vertices.get(toVertexId);
  if (!tip) return null;

  const isLongestRoadStrategy =
    ctx.strategy === 'longestRoad' || ctx.strategy === 'both';

  let bestExpansion = 0;
  let openCount = 0;
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
        const blocked = placed.some(
          (p) => p.vertexId === n || getVertices().get(p.vertexId)?.neighbors.includes(n)
        );
        if (!blocked) {
          openCount++;
          const quality = expansionVertexQuality(n, board, ctx.production);
          bestExpansion = Math.max(bestExpansion, quality);
        }
      }
    }
  }
  const room = bestExpansion * 1.05 + Math.min(openCount, 4) * 0.06;

  let harbor = 0;
  let harborMatch = '';
  for (const h of board.harbors) {
    for (const node of h.nodeVertexIds) {
      const dFromTip = vertexRoadDistance(toVertexId, node);
      if (dFromTip === null) continue;
      if (dFromTip <= 1) {
        const hDef = h.definition.harbor;
        let bonus: number;
        if (hDef.kind === 'generic') {
          bonus = 0.08;
        } else {
          const prod = ctx.production?.[hDef.resource] ?? 0;
          if (prod < 0.12) bonus = 0.06;
          else if (prod < 0.2) bonus = 0.18;
          else bonus = 0.35 + Math.min(prod - 0.2, 0.22) * 5.0;
        }
        const distFactor = dFromTip === 0 ? 1.0 : 0.6;
        const value = bonus * distFactor;
        if (value > harbor) {
          harbor = value;
          harborMatch = hDef.kind === 'generic' ? 'generisk' : hDef.resource;
        }
      }
    }
  }

  let contest = 0;
  let cutoff = 0;
  for (const p of placed) {
    if (ctx.selfPlayer !== undefined && p.player === ctx.selfPlayer) continue;
    if (!p.roadToVertexId) continue;
    const dTip = vertexRoadDistance(p.roadToVertexId, toVertexId);
    if (dTip !== null && dTip <= 2) {
      contest += 0.35 * (1 - dTip * 0.3);
      if (isLongestRoadStrategy && dTip <= 1) {
        cutoff += 0.3 * (1 - dTip * 0.4);
      }
    }
    const dSet = vertexRoadDistance(p.vertexId, toVertexId);
    if (dSet !== null && dSet <= 1) contest += 0.45;
  }

  if (ctx.selfPlayer !== undefined && ctx.playerCount !== undefined && ctx.playerCount > 2) {
    const positionalAggression = ctx.selfPlayer / (ctx.playerCount - 1);
    cutoff *= 0.5 + 0.5 * positionalAggression;
  }

  const contestScale =
    bestExpansion >= 1.4 ? 0.35 : bestExpansion >= 1.15 ? 0.55 : 1.0;
  const effectiveContest = contest * contestScale;
  const score = room + harbor + cutoff - effectiveContest;
  return { toVertexId, score, room, harbor, harborMatch, cutoff, contest: effectiveContest };
}

export function rankRoadDirections(
  fromVertexId: string,
  board: Board,
  placed: PlacedSettlement[],
  ctx: RoadScoringContext = {}
): RoadDirectionBreakdown[] {
  return getRoadTargets(fromVertexId)
    .map((toVertexId) => scoreRoadDirectionDetailed(fromVertexId, toVertexId, board, placed, ctx))
    .filter((r): r is RoadDirectionBreakdown => r !== null)
    .sort((a, b) => b.score - a.score || a.toVertexId.localeCompare(b.toVertexId));
}

export function pickBestRoadDirection(
  fromVertexId: string,
  board: Board,
  placed: PlacedSettlement[],
  ctx: RoadScoringContext = {}
): string | null {
  return rankRoadDirections(fromVertexId, board, placed, ctx)[0]?.toVertexId ?? null;
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
 * Find potential expansion vertices reachable from `fromVertexId` (2–4 road hops)
 * that are still legal for a future settlement.
 * Returns vertex IDs with their distance — useful for highlighting expansion corridors.
 */
export function getExpansionTargets(
  fromVertexId: string,
  placed: PlacedSettlement[],
  maxDist = 4
): { vertexId: string; distance: number }[] {
  const vertices = getVertices();
  const landSet = getLandSet();
  const dist = new Map<string, number>([[fromVertexId, 0]]);
  const queue = [fromVertexId];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    if (d >= maxDist) continue;
    const v = vertices.get(cur);
    if (!v) continue;
    for (const n of v.neighbors) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      queue.push(n);
    }
  }

  const results: { vertexId: string; distance: number }[] = [];
  for (const [id, d] of dist) {
    if (d < 2) continue;
    const v = vertices.get(id);
    if (!v) continue;
    if (!v.hexes.some((h) => landSet.has(coordKey(h)))) continue;
    const blocked = placed.some(
      (p) =>
        p.vertexId === id ||
        vertices.get(p.vertexId)?.neighbors.includes(id)
    );
    if (!blocked) results.push({ vertexId: id, distance: d });
  }
  return results.sort((a, b) => a.distance - b.distance);
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
