import type { Board, HarborType, PlacedHarbor, PlacedSettlement, PlayerCount } from './types';
import {
  getValidVertices,
  getVertices,
  pickGreedyOpponentVertex,
  vertexRawByResource,
} from './settlements';
import { NUMBER_PROB, PROD_RESOURCES, type ProdResource } from './placementModel';
import { RESOURCE_LABELS } from './playerStats';
import { getPlacementOrder } from './draftOrder';

/**
 * Minimum rå pip for én ressurs før havnstrategi vurderes som aktuell.
 * ≈ 6+4 (5/36+3/36) — solid produksjon, ikke bare én svak hex.
 */
export const HARBOR_STRATEGY_PIP_THRESHOLD = NUMBER_PROB[6]! + NUMBER_PROB[4]!;

/** Gyldig veiavstand til havn: 0 (på havnen) eller 2 — aldri 1 (Catan-avstandsregel). */
export const HARBOR_STRATEGY_VALID_ROAD_DISTANCES = [0, 2] as const;

export function isValidHarborRoadDistance(distance: number): boolean {
  return distance === 0 || distance === 2;
}

export type HarborStrategyKind = 'resource' | 'generic';

export interface HarborStrategyOpportunity {
  resource: ProdResource;
  harborKind: HarborStrategyKind;
  /** Rå pip for fokusressursen i planen */
  resourcePip: number;
  firstVertexId: string;
  secondVertexId?: string;
  /** true når en landsby står direkte på havnen */
  sameSpot: boolean;
  /** Korteste veiavstand fra nærmeste landsby til havn (0 eller 2) */
  harborRoadDistance: number;
  summary: string;
  strength: 'strong' | 'moderate';
}

function simulateToHumanSecondTurn(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  humanFirstVertex: string
): PlacedSettlement[] | null {
  let simulated: PlacedSettlement[] = [
    ...placed,
    { vertexId: humanFirstVertex, player: humanPlayer, isCity: false },
  ];
  const order = getPlacementOrder(playerCount);
  let step = simulated.length;

  while (step < order.length) {
    const player = order[step];
    const humanCount = simulated.filter((p) => p.player === humanPlayer).length;
    if (player === humanPlayer && humanCount === 1) return simulated;

    const pickVertexId = pickGreedyOpponentVertex(board, simulated, player);
    if (!pickVertexId) return null;
    simulated = [...simulated, { vertexId: pickVertexId, player, isCity: false }];
    step++;
  }
  return null;
}

function harborMatchesResource(harbor: HarborType, resource: ProdResource): HarborStrategyKind | null {
  if (harbor.kind === 'generic') return 'generic';
  if (harbor.kind === 'resource' && harbor.resource === resource) return 'resource';
  return null;
}

