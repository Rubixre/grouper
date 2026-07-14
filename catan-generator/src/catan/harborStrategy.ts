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
import { coordKey } from './hex';

/**
 * Minimum rå pip for én ressurs før havnstrategi vurderes som aktuell.
 * ≈ 6+4 (5/36+3/36) — solid produksjon, ikke bare én svak hex.
 */
export const HARBOR_STRATEGY_PIP_THRESHOLD = NUMBER_PROB[6]! + NUMBER_PROB[4]!;

/** Gyldig veiavstand til havn: 0 (på havnen) eller 2 — aldri 1 (Catan-avstandsregel). */
export const HARBOR_STRATEGY_VALID_ROAD_DISTANCES = [0, 2] as const;

/** Vekt på øvrige ressurser vs. fokusressurs ved rangering. */
export const HARBOR_STRATEGY_OTHER_WEIGHT = 0.55;

export function isValidHarborRoadDistance(distance: number): boolean {
  return distance === 0 || distance === 2;
}

export type HarborStrategyKind = 'resource' | 'generic';

export interface HarborStrategyOpportunity {
  resource: ProdResource;
  harborKind: HarborStrategyKind;
  /** Rå pip for fokusressursen i planen */
  resourcePip: number;
  /** Rå pip for alle andre produktive ressurser */
  otherPip: number;
  /** Total rå pip for planen */
  totalPip: number;
  /** Antall produktive landhex i planen */
  producingHexCount: number;
  /** Sorted land-hex nøkler for 1. landsby (til dominans-sjekk) */
  firstHexKeys: string[];
  /** Sorted land-hex nøkler for 2. landsby */
  secondHexKeys: string[];
  firstVertexId: string;
  secondVertexId?: string;
  /** true når en landsby står direkte på havnen */
  sameSpot: boolean;
  /** Korteste veiavstand fra nærmeste landsby til havn (0 eller 2) */
  harborRoadDistance: number;
  harborName: string;
  harborNodeLabels: string;
  harborNodeVertexIds: [string, string];
  harborReachLabel: string;
  summary: string;
  strength: 'strong' | 'moderate';
}

