import type { Board, PlacedSettlement, ResourceWeights, SettlementScore } from './types';
import type { SimulationState } from './simulator';
import { currentPlayer } from './simulator';
import {
  getValidVertices,
  rankVertices,
  scoreVertex,
} from './settlements';
import {
  type StrategyMode,
  type VictoryProfile,
  VICTORY_PROFILES,
  WEIGHTS_GENERAL,
  blendWeightsByScores,
  getWeightsForProfile,
  getWeightsForVictoryProfile,
  STRATEGY_PROFILES,
} from './resourceWeights';

export interface StrategyAnalysis {
  weights: ResourceWeights;
  profileScores: Record<VictoryProfile, number>;
  dominantProfile: VictoryProfile | 'general';
  confidence: number;
  description: string;
  usedLookahead: boolean;
  projectedSteps: number;
}

const CONFIDENCE_THRESHOLD = 0.15;
const TOP_K = 3;

/** Steg i slange-draft der focusPlayer plasserer sin andre landsby */
export function getSecondPlacementStep(
  placementOrder: number[],
  focusPlayer: number
): number {
  let count = 0;
  for (let i = 0; i < placementOrder.length; i++) {
    if (placementOrder[i] === focusPlayer) {
      count++;
      if (count === 2) return i;
    }
  }
  return placementOrder.length;
}

/** Gjett motstanderes plasseringer (grådig, standardvekter) mellom fromStep og toStep */
export function projectPlacements(
  board: Board,
  placements: PlacedSettlement[],
  placementOrder: number[],
  fromStep: number,
  toStep: number
): PlacedSettlement[] {
  const projected = [...placements];

  for (let step = fromStep; step < toStep; step++) {
    const player = placementOrder[step];
    const priorForPlayer = projected.filter((p) => p.player === player).length;
    const options = rankVertices(
      board,
      projected,
      WEIGHTS_GENERAL,
      priorForPlayer === 1 ? player : undefined
    );
    if (options.length === 0) break;
    projected.push({
      vertexId: options[0].vertexId,
      player,
      isCity: false,
    });
  }

  return projected;
}

function topKAverage(options: SettlementScore[], k: number): number {
  if (options.length === 0) return 0;
  const slice = options.slice(0, Math.min(k, options.length));
  return slice.reduce((sum, o) => sum + o.total, 0) / slice.length;
}

/** Hvor godt en seiersprofil passer brettet for focusPlayer */
export function scoreProfileViability(
  board: Board,
  placements: PlacedSettlement[],
  focusPlayer: number,
  profile: VictoryProfile
): number {
  const weights = getWeightsForVictoryProfile(profile);
  const playerSettlements = placements.filter((p) => p.player === focusPlayer).length;

  if (playerSettlements === 0) {
    return topKAverage(rankVertices(board, placements, weights), TOP_K);
  }

  if (playerSettlements === 1) {
    return topKAverage(
      rankVertices(board, placements, weights, focusPlayer),
      TOP_K
    );
  }

  return 0;
}

function computeProfileScores(
  board: Board,
  placements: PlacedSettlement[],
  focusPlayer: number
): Record<VictoryProfile, number> {
  const scores = {} as Record<VictoryProfile, number>;
  for (const profile of VICTORY_PROFILES) {
    scores[profile] = scoreProfileViability(board, placements, focusPlayer, profile);
  }
  return scores;
}

function resolveFromScores(
  profileScores: Record<VictoryProfile, number>,
  usedLookahead: boolean,
  projectedSteps: number
): StrategyAnalysis {
  const sorted = VICTORY_PROFILES.map((p) => profileScores[p]).sort((a, b) => b - a);
  const max = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  const confidence = max > 0 ? (max - second) / max : 0;

  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      weights: WEIGHTS_GENERAL,
      profileScores,
      dominantProfile: 'general',
      confidence,
      description:
        'Usikker analyse – faller tilbake på standard (gjennomsnitt av alle fire seiersveier)',
      usedLookahead,
      projectedSteps,
    };
  }

  const dominant = VICTORY_PROFILES.reduce((best, p) =>
    profileScores[p] > profileScores[best] ? p : best
  );

  return {
    weights: blendWeightsByScores(profileScores),
    profileScores,
    dominantProfile: dominant,
    confidence,
    description: `Profil: ${STRATEGY_PROFILES[dominant].label} (${Math.round(confidence * 100)} % sikkerhet)`,
    usedLookahead,
    projectedSteps,
  };
}

