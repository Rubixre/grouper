import type {
  Board,
  HarborType,
  PlacedHarbor,
  PlacedSettlement,
  PlayerCount,
  ResourceWeights,
} from './types';
import { DEFAULT_RESOURCE_WEIGHTS } from './types';
import {
  getValidVertices,
  getVertices,
  pickGreedyOpponentVertex,
  scoreSecondSettlement,
  scoreVertex,
  vertexRawByResource,
} from './settlements';
import {
  NUMBER_PROB,
  PROD_RESOURCES,
  computeBoardEconomics,
  type ProdResource,
} from './placementModel';
import { RESOURCE_LABELS } from './playerStats';
import { getPlacementOrder } from './draftOrder';
import { evaluateFirstSettlementPath } from './strategyAdvisor';
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

/**
 * Konverteringsrate ved handel (kort ut → nyttig kort inn).
 * Sammenlignes mot bank 4:1 (0.25) for å isolere havnens merverdi.
 */
export const HARBOR_TRADE_CONVERSION_RESOURCE = 0.5; // 2:1
export const HARBOR_TRADE_CONVERSION_GENERIC = 1 / 3; // 3:1
export const HARBOR_BANK_CONVERSION = 0.25; // 4:1

/**
 * Skalerer handelsjusteringen til samme størrelsesorden som PSM-score.
 * (Uplift × pip × tradedFraction × receiveWeight er ellers for lite alene.)
 */
export const HARBOR_TRADE_VALUE_SCALE = 2.85;

/** @deprecated Bruk HARBOR_TRADE_CONVERSION_* — beholdt for eventuelle eksterne imports. */
export const HARBOR_TRADE_BONUS_RESOURCE =
  (HARBOR_TRADE_CONVERSION_RESOURCE - HARBOR_BANK_CONVERSION) * HARBOR_TRADE_VALUE_SCALE;
/** @deprecated */
export const HARBOR_TRADE_BONUS_GENERIC =
  (HARBOR_TRADE_CONVERSION_GENERIC - HARBOR_BANK_CONVERSION) * HARBOR_TRADE_VALUE_SCALE;

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
  /** Sammenligning mot beste balanserte plassering (hvis beregnet) */
  vsBalanced?: HarborVsBalanced;
}

export type HarborVerdict = 'weaker' | 'close' | 'even' | 'stronger';