/** Korteste veiavstand mellom to hjørner (ubegrenset BFS; null hvis frakoblet). */
export function vertexRoadDistance(fromId: string, toId: string): number | null {
  if (fromId === toId) return 0;
  const vertices = getVertices();
  if (!vertices.has(fromId) || !vertices.has(toId)) return null;

  const queue: string[] = [fromId];
  const dist = new Map<string, number>([[fromId, 0]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = dist.get(current)!;
    const vertex = vertices.get(current);
    if (!vertex) continue;
    for (const neighbor of vertex.neighbors) {
      if (dist.has(neighbor)) continue;
      const next = d + 1;
      if (neighbor === toId) return next;
      dist.set(neighbor, next);
      queue.push(neighbor);
    }
  }
  return null;
}

/** Minste veiavstand fra settet av landsbyer til nærmeste havn-node. */
function harborDistanceFromSettlements(
  settlementIds: string[],
  harbor: PlacedHarbor
): number | null {
  let best: number | null = null;
  for (const settlementId of settlementIds) {
    for (const harborNode of harbor.nodeVertexIds) {
      const d = vertexRoadDistance(settlementId, harborNode);
      if (d === null) continue;
      if (best === null || d < best) best = d;
    }
  }
  return best;
}

/**
 * Beste havn for ressursen som ligger 0 eller 2 veier fra minst én landsby
 * (avstand 1 er ugyldig — man kan ikke bygge der). 2:1 prioriteres over 3:1.
 */
function bestReachableHarbor(
  settlementIds: string[],
  board: Board,
  resource: ProdResource
): { kind: HarborStrategyKind; roadDistance: number } | null {
  let best: { kind: HarborStrategyKind; roadDistance: number } | null = null;

  for (const harbor of board.harbors) {
    const kind = harborMatchesResource(harbor.definition.harbor, resource);
    if (!kind) continue;

    const distance = harborDistanceFromSettlements(settlementIds, harbor);
    if (distance === null || !isValidHarborRoadDistance(distance)) continue;

    if (!best) {
      best = { kind, roadDistance: distance };
      continue;
    }

    const betterKind = kind === 'resource' && best.kind === 'generic';
    const sameKindCloser = kind === best.kind && distance < best.roadDistance;
    if (betterKind || sameKindCloser) {
      best = { kind, roadDistance: distance };
    }
  }

  return best;
}

function combineRaw(
  a: Partial<Record<ProdResource, number>>,
  b: Partial<Record<ProdResource, number>>
): Partial<Record<ProdResource, number>> {
  const out: Partial<Record<ProdResource, number>> = { ...a };
  for (const r of PROD_RESOURCES) {
    const v = b[r] ?? 0;
    if (v > 0) out[r] = (out[r] ?? 0) + v;
  }
  return out;
}

function summarize(
  resource: ProdResource,
  harborKind: HarborStrategyKind,
  resourcePip: number,
  roadDistance: number
): { summary: string; strength: 'strong' | 'moderate' } {
  const label = RESOURCE_LABELS[resource].toLowerCase();
  const pipTxt = (resourcePip * 36).toFixed(0);
  const harborLabel = harborKind === 'resource' ? `2:1 ${label}havn` : '3:1-havn';
  const reach =
    roadDistance === 0 ? 'på landsbyen (direkte på havnen)' : '2 veier unna';

  if (harborKind === 'resource') {
    return {
      strength: 'strong',
      summary:
        roadDistance === 0
          ? `God ${label}-produksjon (~${pipTxt}/36) med ${harborLabel} ${reach} — mulig spesialiseringsstrategi.`
          : `God ${label}-produksjon (~${pipTxt}/36) med ${harborLabel} ${reach} — havn nås med to veier (avstand 1 er ikke spillbart).`,
    };
  }
  return {
    strength: 'moderate',
    summary:
      roadDistance === 0
        ? `Solid ${label}-produksjon (~${pipTxt}/36) ved ${harborLabel} ${reach} — svakere enn 2:1, men kan fungere som havnstrategi.`
        : `Solid ${label}-produksjon (~${pipTxt}/36) med ${harborLabel} ${reach} — moderat alternativ hvis 2:1 ikke er tilgjengelig.`,
  };
}

function opportunityKey(o: HarborStrategyOpportunity): string {
  return [
    o.resource,
    o.harborKind,
    o.firstVertexId,
    o.secondVertexId ?? '',
    o.harborRoadDistance,
  ].join('|');
}

function addOpportunity(
  bag: Map<string, HarborStrategyOpportunity>,
  opportunity: HarborStrategyOpportunity
): void {
  const key = opportunityKey(opportunity);
  const existing = bag.get(key);
  if (!existing || opportunity.resourcePip > existing.resourcePip) {
    bag.set(key, opportunity);
  }
}

function considerPlan(
  bag: Map<string, HarborStrategyOpportunity>,
  board: Board,
  firstVertexId: string,
  secondVertexId: string | undefined,
  combinedRaw: Partial<Record<ProdResource, number>>
): void {
  const settlementIds = secondVertexId ? [firstVertexId, secondVertexId] : [firstVertexId];
  for (const resource of PROD_RESOURCES) {
    const resourcePip = combinedRaw[resource] ?? 0;
    if (resourcePip + 1e-12 < HARBOR_STRATEGY_PIP_THRESHOLD) continue;

    const harbor = bestReachableHarbor(settlementIds, board, resource);
    if (!harbor) continue;

    const { summary, strength } = summarize(
      resource,
      harbor.kind,
      resourcePip,
      harbor.roadDistance
    );

    addOpportunity(bag, {
      resource,
      harborKind: harbor.kind,
      resourcePip,
      firstVertexId,
      secondVertexId,
      sameSpot: harbor.roadDistance === 0,
      harborRoadDistance: harbor.roadDistance,
      summary,
      strength,
    });
  }
}

/**
 * Finn havnstrategier som alternativ til vanlig scoring.
 * Havn må ligge 0 eller 2 veier fra minst én landsby (aldri 1).
 * Påvirker ikke rangering.
 */
export function findHarborStrategyOpportunities(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  limit = 4
): HarborStrategyOpportunity[] {
  const bag = new Map<string, HarborStrategyOpportunity>();
  const own = placed.filter((p) => p.player === humanPlayer);
  const valid = getValidVertices(placed);

  if (own.length === 0) {
    for (const vertexId of valid) {
      considerPlan(bag, board, vertexId, undefined, vertexRawByResource(vertexId, board));
    }

    // Par: sterk produksjon + annen landsby som bringer havn 0 eller 2 veier unna
    const productionCandidates = valid
      .map((vertexId) => {
        const raw = vertexRawByResource(vertexId, board);
        let bestResource: ProdResource | null = null;
        let bestPip = 0;
        for (const r of PROD_RESOURCES) {
          const pip = raw[r] ?? 0;
          if (pip > bestPip) {
            bestPip = pip;
            bestResource = r;
          }
        }
        return { vertexId, raw, bestResource, bestPip };
      })
      .filter((c) => c.bestPip >= HARBOR_STRATEGY_PIP_THRESHOLD * 0.55)
      .sort((a, b) => b.bestPip - a.bestPip)
      .slice(0, 10);

    for (const candidate of productionCandidates) {
      const simulated = simulateToHumanSecondTurn(
        board,
        placed,
        humanPlayer,
        playerCount,
        candidate.vertexId
      );
      if (!simulated) continue;

      for (const secondId of getValidVertices(simulated)) {
        const combined = combineRaw(candidate.raw, vertexRawByResource(secondId, board));
        if ((combined[candidate.bestResource!] ?? 0) + 1e-12 < HARBOR_STRATEGY_PIP_THRESHOLD) {
          continue;
        }
        if (!bestReachableHarbor([candidate.vertexId, secondId], board, candidate.bestResource!)) {
          continue;
        }
        considerPlan(bag, board, candidate.vertexId, secondId, combined);
      }
    }
  } else if (own.length === 1) {
    const firstVertexId = own[0]!.vertexId;
    const firstRaw = vertexRawByResource(firstVertexId, board);
    for (const secondId of valid) {
      const combined = combineRaw(firstRaw, vertexRawByResource(secondId, board));
      considerPlan(bag, board, firstVertexId, secondId, combined);
    }
  }

  return [...bag.values()]
    .sort((a, b) => {
      const strengthRank = (s: 'strong' | 'moderate') => (s === 'strong' ? 1 : 0);
      const d = strengthRank(b.strength) - strengthRank(a.strength);
      if (d !== 0) return d;
      if (a.harborRoadDistance !== b.harborRoadDistance) {
        return a.harborRoadDistance - b.harborRoadDistance;
      }
      return b.resourcePip - a.resourcePip;
    })
    .slice(0, limit);
}
