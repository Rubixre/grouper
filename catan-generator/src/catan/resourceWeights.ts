import type { ResourceWeights } from './types';

/**
 * Ressursvekter basert på Board Game Analysis:
 * https://www.boardgameanalysis.com/what-is-the-strategic-value-of-each-catan-resources/
 *
 * Fire profiler brukes kun internt for å beregne gjennomsnittsvektene.
 */
export const WEIGHTS_BOTH: ResourceWeights = {
  wheat: 1.25,
  ore: 1.2,
  wood: 0.85,
  brick: 0.85,
  sheep: 0.8,
};

export const WEIGHTS_LARGEST_ARMY_ONLY: ResourceWeights = {
  wheat: 1.45,
  ore: 1.42,
  wood: 0.65,
  brick: 0.65,
  sheep: 0.88,
};

export const WEIGHTS_LONGEST_ROAD_ONLY: ResourceWeights = {
  wheat: 1.18,
  ore: 1.05,
  wood: 0.92,
  brick: 0.92,
  sheep: 0.72,
};

export const WEIGHTS_NEITHER: ResourceWeights = {
  wheat: 1.3,
  ore: 1.28,
  wood: 0.7,
  brick: 0.7,
  sheep: 0.65,
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

/** Gjennomsnitt av fire seiersprofiler – brukes overalt i plasseringsvurdering */
export const WEIGHTS_GENERAL: ResourceWeights = averageWeights([
  WEIGHTS_BOTH,
  WEIGHTS_LARGEST_ARMY_ONLY,
  WEIGHTS_LONGEST_ROAD_ONLY,
  WEIGHTS_NEITHER,
]);

/**
 * Bland strategiske vekter mot like vekter (1.0 på alle).
 * `towardEqual` = 0 beholder `weights`, 1 = helt like.
 */
export function blendTowardEqualWeights(
  weights: ResourceWeights,
  towardEqual: number
): ResourceWeights {
  const t = Math.min(1, Math.max(0, towardEqual));
  const keys: (keyof ResourceWeights)[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const result = {} as ResourceWeights;
  for (const key of keys) {
    result[key] = weights[key] * (1 - t) + 1 * t;
  }
  return result;
}

/**
 * Motspillere rundt bordet vektlegger ressursene mer likt enn «Balansert»
 * for deg — mindre wheat/ore-bias, mer jevn produksjonsvurdering.
 */
export const OPPONENT_RESOURCE_WEIGHTS: ResourceWeights = blendTowardEqualWeights(
  WEIGHTS_GENERAL,
  0.8
);

export type StrategyProfileId =
  | 'general'
  | 'longestRoad'
  | 'largestArmy'
  | 'both'
  | 'neither';

export interface StrategyProfile {
  id: StrategyProfileId;
  label: string;
  description: string;
  weights: ResourceWeights;
}

/** Valgbare strategiprofiler for plasseringsmodellen (PSM) */
export const STRATEGY_PROFILES: StrategyProfile[] = [
  {
    id: 'general',
    label: 'Balansert (standard)',
    description:
      'Gjennomsnitt av fire seiersveier – god default når du ikke jager én bonus.',
    weights: WEIGHTS_GENERAL,
  },
  {
    id: 'longestRoad',
    label: 'Lengste vei',
    description: 'Høyere vekt på tømmer og tegl for veibygging.',
    weights: WEIGHTS_LONGEST_ROAD_ONLY,
  },
  {
    id: 'largestArmy',
    label: 'Største hær',
    description: 'Høyere vekt på malm, korn og ull for byer og utviklingskort.',
    weights: WEIGHTS_LARGEST_ARMY_ONLY,
  },
  {
    id: 'both',
    label: 'Begge bonusene',
    description: 'Balansert mot både lengste vei og største hær.',
    weights: WEIGHTS_BOTH,
  },
  {
    id: 'neither',
    label: 'Kun seierspoeng',
    description: 'Fokus på byer – lite vekt på infrastruktur-ressurser.',
    weights: WEIGHTS_NEITHER,
  },
];

export function getStrategyWeights(profileId: StrategyProfileId): ResourceWeights {
  const profile = STRATEGY_PROFILES.find((p) => p.id === profileId);
  return profile?.weights ?? WEIGHTS_GENERAL;
}

export function getStrategyProfile(profileId: StrategyProfileId): StrategyProfile {
  return STRATEGY_PROFILES.find((p) => p.id === profileId) ?? STRATEGY_PROFILES[0];
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
