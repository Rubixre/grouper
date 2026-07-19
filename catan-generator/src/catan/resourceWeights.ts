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

/** Ressursprofiler + havnmodus i samme strategivelger */
export type StrategyChoice = StrategyProfileId | 'harbor';

export interface StrategyProfile {
  id: StrategyProfileId;
  label: string;
  shortLabel: string;
  description: string;
  weights: ResourceWeights;
}

/** Valgbare strategiprofiler for plasseringsmodellen (PSM) */
export const STRATEGY_PROFILES: StrategyProfile[] = [
  {
    id: 'general',
    label: 'Balansert (standard)',
    shortLabel: 'Balansert',
    description:
      'Gjennomsnitt av fire seiersveier – god default når du ikke jager én bonus.',
    weights: WEIGHTS_GENERAL,
  },
  {
    id: 'longestRoad',
    label: 'Lengste vei',
    shortLabel: 'Lengste vei',
    description: 'Høyere vekt på tømmer og tegl for veibygging.',
    weights: WEIGHTS_LONGEST_ROAD_ONLY,
  },
  {
    id: 'largestArmy',
    label: 'Største hær',
    shortLabel: 'Største hær',
    description: 'Høyere vekt på malm, korn og ull for byer og utviklingskort.',
    weights: WEIGHTS_LARGEST_ARMY_ONLY,
  },
  {
    id: 'both',
    label: 'Begge bonusene',
    shortLabel: 'Begge',
    description: 'Balansert mot både lengste vei og største hær.',
    weights: WEIGHTS_BOTH,
  },
  {
    id: 'neither',
    label: 'Kun seierspoeng',
    shortLabel: 'Seierspoeng',
    description: 'Fokus på byer – lite vekt på infrastruktur-ressurser.',
    weights: WEIGHTS_NEITHER,
  },
];

export const HARBOR_STRATEGY_CHOICE = {
  id: 'harbor' as const,
  label: 'Havnstrategi',
  shortLabel: 'Havn',
  description:
    'Jakt 2:1/3:1-havn med sterk fokusressurs. Plasseringsforslag byttes til havnplaner.',
};

export function isStrategyProfileId(value: string): value is StrategyProfileId {
  return STRATEGY_PROFILES.some((profile) => profile.id === value);
}

export function isStrategyChoice(value: string): value is StrategyChoice {
  return value === 'harbor' || isStrategyProfileId(value);
}

/** Havnmodus bruker balanserte vekter under panseret for PSM-sammenligning */
export function resolveStrategyProfileId(choice: StrategyChoice): StrategyProfileId {
  return choice === 'harbor' ? 'general' : choice;
}

export function getStrategyWeights(profileId: StrategyProfileId): ResourceWeights {
  const profile = STRATEGY_PROFILES.find((p) => p.id === profileId);
  return profile?.weights ?? WEIGHTS_GENERAL;
}

export function getStrategyProfile(profileId: StrategyProfileId): StrategyProfile {
  return STRATEGY_PROFILES.find((p) => p.id === profileId) ?? STRATEGY_PROFILES[0]!;
}

export function strategyChoiceLabel(choice: StrategyChoice): string {
  if (choice === 'harbor') return HARBOR_STRATEGY_CHOICE.shortLabel;
  return getStrategyProfile(choice).shortLabel;
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

/**
 * Soft diversity for PSM.
 *
 * Strategy weights already steer production scoring. Raw type-count coverage
 * can therefore hurt: a weaker 3-resource corner beats a stronger 2-resource
 * spot that already covers the strategy's key goods.
 *
 * We saturate once ~the strategy's weight mass is covered, and keep the
 * absolute scale small so diversity stays a tie-breaker — not a override.
 */
/** Share of strategy weight that earns a full coverage bonus. */
const COVERAGE_SATURATION = 0.58;
/** Extra types beyond saturation still add a little (keeps full > partial). */
const COVERAGE_TAIL = 0.22;
/** Default first-settlement coverage scale (was 0.3). */
export const DEFAULT_COVERAGE_SCALE = 0.12;

function saturatedCoverageShare(share: number): number {
  if (share <= COVERAGE_SATURATION) {
    return share / COVERAGE_SATURATION;
  }
  const tailProgress = (share - COVERAGE_SATURATION) / (1 - COVERAGE_SATURATION);
  return 1 + tailProgress * COVERAGE_TAIL;
}

export function coverageBonus(
  coveredResources: Set<string>,
  weights: ResourceWeights,
  scale = DEFAULT_COVERAGE_SCALE
): number {
  const total = totalResourceWeightSum(weights);
  if (total <= 0) return 0;

  let covered = 0;
  for (const resource of PROD_RESOURCES) {
    if (coveredResources.has(resource)) {
      covered += weights[resource];
    }
  }
  const share = covered / total;
  const saturated = saturatedCoverageShare(share);
  const full = saturatedCoverageShare(1);
  return (saturated / full) * scale;
}
