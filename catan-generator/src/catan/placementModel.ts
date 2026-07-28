import type { Board, HarborType, HexCoord, HexTile, ResourceType, ResourceWeights } from './types';
import { DEFAULT_RESOURCE_WEIGHTS } from './types';
import { coverageBonus } from './resourceWeights';
import { coordKey, hexNeighbor } from './hex';

/** Terningssannsynlighet per tall (to terninger) */
export const NUMBER_PROB: Record<number, number> = {
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36,
};

export const PROD_RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type ProdResource = (typeof PROD_RESOURCES)[number];

export interface ProductionProfile {
  byResource: Partial<Record<ProdResource, number>>;
  byNumber: Partial<Record<number, number>>;
  rawByResource: Partial<Record<ProdResource, number>>;
  rawByNumber: Partial<Record<number, number>>;
  /** Ressurs+tall per hex for koordineringsbonus */
  rawByResourceNumber: Partial<Record<ProdResource, Partial<Record<number, number>>>>;
  total: number;
  pipTotal: number;
  producingHexCount: number;
  desertNeighbors: number;
  hasRedNumber: boolean;
  /** Pip kun fra 6/8 (røde tall) — settlersboard anker-metrikk */
  redPipTotal: number;
  resources: Set<ProdResource>;
  breakdown: { resource: ResourceType; value: number }[];
}

export interface BoardEconomics {
  hexCountByResource: Record<ProdResource, number>;
  /** Forventet terningstreff per ressurs på hele brettet (sum av sannsynligheter) */
  supplyByResource: Record<ProdResource, number>;
  /** Vektet sum av pip fra gode hjørner som berører ressursen */
  placementOpportunityByResource: Record<ProdResource, number>;
  /** Valgt strategiprofil (ujustert for knapphet) */
  strategyWeights: ResourceWeights;
  /** Dempet knapphetsfaktor per ressurs (1 = nøytral) */
  scarcityMultiplier: ResourceWeights;
  /** Strategivekter × dempet knapphet – brukes kun for produksjonspoeng */
  dynamicWeights: ResourceWeights;
}

export interface PlacementComponents {
  production: number;
  /** Soft coverage tie-breaker (not a primary driver). */
  diversity: number;
  /** Harbor on the spot itself. */
  harbor: number;
  /** Future growth: open dist-2 spots + harbors two roads away. */
  expansion: number;
  /** Soft penalty for pip on 6/8 (robber magnets). */
  robberExposure: number;
  /** @deprecated Always 0 — pip already in production */
  pipBonus: number;
  /** @deprecated Always 0 — robber is the only 6/8 corrective */
  redAnchorBonus: number;
  /** @deprecated Always 0 — desert already yields zero production */
  desertPenalty: number;
  lowHexPenalty: number;
  monoResourcePenalty: number;
  /** Recipe packages only (subset of portfolio / buildability) */
  buildingSynergy: number;
  /** @deprecated Always 0 — pair pip already in production */
  pairPipBonus: number;
  /** @deprecated Always 0 — covered by building recipes */
  complementScore: number;
  /** Same-number wood+brick timing (subset of portfolio / buildability) */
  coordination: number;
  /** Single buildability channel: buildingSynergy + coordination (pair only) */
  portfolio: number;
  overlap: number;
}

/**
 * PSM shape (deduped — no overlapping rewards for the same signal):
 *   primary     = production (P(number) × strategy/scarcity weights) — sole pip channel
 *   buildability = building recipes + same-number wood/brick timing (pair only, one channel)
 *   correctives  = diversity, harbor, expansion − lowHex/mono/robber
 *
 * Intentionally NOT scored (already in production / lowHex / robber):
 *   pip quality, red-anchor, pair-pip, flat desert penalty, gap-fill, complement pairs
 */
const MONO_RESOURCE_PENALTY = 0.12;
const MONO_SINGLE_HEX_EXTRA = 0.06;
/**
 * 1–2 produktive hex er nesten alltid svake åpningsplasseringer.
 * Elite 2-hex (høy pip + ≥2 ressurser) får redusert straff — aldri fritak.
 * Ørken håndteres via tapt produksjon + lowHex (ingen separat desertPenalty).
 */