export function harborOpportunityKey(o: HarborStrategyOpportunity): string {
  return [
    o.resource,
    o.harborKind,
    o.firstVertexId,
    o.secondVertexId ?? '',
    o.harborRoadDistance,
    o.harborName,
  ].join('|');
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

function bestReachableHarbor(
  settlementIds: string[],
  board: Board,
  resource: ProdResource
): { kind: HarborStrategyKind; roadDistance: number; harbor: PlacedHarbor } | null {
  let best: { kind: HarborStrategyKind; roadDistance: number; harbor: PlacedHarbor } | null =
    null;

  for (const harbor of board.harbors) {
    const kind = harborMatchesResource(harbor.definition.harbor, resource);
    if (!kind) continue;

    const distance = harborDistanceFromSettlements(settlementIds, harbor);
    if (distance === null || !isValidHarborRoadDistance(distance)) continue;

    if (!best) {
      best = { kind, roadDistance: distance, harbor };
      continue;
    }

    const betterKind = kind === 'resource' && best.kind === 'generic';
    const sameKindCloser = kind === best.kind && distance < best.roadDistance;
    if (betterKind || sameKindCloser) {
      best = { kind, roadDistance: distance, harbor };
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

function sumRaw(raw: Partial<Record<ProdResource, number>>): number {
  let total = 0;
  for (const r of PROD_RESOURCES) total += raw[r] ?? 0;
  return total;
}

function landHexKeys(vertexId: string, board: Board): string[] {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId);
  if (!vertex) return [];
  const keys: string[] = [];
  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (
      !tile ||
      tile.kind !== 'land' ||
      !tile.resource ||
      tile.resource === 'desert' ||
      !tile.number
    ) {
      continue;
    }
    keys.push(coordKey(hex));
  }
  return keys.sort();
}

function isSubsetHexKeys(subset: string[], set: string[]): boolean {
  if (subset.length > set.length) return false;
  const larger = new Set(set);
  return subset.every((k) => larger.has(k));
}

function harborReachLabel(roadDistance: number): string {
  return roadDistance === 0 ? 'på havnen' : '2 veier unna';
}

function summarize(
  resource: ProdResource,
  harborKind: HarborStrategyKind,
  resourcePip: number,
  roadDistance: number,
  harborName: string
): { summary: string; strength: 'strong' | 'moderate' } {
  const label = RESOURCE_LABELS[resource].toLowerCase();
  const pipTxt = (resourcePip * 36).toFixed(0);
  const ratio = harborKind === 'resource' ? '2:1' : '3:1';
  const reach = harborReachLabel(roadDistance);
  const strength = harborKind === 'resource' ? 'strong' : 'moderate';
  return {
    strength,
    summary: `Fokus ${label} (~${pipTxt}/36) · ${harborName} (${ratio}) ${reach}.`,
  };
}

/** Sammenligningsverdi: fokusressurs først, deretter øvrige ressurser. */
export function harborOpportunityScore(o: {
  resourcePip: number;
  otherPip: number;
  producingHexCount: number;
}): number {
  return (
    o.resourcePip +
    HARBOR_STRATEGY_OTHER_WEIGHT * o.otherPip +
    (1 / 36) * 0.15 * o.producingHexCount
  );
}

export function compareHarborOpportunities(
  a: HarborStrategyOpportunity,
  b: HarborStrategyOpportunity
): number {
  const strengthRank = (s: 'strong' | 'moderate') => (s === 'strong' ? 1 : 0);
  const strengthDiff = strengthRank(b.strength) - strengthRank(a.strength);
  if (strengthDiff !== 0) return strengthDiff;

  const scoreDiff = harborOpportunityScore(b) - harborOpportunityScore(a);
  if (Math.abs(scoreDiff) > 1e-12) return scoreDiff;

  if (b.resourcePip !== a.resourcePip) return b.resourcePip - a.resourcePip;
  if (b.otherPip !== a.otherPip) return b.otherPip - a.otherPip;
  if (b.producingHexCount !== a.producingHexCount) {
    return b.producingHexCount - a.producingHexCount;
  }
  if (a.harborRoadDistance !== b.harborRoadDistance) {
    return a.harborRoadDistance - b.harborRoadDistance;
  }
  return 0;
}

/**
 * True hvis `dominator` er minst like bra på fokus + øvrig produksjon,
 * samme/nærmere havn, og strengt bedre et sted — eller har hex-supersett
 * med minst like god fokusproduksjon (f.eks. 3-hex vs. samme 2-hex).
 */
export function isHarborOpportunityDominatedBy(
  candidate: HarborStrategyOpportunity,
  dominator: HarborStrategyOpportunity
): boolean {
  if (candidate.resource !== dominator.resource) return false;
  if (candidate.harborKind !== dominator.harborKind) return false;
  if (candidate.harborName !== dominator.harborName) return false;
  if ((candidate.secondVertexId ?? '') !== (dominator.secondVertexId ?? '')) return false;
  if (candidate.firstVertexId === dominator.firstVertexId) return false;

  if (dominator.harborRoadDistance > candidate.harborRoadDistance) return false;
  if (dominator.resourcePip + 1e-12 < candidate.resourcePip) return false;

  const hexSuperset =
    isSubsetHexKeys(candidate.firstHexKeys, dominator.firstHexKeys) &&
    candidate.firstHexKeys.length < dominator.firstHexKeys.length &&
    isSubsetHexKeys(candidate.secondHexKeys, dominator.secondHexKeys);

  const betterOrEqualElsewhere =
    dominator.otherPip + 1e-12 >= candidate.otherPip &&
    dominator.producingHexCount >= candidate.producingHexCount;

  const strictlyBetter =
    dominator.resourcePip > candidate.resourcePip + 1e-12 ||
    dominator.otherPip > candidate.otherPip + 1e-12 ||
    dominator.producingHexCount > candidate.producingHexCount ||
    dominator.harborRoadDistance < candidate.harborRoadDistance ||
    hexSuperset;

  if (hexSuperset && dominator.resourcePip + 1e-12 >= candidate.resourcePip) {
    return true;
  }

  return betterOrEqualElsewhere && strictlyBetter;
}

export function pruneDominatedHarborOpportunities(
  opportunities: HarborStrategyOpportunity[]
): HarborStrategyOpportunity[] {
  return opportunities.filter(
    (candidate) =>
      !opportunities.some((other) => isHarborOpportunityDominatedBy(candidate, other))
  );
}

function addOpportunity(
  bag: Map<string, HarborStrategyOpportunity>,
  opportunity: HarborStrategyOpportunity
): void {
  const key = harborOpportunityKey(opportunity);
  const existing = bag.get(key);
  if (!existing || harborOpportunityScore(opportunity) > harborOpportunityScore(existing)) {
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
  const firstHexKeys = landHexKeys(firstVertexId, board);
  const secondHexKeys = secondVertexId ? landHexKeys(secondVertexId, board) : [];
  const producingHexCount = firstHexKeys.length + secondHexKeys.length;
  const totalPip = sumRaw(combinedRaw);

  for (const resource of PROD_RESOURCES) {
    const resourcePip = combinedRaw[resource] ?? 0;
    if (resourcePip + 1e-12 < HARBOR_STRATEGY_PIP_THRESHOLD) continue;

    const harbor = bestReachableHarbor(settlementIds, board, resource);
    if (!harbor) continue;

    const otherPip = totalPip - resourcePip;
    const { summary, strength } = summarize(
      resource,
      harbor.kind,
      resourcePip,
      harbor.roadDistance,
      harbor.harbor.definition.name
    );

    addOpportunity(bag, {
      resource,
      harborKind: harbor.kind,
      resourcePip,
      otherPip,
      totalPip,
      producingHexCount,
      firstHexKeys,
      secondHexKeys,
      firstVertexId,
      secondVertexId,
      sameSpot: harbor.roadDistance === 0,
      harborRoadDistance: harbor.roadDistance,
      harborName: harbor.harbor.definition.name,
      harborNodeLabels: harbor.harbor.nodeLabels.join('–'),
      harborNodeVertexIds: harbor.harbor.nodeVertexIds,
      harborReachLabel: harborReachLabel(harbor.roadDistance),
      summary,
      strength,
    });
  }
}

/**
 * Finn havnstrategier som alternativ til vanlig scoring.
 * Maksimerer fokusproduksjon først, deretter øvrige ressurser / hex-dekning.
 * Dominerte planer (f.eks. 2-hex vs. samme 2 + én til) fjernes.
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
        return {
          vertexId,
          raw,
          bestResource,
          bestPip,
          totalPip: sumRaw(raw),
          hexCount: landHexKeys(vertexId, board).length,
        };
      })
      .filter((c) => c.bestPip >= HARBOR_STRATEGY_PIP_THRESHOLD * 0.55)
      .sort((a, b) => {
        if (b.bestPip !== a.bestPip) return b.bestPip - a.bestPip;
        if (b.totalPip !== a.totalPip) return b.totalPip - a.totalPip;
        return b.hexCount - a.hexCount;
      })
      .slice(0, 14);

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

  return pruneDominatedHarborOpportunities([...bag.values()])
    .sort(compareHarborOpportunities)
    .slice(0, limit);
}
