import type { ResourceWeights } from './types';

/**
 * Fire realistiske seiersveier (Board Game Analysis):
 * https://www.boardgameanalysis.com/what-is-the-strategic-value-of-each-catan-resources/
 */
export type VictoryProfile =
  | 'both'
  | 'largestArmyOnly'
  | 'longestRoadOnly'
  | 'neither';

/** auto = analyser brett og motstandere; general = gjennomsnitt ved usikkerhet */
export type StrategyMode = 'auto' | 'general' | VictoryProfile;

export interface StrategyProfileInfo {
  label: string;
  description: string;
  weights: ResourceWeights;
}

export const VICTORY_PROFILES: VictoryProfile[] = [
  'both',
  'largestArmyOnly',
  'longestRoadOnly',
  'neither',
];

/** Største hær + lengste vei */
export const WEIGHTS_BOTH: ResourceWeights = {
  wheat: 1.25,
  ore: 1.2,
  wood: 0.85,
  brick: 0.85,
  sheep: 0.8,
};

/** Største hær, ikke lengste vei */
export const WEIGHTS_LARGEST_ARMY_ONLY: ResourceWeights = {
  wheat: 1.45,
  ore: 1.42,
  wood: 0.65,
  brick: 0.65,
  sheep: 0.88,
};

/** Lengste vei, ikke største hær */
export const WEIGHTS_LONGEST_ROAD_ONLY: ResourceWeights = {
  wheat: 1.18,
  ore: 1.05,
  wood: 0.92,
  brick: 0.92,
  sheep: 0.72,
};

/** Uten lengste vei og uten største hær (byer/landsbyer/VP-kort) */
export const WEIGHTS_NEITHER: ResourceWeights = {
  wheat: 1.3,
  ore: 1.28,
  wood: 0.7,
  brick: 0.7,
  sheep: 0.65,
};

const PROFILE_WEIGHT_MAP: Record<VictoryProfile, ResourceWeights> = {
  both: WEIGHTS_BOTH,
  largestArmyOnly: WEIGHTS_LARGEST_ARMY_ONLY,
  longestRoadOnly: WEIGHTS_LONGEST_ROAD_ONLY,
  neither: WEIGHTS_NEITHER,
};

function averageWeights(weightsList: ResourceWeights[]): ResourceWeights {
  const keys: (keyof ResourceWeights)[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const result = {} as ResourceWeights;
  for (const key of keys) {
    result[key] =
      weightsList.reduce((sum, w) => sum + w[key], 0) / weightsList.length;
  }
  return result;
}

/** Gjennomsnitt av alle fire seiersprofiler – fallback ved høy usikkerhet */
export const WEIGHTS_GENERAL: ResourceWeights = averageWeights([
  WEIGHTS_BOTH,
  WEIGHTS_LARGEST_ARMY_ONLY,
  WEIGHTS_LONGEST_ROAD_ONLY,
  WEIGHTS_NEITHER,
]);

export const STRATEGY_PROFILES: Record<StrategyMode, StrategyProfileInfo> = {
  auto: {
    label: 'Auto',
    description: 'Analyserer brett, motstandere og tilgjengelige plasseringer',
    weights: WEIGHTS_GENERAL,
  },
  general: {
    label: 'Standard (gjennomsnitt)',
    description: 'Gjennomsnittlig vekting av alle fire seiersveier',
    weights: WEIGHTS_GENERAL,
  },
  both: {
    label: 'Begge bonuser',
    description: 'Største hær og lengste vei',
    weights: WEIGHTS_BOTH,
  },
  largestArmyOnly: {
    label: 'Største hær',
    description: 'Største hær uten lengste vei',
    weights: WEIGHTS_LARGEST_ARMY_ONLY,
  },
  longestRoadOnly: {
    label: 'Lengste vei',
    description: 'Lengste vei uten største hær',
    weights: WEIGHTS_LONGEST_ROAD_ONLY,
  },
  neither: {
    label: 'Uten bonuser',
    description: 'Verken lengste vei eller største hær',
    weights: WEIGHTS_NEITHER,
  },
};

export function getWeightsForProfile(mode: StrategyMode): ResourceWeights {
  return STRATEGY_PROFILES[mode].weights;
}

export function getWeightsForVictoryProfile(profile: VictoryProfile): ResourceWeights {
  return PROFILE_WEIGHT_MAP[profile];
}

export function blendWeightsByScores(
  scores: Record<VictoryProfile, number>
): ResourceWeights {
  const total = VICTORY_PROFILES.reduce((sum, p) => sum + Math.max(0, scores[p]), 0);
  if (total <= 0) return WEIGHTS_GENERAL;

  const keys: (keyof ResourceWeights)[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const result = {} as ResourceWeights;
  for (const key of keys) {
    result[key] = VICTORY_PROFILES.reduce(
      (sum, profile) => sum + Math.max(0, scores[profile]) * PROFILE_WEIGHT_MAP[profile][key],
      0
    ) / total;
  }
  return result;
}

const PROD_RESOURCES: (keyof ResourceWeights)[] = [
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
];

export function totalResourceWeightSum(weights: ResourceWeights): number {
  return PROD_RESOURCES.reduce((sum, r) => sum + weights[r], 0);
}

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