const LOW_HEX_ELITE_PIP = 10 / 36;
const LOW_HEX_PENALTY_1 = 0.22;
const LOW_HEX_PENALTY_2 = 0.14;
const LOW_HEX_PENALTY_2_ELITE = 0.07;
/** Pair coverage — soft tie-breaker */
const PAIR_DIVERSITY_SCALE = 0.1;
const ROAD_SYNERGY_SCALE = 0.35;
const CITY_SYNERGY_SCALE = 0.3;
const SETTLEMENT_SYNERGY_SCALE = 0.25;
const DEV_SYNERGY_SCALE = 0.2;
/** Unique timing signal: wood+brick on the same number (not covered by recipe mins alone) */
const COORDINATION_SCALE = 0.15;
const RESOURCE_OVERLAP_SCALE = 0.35;
const NUMBER_OVERLAP_SCALE = 0.2;
const HARBOR_MAX_SHARE = 0.03;
const HARBOR_RATE_GENERIC = 0.024;
const HARBOR_RATE_RESOURCE_MATCH = 0.04;
const HARBOR_RATE_RESOURCE_OTHER = 0.028;
/** Ekstra rate når 2:1 matcher par-produksjon (ikke bare dette hjørnet) */
const HARBOR_PAIR_MATCH_EXTRA = 0.008;
const GENERIC_HARBOR_DIVERSITY_BONUS = 0.015;
/** Soft robber tax on raw pip sitting on 6/8 (plan fase 2). */
export const ROBBER_EXPOSURE_SCALE = 0.18;
/** Expansion / port-reach correctives (computed in settlements.ts). */
export const EXPANSION_ROOM_SCALE = 0.04;
export const PORT_REACH_GENERIC = 0.015;
export const PORT_REACH_MATCH = 0.025;
export const PORT_REACH_OTHER = 0.01;
export const EXPANSION_CAP = 0.06;

/**
 * Hvor mye brettets knapphet justerer ressursvekter (0 = kun strategi, 1 = full ratio).
 * Lav verdi holder strategiprofilen som hovedstyringsparameter.
 */
const SCARCITY_INFLUENCE = 0.28;
/** Grenser for rå tilgjengelighetsratio før demping */
const SCARCITY_RATIO_MIN = 0.8;
const SCARCITY_RATIO_MAX = 1.28;

/** Minst ett tall ≥ 4 på ressurs-hex ved hjørnet for å telle som god plassering */
const GOOD_PLACEMENT_PIP = NUMBER_PROB[4]!;

function vertexKey(hexes: HexCoord[]): string {
  return hexes.map(coordKey).sort().join('|');
}

function buildTileMap(board: Board): Map<string, HexTile> {
  const map = new Map<string, HexTile>();
  for (const tile of board.hexes) {
    map.set(coordKey(tile.coord), tile);
  }
  return map;
}

function computePlacementOpportunityByResource(
  board: Board,
  tileByCoord: Map<string, HexTile>
): Record<ProdResource, number> {
  const boardSet = new Set(board.hexes.map((h) => coordKey(h.coord)));
  const placementOpportunity = emptyResourceRecord();
  const seenVertices = new Set<string>();

  for (const tile of board.hexes) {
    if (tile.kind !== 'land') continue;
    const coord = tile.coord;

    for (let corner = 0; corner < 6; corner++) {
      const participants: HexCoord[] = [coord];
      const n1 = hexNeighbor(coord, (corner + 5) % 6);
      const n2 = hexNeighbor(coord, corner);
      if (boardSet.has(coordKey(n1))) participants.push(n1);
      if (boardSet.has(coordKey(n2))) participants.push(n2);

      const key = vertexKey(participants);
      if (seenVertices.has(key)) continue;
      seenVertices.add(key);

      const pipByResource = emptyResourceRecord();
      for (const hexCoord of participants) {
        const hex = tileByCoord.get(coordKey(hexCoord));
        if (!hex || hex.kind !== 'land' || !hex.resource || hex.resource === 'desert' || hex.number == null) {
          continue;
        }
        pipByResource[hex.resource] += NUMBER_PROB[hex.number] ?? 0;
      }

      for (const resource of PROD_RESOURCES) {
        const pip = pipByResource[resource];
        if (pip >= GOOD_PLACEMENT_PIP) {
          placementOpportunity[resource] += pip;
        }
      }
    }
  }

  return placementOpportunity;
}