export interface HarborVsBalanced {
  /** PSM-score for denne havnplanen */
  planScore: number;
  /** Beste balanserte alternativ samme tur */
  bestBalancedScore: number;
  /** planScore / bestBalancedScore */
  relative: number;
  /** Netto handelsjustering (inn-verdi via havn − delvis PSM-dobbelttelling) */
  tradeBonus: number;
  /** planScore + tradeBonus */
  effectiveScore: number;
  /** effectiveScore / bestBalancedScore */
  effectiveRelative: number;
  verdict: HarborVerdict;
  verdictLabel: string;
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
 * Hver plan får vsBalanced-sammneligning mot beste balanserte alternativ.
 */
export function findHarborStrategyOpportunities(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS,
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

  const pruned = pruneDominatedHarborOpportunities([...bag.values()])
    .sort(compareHarborOpportunities)
    .slice(0, limit);

  return attachHarborComparisons(
    pruned,
    board,
    placed,
    humanPlayer,
    playerCount,
    weights
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Gjennomsnittlig strategivekt for ressursene du typisk kjøper inn (ikke fokus). */
export function meanReceiveWeight(
  focus: ProdResource,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): number {
  let sum = 0;
  let count = 0;
  for (const resource of PROD_RESOURCES) {
    if (resource === focus) continue;
    sum += weights[resource];
    count += 1;
  }
  return count > 0 ? sum / count : 1;
}

export function meanStrategyWeight(
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): number {
  let sum = 0;
  for (const resource of PROD_RESOURCES) sum += weights[resource];
  return sum / PROD_RESOURCES.length;
}

/**
 * Andel av fokusproduksjon som behandles som handels-surplus (selges),
 * ikke som bygningsvarer man holder på.
 *
 * - Høy konsentrasjon (surplusRatio) → mer selges.
 * - Lav bygningsvekt på fokusressursen → lettere å dumpe (ofte en fordel).
 *
 * Handelsressursens egen strategivekt skal IKKE øke verdien av å selge den.
 */
export function harborTradedFraction(
  opportunity: Pick<HarborStrategyOpportunity, 'resource' | 'resourcePip' | 'otherPip'>,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): number {
  const totalPip = opportunity.resourcePip + opportunity.otherPip;
  const surplusRatio = opportunity.resourcePip / Math.max(totalPip, 1 / 36);
  const avgWeight = meanStrategyWeight(weights);
  const focusWeight = weights[opportunity.resource];
  // 1.0 når fokus er «billig» å dumpe, lavere når fokus er ettertraktet til bygg
  const dumpEase = clamp(0.55 + 0.45 * ((avgWeight - focusWeight) / avgWeight), 0.4, 1);
  return clamp(0.35 * dumpEase + 0.55 * surplusRatio, 0.35, 0.92);
}

/**
 * Andel av fokus-pip×vekt som trekkes fra for å unngå dobbelttelling mot PSM
 * (PSM-total ≠ ren produksjonssum, derfor delvis haircut).
 */
export const HARBOR_TRADE_BUILDING_HAIRCUT = 0.28;

/**
 * Estimert netto merverdi av havnhandel vs. balansert PSM-lesning.
 *
 * - Verdsetter det du FÅR inn (snitt av ikke-fokus), ikke bygningsvekten av
 *   det du selger.
 * - Overflod/konsentrasjon av handelsressursen øker justeringen.
 * - Trekker delvis fra PSM sin «bygningsverdi» for andelen som selges.
 */
export function estimateHarborTradeBonus(
  opportunity: Pick<
    HarborStrategyOpportunity,
    'resource' | 'harborKind' | 'resourcePip' | 'otherPip'
  >,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): number {
  const conversion =
    opportunity.harborKind === 'resource'
      ? HARBOR_TRADE_CONVERSION_RESOURCE
      : HARBOR_TRADE_CONVERSION_GENERIC;
  const conversionUplift = conversion - HARBOR_BANK_CONVERSION;
  const receiveWeight = meanReceiveWeight(opportunity.resource, weights);
  const tradedFraction = harborTradedFraction(opportunity, weights);
  const tradedPip = opportunity.resourcePip * tradedFraction;

  const tradeUplift =
    tradedPip * conversionUplift * receiveWeight * HARBOR_TRADE_VALUE_SCALE;
  const buildingHaircut =
    tradedPip * weights[opportunity.resource] * HARBOR_TRADE_BUILDING_HAIRCUT;

  return tradeUplift - buildingHaircut;
}

export function verdictFromEffectiveRelative(effectiveRelative: number): {
  verdict: HarborVerdict;
  verdictLabel: string;
} {
  if (effectiveRelative >= 1.03) return { verdict: 'stronger', verdictLabel: 'sterkere' };
  if (effectiveRelative >= 0.97) return { verdict: 'even', verdictLabel: 'på nivå' };
  if (effectiveRelative >= 0.88) return { verdict: 'close', verdictLabel: 'nesten' };
  return { verdict: 'weaker', verdictLabel: 'svakere' };
}

function planBalancedScore(
  opportunity: HarborStrategyOpportunity,
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  weights: ResourceWeights
): number {
  const econ = computeBoardEconomics(board, weights);
  const ownCount = placed.filter((p) => p.player === humanPlayer).length;

  if (opportunity.secondVertexId) {
    return scoreSecondSettlement(
      opportunity.secondVertexId,
      opportunity.firstVertexId,
      board,
      econ
    ).total;
  }

  if (ownCount >= 1) {
    return scoreVertex(opportunity.firstVertexId, board, econ).total;
  }

  const path = evaluateFirstSettlementPath(
    board,
    placed,
    humanPlayer,
    playerCount,
    opportunity.firstVertexId,
    weights
  );
  if (path) return path.pairScore;
  return scoreVertex(opportunity.firstVertexId, board, econ).total;
}

function bestBalancedReferenceScore(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  weights: ResourceWeights
): number {
  const econ = computeBoardEconomics(board, weights);
  const own = placed.filter((p) => p.player === humanPlayer);
  const valid = getValidVertices(placed);
  if (valid.length === 0) return 0;

  if (own.length === 1) {
    const firstId = own[0]!.vertexId;
    let best = 0;
    for (const secondId of valid) {
      best = Math.max(best, scoreSecondSettlement(secondId, firstId, board, econ).total);
    }
    return best;
  }

  const shallow = valid
    .map((id) => scoreVertex(id, board, econ))
    .sort((a, b) => b.total - a.total);
  let best = shallow[0]?.total ?? 0;
  for (const spot of shallow.slice(0, 8)) {
    const path = evaluateFirstSettlementPath(
      board,
      placed,
      humanPlayer,
      playerCount,
      spot.vertexId,
      weights
    );
    if (path) best = Math.max(best, path.pairScore);
  }
  return best;
}

export function buildHarborVsBalanced(
  opportunity: HarborStrategyOpportunity,
  bestBalancedScore: number,
  planScore: number,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): HarborVsBalanced {
  const tradeBonus = estimateHarborTradeBonus(opportunity, weights);
  const effectiveScore = planScore + tradeBonus;
  const safeBest = Math.max(bestBalancedScore, 1e-6);
  const relative = planScore / safeBest;
  const effectiveRelative = effectiveScore / safeBest;
  const { verdict, verdictLabel } = verdictFromEffectiveRelative(effectiveRelative);
  return {
    planScore,
    bestBalancedScore,
    relative,
    tradeBonus,
    effectiveScore,
    effectiveRelative,
    verdict,
    verdictLabel,
  };
}

function attachHarborComparisons(
  opportunities: HarborStrategyOpportunity[],
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  weights: ResourceWeights
): HarborStrategyOpportunity[] {
  if (opportunities.length === 0) return opportunities;

  const bestBalancedScore = bestBalancedReferenceScore(
    board,
    placed,
    humanPlayer,
    playerCount,
    weights
  );

  return opportunities
    .map((opp) => {
      const planScore = planBalancedScore(
        opp,
        board,
        placed,
        humanPlayer,
        playerCount,
        weights
      );
      return {
        ...opp,
        vsBalanced: buildHarborVsBalanced(opp, bestBalancedScore, planScore, weights),
      };
    })
    .sort((a, b) => {
      const er =
        (b.vsBalanced?.effectiveRelative ?? 0) - (a.vsBalanced?.effectiveRelative ?? 0);
      if (Math.abs(er) > 1e-9) return er;
      return compareHarborOpportunities(a, b);
    });
}