export function analyzeStrategy(
  board: Board,
  placements: PlacedSettlement[],
  placementOrder: number[],
  currentStep: number,
  focusPlayer: number
): StrategyAnalysis {
  const secondStep = getSecondPlacementStep(placementOrder, focusPlayer);
  let analysisPlacements = placements;
  let projectedSteps = 0;

  if (currentStep < secondStep) {
    projectedSteps = secondStep - currentStep;
    analysisPlacements = projectPlacements(
      board,
      placements,
      placementOrder,
      currentStep,
      secondStep
    );
  }

  const profileScores = computeProfileScores(
    board,
    analysisPlacements,
    focusPlayer
  );

  return resolveFromScores(profileScores, projectedSteps > 0, projectedSteps);
}

function rankFirstWithLookahead(
  state: SimulationState,
  focusPlayer: number
): { options: SettlementScore[]; analysis: StrategyAnalysis } {
  const secondStep = getSecondPlacementStep(
    state.placementOrder,
    focusPlayer
  );
  const valid = getValidVertices(state.placements);
  const profileScoreAccumulator = Object.fromEntries(
    VICTORY_PROFILES.map((p) => [p, 0])
  ) as Record<VictoryProfile, number>;
  let projectedStepsSum = 0;

  const options = valid
    .map((vertexId) => {
      const hypothetical: PlacedSettlement[] = [
        ...state.placements,
        { vertexId, player: focusPlayer, isCity: false },
      ];
      const projected = projectPlacements(
        state.board,
        hypothetical,
        state.placementOrder,
        state.currentStep + 1,
        secondStep
      );
      projectedStepsSum = secondStep - state.currentStep;

      const profileScores = computeProfileScores(
        state.board,
        projected,
        focusPlayer
      );
      for (const profile of VICTORY_PROFILES) {
        profileScoreAccumulator[profile] += profileScores[profile];
      }

      const { weights } = resolveFromScores(
        profileScores,
        true,
        projectedStepsSum
      );
      return scoreVertex(vertexId, state.board, weights);
    })
    .sort((a, b) => b.total - a.total);

  for (const profile of VICTORY_PROFILES) {
    profileScoreAccumulator[profile] /= Math.max(1, valid.length);
  }

  const analysis = resolveFromScores(
    profileScoreAccumulator,
    true,
    projectedStepsSum
  );

  return { options, analysis };
}

export interface RankedOptionsResult {
  options: SettlementScore[];
  analysis: StrategyAnalysis | null;
}

/** Rangér plasseringer med fokus på valgt spiller og strategimodus */
export function getRankedOptions(
  state: SimulationState,
  focusPlayer: number,
  mode: StrategyMode
): RankedOptionsResult {
  const player = currentPlayer(state);
  const playerSettlements = state.placements.filter(
    (p) => p.player === focusPlayer
  ).length;

  if (mode !== 'auto' || player !== focusPlayer) {
    const weights = mode === 'auto' ? WEIGHTS_GENERAL : getWeightsForProfile(mode);
    return {
      options: rankVertices(
        state.board,
        state.placements,
        weights,
        playerSettlements === 1 && player === focusPlayer ? focusPlayer : undefined
      ),
      analysis: null,
    };
  }

  if (playerSettlements === 0) {
    return rankFirstWithLookahead(state, focusPlayer);
  }

  const analysis = analyzeStrategy(
    state.board,
    state.placements,
    state.placementOrder,
    state.currentStep,
    focusPlayer
  );

  const options =
    playerSettlements === 1
      ? rankVertices(
          state.board,
          state.placements,
          analysis.weights,
          focusPlayer
        )
      : rankVertices(state.board, state.placements, analysis.weights);

  return { options, analysis };
}

export function getAnalysisSummary(analysis: StrategyAnalysis | null): string {
  if (!analysis) return '';
  const parts = [analysis.description];
  if (analysis.usedLookahead && analysis.projectedSteps > 0) {
    parts.push(
      `Projiserte ${analysis.projectedSteps} motstandertrekk før landsby nr. 2`
    );
  }
  return parts.join('. ');
}