function emptyResourceRecord(): Record<ProdResource, number> {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

function multiplyWeights(base: ResourceWeights, mult: ResourceWeights): ResourceWeights {
  return {
    wood: base.wood * mult.wood,
    brick: base.brick * mult.brick,
    sheep: base.sheep * mult.sheep,
    wheat: base.wheat * mult.wheat,
    ore: base.ore * mult.ore,
  };
}

/** Demp rå knapphetsratio slik at strategiprofil fortsatt styrer valg */
function dampScarcityFactor(rawRatio: number): number {
  const clamped = Math.min(SCARCITY_RATIO_MAX, Math.max(SCARCITY_RATIO_MIN, rawRatio));
  return 1 + (clamped - 1) * SCARCITY_INFLUENCE;
}

export function computeBoardEconomics(
  board: Board,
  baseWeights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): BoardEconomics {
  const tileByCoord = buildTileMap(board);
  const hexCountByResource = emptyResourceRecord();
  const supplyByResource = emptyResourceRecord();

  for (const tile of board.hexes) {
    if (tile.kind !== 'land' || !tile.resource || tile.resource === 'desert') continue;
    hexCountByResource[tile.resource]++;
    if (tile.number != null) {
      supplyByResource[tile.resource] += NUMBER_PROB[tile.number] ?? 0;
    }
  }

  const placementOpportunityByResource = computePlacementOpportunityByResource(board, tileByCoord);

  const availabilityByResource = emptyResourceRecord();
  for (const resource of PROD_RESOURCES) {
    const supply = supplyByResource[resource];
    const opportunity = placementOpportunityByResource[resource];
    availabilityByResource[resource] = supply > 0 && opportunity > 0 ? supply * opportunity : 0;
  }

  const availabilities = Object.values(availabilityByResource).filter((a) => a > 0);
  const avgAvailability =
    availabilities.length > 0 ? availabilities.reduce((a, b) => a + b, 0) / availabilities.length : 1;

  const scarcityMultiplier = emptyResourceRecord();
  for (const resource of PROD_RESOURCES) {
    const availability = availabilityByResource[resource];
    const rawRatio = availability > 0 ? avgAvailability / availability : 1;
    scarcityMultiplier[resource] = dampScarcityFactor(rawRatio);
  }

  const dynamicWeights = multiplyWeights(baseWeights, scarcityMultiplier);
  return {
    hexCountByResource,
    supplyByResource,
    placementOpportunityByResource,
    strategyWeights: baseWeights,
    scarcityMultiplier,
    dynamicWeights,
  };
}

function capHarborBonus(harbor: number, production: number): number {
  if (harbor <= 0) return 0;
  const cap = Math.max(production * HARBOR_MAX_SHARE, 0.002);
  return Math.min(harbor, cap);
}

function harborRate(
  harbor: HarborType,
  profile: ProductionProfile,
  pairRawByResource?: Partial<Record<ProdResource, number>>
): number {
  if (harbor.kind === 'generic') return HARBOR_RATE_GENERIC;
  const localProduces =
    profile.resources.has(harbor.resource) &&
    (profile.rawByResource[harbor.resource] ?? 0) > 0;
  if (localProduces) return HARBOR_RATE_RESOURCE_MATCH;
  const pairProduces = (pairRawByResource?.[harbor.resource] ?? 0) > 0;
  if (pairProduces) return HARBOR_RATE_RESOURCE_MATCH + HARBOR_PAIR_MATCH_EXTRA;
  return HARBOR_RATE_RESOURCE_OTHER;
}

export function harborBonusForProfile(
  profile: ProductionProfile,
  harbors: { definition: { harbor: HarborType } }[],
  combinedResourceCount?: number,
  pairRawByResource?: Partial<Record<ProdResource, number>>
): number {
  if (harbors.length === 0) return 0;

  let best = 0;
  for (const placed of harbors) {
    const harbor = placed.definition.harbor;
    let rate = harborRate(harbor, profile, pairRawByResource);
    if (
      harbor.kind === 'generic' &&
      combinedResourceCount !== undefined &&
      combinedResourceCount <= 3
    ) {
      rate += GENERIC_HARBOR_DIVERSITY_BONUS;
    }
    best = Math.max(best, capHarborBonus(profile.total * rate, profile.total));
  }
  return best;
}

/** @deprecated Always 0 — pip already in production */
function pipQualityBonus(_pipTotal: number): number {
  return 0;
}

/** @deprecated Always 0 — 6/8 already in production; robber is the only red corrective */
function redAnchorBonus(_profile: ProductionProfile): number {
  return 0;
}

/** Soft expected loss when the robber parks on your 6/8 hexes. */
export function robberExposure(profile: ProductionProfile): number {
  const redPip =
    profile.redPipTotal > 0
      ? profile.redPipTotal
      : (profile.rawByNumber[6] ?? 0) + (profile.rawByNumber[8] ?? 0);
  return redPip * ROBBER_EXPOSURE_SCALE;
}

function monoResourcePenalty(profile: ProductionProfile): number {
  if (profile.resources.size !== 1) return 0;
  let penalty = MONO_RESOURCE_PENALTY;
  if (profile.producingHexCount === 1) penalty += MONO_SINGLE_HEX_EXTRA;
  return penalty;
}

/** @deprecated Always 0 — desert already yields zero production; lowHex covers hex count */
function desertPenalty(_profile: ProductionProfile): number {
  return 0;
}

/**
 * Straff for færre enn 3 produktive hex.
 * Elite 2-hex (pip ≥ 10/36 og ≥2 ressurser) får redusert straff — aldri fritak.
 */
export function lowHexPenalty(profile: ProductionProfile): number {
  const n = profile.producingHexCount;
  if (n >= 3) return 0;
  if (n <= 1) return LOW_HEX_PENALTY_1;
  // n === 2
  if (profile.resources.size >= 2 && profile.pipTotal >= LOW_HEX_ELITE_PIP) {
    return LOW_HEX_PENALTY_2_ELITE;
  }
  return LOW_HEX_PENALTY_2;
}

function pairRaw(profile: ProductionProfile, resource: ProdResource): number {
  return profile.rawByResource[resource] ?? 0;
}

function combinedRaw(a: ProductionProfile, b: ProductionProfile, resource: ProdResource): number {
  return pairRaw(a, resource) + pairRaw(b, resource);
}

function buildingSynergy(
  first: ProductionProfile,
  second: ProductionProfile,
  weights: ResourceWeights
): number {
  const wood = combinedRaw(first, second, 'wood');
  const brick = combinedRaw(first, second, 'brick');
  const wheat = combinedRaw(first, second, 'wheat');
  const sheep = combinedRaw(first, second, 'sheep');
  const ore = combinedRaw(first, second, 'ore');

  const road = Math.min(wood, brick) * ((weights.wood + weights.brick) / 2) * ROAD_SYNERGY_SCALE;
  const city = Math.min(ore, wheat * (2 / 3)) * ((weights.ore + weights.wheat) / 2) * CITY_SYNERGY_SCALE;
  const settlement =
    Math.min(wood, brick, wheat, sheep) *
    ((weights.wood + weights.brick + weights.wheat + weights.sheep) / 4) *
    SETTLEMENT_SYNERGY_SCALE;
  const dev =
    Math.min(ore, sheep, wheat) *
    ((weights.ore + weights.sheep + weights.wheat) / 3) *
    DEV_SYNERGY_SCALE;

  return road + city + settlement + dev;
}

/** Timing-only: wood and brick produced on the same number (not just both present). */
function woodBrickCoordination(first: ProductionProfile, second: ProductionProfile): number {
  let bonus = 0;
  for (const number of Object.keys(NUMBER_PROB).map(Number)) {
    const wood =
      (first.rawByResourceNumber.wood?.[number] ?? 0) +
      (second.rawByResourceNumber.wood?.[number] ?? 0);
    const brick =
      (first.rawByResourceNumber.brick?.[number] ?? 0) +
      (second.rawByResourceNumber.brick?.[number] ?? 0);
    if (wood > 0 && brick > 0) {
      bonus += Math.min(wood, brick) * COORDINATION_SCALE;
    }
  }
  return bonus;
}

/**
 * Single pair buildability channel: recipe packages + same-number road timing.
 * No gap-fill / complement — those double-count wood↔brick and ore↔wheat already in recipes.
 */
function computeBuildability(
  first: ProductionProfile,
  second: ProductionProfile,
  weights: ResourceWeights
): { buildability: number; building: number; coordination: number } {
  const building = buildingSynergy(first, second, weights);
  const coordination = woodBrickCoordination(first, second);
  return { buildability: building + coordination, building, coordination };
}

function resourceNumberOverlap(
  first: ProductionProfile,
  second: ProductionProfile,
  weights: ResourceWeights
): number {
  let resourceOverlap = 0;
  for (const resource of PROD_RESOURCES) {
    const v1 = pairRaw(first, resource);
    const v2 = pairRaw(second, resource);
    if (v1 > 0 && v2 > 0) {
      resourceOverlap += Math.min(v1, v2) * weights[resource] * RESOURCE_OVERLAP_SCALE;
    }
  }

  let numberOverlap = 0;
  for (const number of Object.keys(NUMBER_PROB).map(Number)) {
    const v1 = first.rawByNumber[number] ?? 0;
    const v2 = second.rawByNumber[number] ?? 0;
    if (v1 > 0 && v2 > 0) {
      numberOverlap += Math.min(v1, v2) * NUMBER_OVERLAP_SCALE;
    }
  }

  return resourceOverlap + numberOverlap;
}

export interface PlacementContext {
  /** Precomputed expansion / port-reach bonus for the spot(s). */
  expansion?: number;
}

/** @deprecated Always 0 — pair pip already in combined production */
function pairPipBonus(_first: ProductionProfile, _second: ProductionProfile): number {
  return 0;
}

export function scoreFirstPlacement(
  profile: ProductionProfile,
  weights: ResourceWeights,
  harbor: number,
  context: PlacementContext = {}
): { total: number; components: PlacementComponents } {
  const diversity = coverageBonus(profile.resources, weights);
  const expansion = context.expansion ?? 0;
  const pipBonus = pipQualityBonus(profile.pipTotal);
  const redAnchor = redAnchorBonus(profile);
  const desertPen = desertPenalty(profile);
  const robber = robberExposure(profile);
  const lowHexPen = lowHexPenalty(profile);
  const monoPen = monoResourcePenalty(profile);

  const components: PlacementComponents = {
    production: profile.total,
    diversity,
    harbor,
    expansion,
    robberExposure: robber,
    pipBonus,
    redAnchorBonus: redAnchor,
    desertPenalty: desertPen,
    lowHexPenalty: lowHexPen,
    monoResourcePenalty: monoPen,
    buildingSynergy: 0,
    pairPipBonus: 0,
    complementScore: 0,
    coordination: 0,
    portfolio: 0,
    overlap: 0,
  };

  // Sole pip channel = production; robber is the only 6/8 corrective
  const total =
    profile.total +
    diversity +
    harbor +
    expansion -
    lowHexPen -
    monoPen -
    robber;

  return { total, components };
}

export function scorePairPlacement(
  first: ProductionProfile,
  second: ProductionProfile,
  weights: ResourceWeights,
  harbor: number,
  context: PlacementContext = {}
): { total: number; components: PlacementComponents } {
  const { buildability, building, coordination } = computeBuildability(first, second, weights);
  const overlap = resourceNumberOverlap(first, second, weights);
  const combinedResources = new Set([...first.resources, ...second.resources]);
  const diversity = coverageBonus(combinedResources, weights, PAIR_DIVERSITY_SCALE);
  const pairPip = pairPipBonus(first, second);
  const expansion = context.expansion ?? 0;
  const robber = robberExposure(first) + robberExposure(second);
  const desertPen = desertPenalty(first) + desertPenalty(second);
  const lowHexPen = lowHexPenalty(first) + lowHexPenalty(second);
  const monoPen = monoResourcePenalty(first) + monoResourcePenalty(second);
  const pairProduction = first.total + second.total;

  const components: PlacementComponents = {
    production: pairProduction,
    diversity,
    harbor,
    expansion,
    robberExposure: robber,
    pipBonus: 0,
    redAnchorBonus: 0,
    desertPenalty: desertPen,
    lowHexPenalty: lowHexPen,
    monoResourcePenalty: monoPen,
    buildingSynergy: building,
    pairPipBonus: pairPip,
    complementScore: 0,
    coordination,
    /** Single buildability channel (packages + timing) — enters total once */
    portfolio: buildability,
    overlap,
  };

  const total =
    pairProduction +
    diversity +
    buildability +
    harbor +
    expansion -
    overlap -
    lowHexPen -
    monoPen -
    robber;

  return { total, components };
}
