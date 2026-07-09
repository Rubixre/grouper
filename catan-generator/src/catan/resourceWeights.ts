import type { ResourceWeights } from './types';

/**
 * Ressursvekter basert på Board Game Analysis:
 * https://www.boardgameanalysis.com/what-is-the-strategic-value-of-each-catan-resources/
 *
 * Normaliserte verdier fra gjennomsnittlig ressursbehov for ulike seiersstrategier.
 */
export type StrategyProfile = 'general' | 'longestRoad' | 'largestArmy';

export interface StrategyProfileInfo {
  label: string;
  description: string;
  weights: ResourceWeights;
}

/** Topp 50 raskeste realistiske seire – anbefalt generell baseline */
export const WEIGHTS_GENERAL: ResourceWeights = {
  wheat: 1.35,
  ore: 1.33,
  wood: 0.78,
  brick: 0.78,
  sheep: 0.76,
};

/** Seire med lengste vei – høyere tre/tegl relativt */
export const WEIGHTS_LONGEST_ROAD: ResourceWeights = {
  wheat: 1.18,
  ore: 1.05,
  wood: 0.92,
  brick: 0.92,
  sheep: 0.72,
};

/** Seire med største hær – høyere hvete/malm/ull relativt */
export const WEIGHTS_LARGEST_ARMY: ResourceWeights = {
  wheat: 1.45,
  ore: 1.42,
  wood: 0.65,
  brick: 0.65,
  sheep: 0.88,
};

export const STRATEGY_PROFILES: Record<StrategyProfile, StrategyProfileInfo> = {
  general: {
    label: 'Generell',
    description: 'Topp 50 raskeste seire (Board Game Analysis)',
    weights: WEIGHTS_GENERAL,
  },
  longestRoad: {
    label: 'Lengste vei',
    description: 'Høyere vekt på tre og tegl',
    weights: WEIGHTS_LONGEST_ROAD,
  },
  largestArmy: {
    label: 'Største hær',
    description: 'Høyere vekt på hvete, malm og ull',
    weights: WEIGHTS_LARGEST_ARMY,
  },
};

export function getWeightsForProfile(profile: StrategyProfile): ResourceWeights {
  return STRATEGY_PROFILES[profile].weights;
}

const PROD_RESOURCES: (keyof ResourceWeights)[] = [
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
];

/** Sum of all resource weights (for coverage ratio denominator). */
export function totalResourceWeightSum(weights: ResourceWeights): number {
  return PROD_RESOURCES.reduce((sum, r) => sum + weights[r], 0);
}

/**
 * Bonus for dekningsgrad: vektet andel av ressurstyper spilleren har tilgang til.
 * Belønner tilgang til høyt-verdige ressurser, ikke bare antall typer.
 */
export function coverageBonus(
  coveredResources: Set<string>,
  weights: ResourceWeights,
  scale = 0.3
): number {
  const total = totalResourceWeightSum(weights);
  if (total <= 0) return 0;

  let covered = 0;
  for (const resource of PROD_RESOURCES) {
    if (coveredResources.has(resource)) {
      covered += weights[resource];
    }
  }
  return (covered / total) * scale;
}
