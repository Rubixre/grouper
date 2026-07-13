import type {
  Board,
  PlacedSettlement,
  PlayerCount,
  ResourceWeights,
  SettlementScore,
} from './types';
import {
  STRATEGY_PROFILES,
  type StrategyProfile,
  type StrategyProfileId,
} from './resourceWeights';
import {
  getValidVertices,
  pickGreedyOpponentVertex,
  scoreSecondSettlement,
  scoreVertex,
} from './settlements';
import { computeBoardEconomics } from './placementModel';
import { getPlacementOrder } from './draftOrder';

export interface FirstSettlementPath {
  firstVertexId: string;
  firstScore: number;
  bestSecondVertexId: string;
  pairScore: number;
}

export interface ProfileStrategyEvaluation {
  profile: StrategyProfile;
  bestPath: FirstSettlementPath | null;
}

export interface StrategyRecommendation {
  recommendedProfileId: StrategyProfileId;
  recommendedProfile: StrategyProfile;
  reason: string;
  evaluations: ProfileStrategyEvaluation[];
  /** Topp første-landsbyer for anbefalt profil, med forventet nr. 2 */
  suggestedPaths: FirstSettlementPath[];
}

/** Simuler motspillere (høyest pip) til det er din andre landsby-tur */
export function simulateToHumanSecondTurn(
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

    if (player === humanPlayer && humanCount === 1) {
      return simulated;
    }

    const pickVertexId = pickGreedyOpponentVertex(board, simulated, player);
    if (!pickVertexId) return null;

    simulated = [...simulated, { vertexId: pickVertexId, player, isCity: false }];
    step++;
  }

  return null;
}

export function evaluateFirstSettlementPath(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  firstVertexId: string,
  weights: ResourceWeights
): FirstSettlementPath | null {
  const simulated = simulateToHumanSecondTurn(
    board,
    placed,
    humanPlayer,
    playerCount,
    firstVertexId
  );
  if (!simulated) return null;

  const econ = computeBoardEconomics(board, weights);
  const secondOptions = getValidVertices(simulated)
    .map((id) => scoreSecondSettlement(id, firstVertexId, board, econ))
    .sort((a, b) => b.total - a.total);
  if (secondOptions.length === 0) return null;

  const bestSecond = secondOptions[0]!;
  const firstScore = scoreVertex(firstVertexId, board, econ);

  return {
    firstVertexId,
    firstScore: firstScore.total,
    bestSecondVertexId: bestSecond.vertexId,
    pairScore: bestSecond.total,
  };
}

const DEFAULT_LOOKAHEAD_CANDIDATES = 12;

/**
 * Hvor hardt usikker par-lookahead får flytte rangeringen (0–1).
 * 0 = kun lokal score, 1 = kun forventet par (gammel oppførsel).
 * Holdes lav fordi motspillernes faktiske trekk er ukjente.
 */
export const PAIR_LOOKAHEAD_WEIGHT = 0.3;

/** Skaler parscore til lokal skala og bland med vekt på lokal spot. */
export function blendLocalAndPairScore(
  immediate: number,
  pair: number,
  meanImmediate: number,
  meanPair: number
): number {
  const w = PAIR_LOOKAHEAD_WEIGHT;
  const scaledPair =
    Math.abs(meanPair) > 1e-12 ? pair * (meanImmediate / meanPair) : immediate;
  return (1 - w) * immediate + w * scaledPair;
}

/**
 * Rangér første-landsbyer med dempet lookahead:
 * toppskårere lokalt → simuler greedy-motspillere → bland lokal + forventet par.
 */
export function rankFirstSettlementsWithLookahead(
  board: Board,
  placed: PlacedSettlement[],
  player: number,
  playerCount: PlayerCount,
  weights: ResourceWeights,
  candidateCount = DEFAULT_LOOKAHEAD_CANDIDATES
): SettlementScore[] {
  const econ = computeBoardEconomics(board, weights);
  const shallow = getValidVertices(placed)
    .map((id) => scoreVertex(id, board, econ))
    .sort((a, b) => b.total - a.total);

  if (shallow.length === 0) return [];

  const candidates = shallow.slice(0, Math.min(candidateCount, shallow.length));
  const candidateIds = new Set(candidates.map((c) => c.vertexId));

  const evaluated = candidates.map((spot) => {
    const path = evaluateFirstSettlementPath(
      board,
      placed,
      player,
      playerCount,
      spot.vertexId,
      weights
    );
    const immediate = spot.total;
    if (!path) {
      return {
        ...spot,
        immediateScore: immediate,
        expectedPairScore: immediate,
        total: immediate,
      };
    }
    return {
      ...spot,
      immediateScore: immediate,
      expectedPairScore: path.pairScore,
      expectedSecondVertexId: path.bestSecondVertexId,
      total: immediate, // erstattes under med blend
    };
  });

  const meanImmediate =
    evaluated.reduce((sum, s) => sum + (s.immediateScore ?? s.total), 0) /
    evaluated.length;
  const meanPair =
    evaluated.reduce((sum, s) => sum + (s.expectedPairScore ?? s.total), 0) /
    evaluated.length;

  const withLookahead = evaluated.map((spot) => {
    const immediate = spot.immediateScore ?? spot.total;
    const pair = spot.expectedPairScore ?? spot.total;
    return {
      ...spot,
      total: blendLocalAndPairScore(immediate, pair, meanImmediate, meanPair),
    };
  });

  withLookahead.sort((a, b) => {
    const totalDiff = b.total - a.total;
    if (Math.abs(totalDiff) > 1e-9) return totalDiff;
    const localDiff = (b.immediateScore ?? 0) - (a.immediateScore ?? 0);
    if (Math.abs(localDiff) > 1e-9) return localDiff;
    return (b.expectedPairScore ?? 0) - (a.expectedPairScore ?? 0);
  });

  const rest = shallow
    .filter((s) => !candidateIds.has(s.vertexId))
    .map((s) => ({
      ...s,
      immediateScore: s.total,
    }));

  return [...withLookahead, ...rest];
}

export function recommendStrategy(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  lookaheadCount = 5
): StrategyRecommendation {
  const evaluations: ProfileStrategyEvaluation[] = [];

  for (const profile of STRATEGY_PROFILES) {
    const weights = profile.weights;
    const econ = computeBoardEconomics(board, weights);
    const firstOptions = getValidVertices(placed)
      .map((id) => scoreVertex(id, board, econ))
      .sort((a, b) => b.total - a.total)
      .slice(0, lookaheadCount);

    let bestPath: FirstSettlementPath | null = null;
    for (const option of firstOptions) {
      const path = evaluateFirstSettlementPath(
        board,
        placed,
        humanPlayer,
        playerCount,
        option.vertexId,
        weights
      );
      if (path && (!bestPath || path.pairScore > bestPath.pairScore)) {
        bestPath = path;
      }
    }

    evaluations.push({ profile, bestPath });
  }

  const ranked = [...evaluations].sort(
    (a, b) => (b.bestPath?.pairScore ?? 0) - (a.bestPath?.pairScore ?? 0)
  );
  const winner = ranked[0];
  const recommendedProfile = winner?.profile ?? STRATEGY_PROFILES[0];
  const winnerPath = winner?.bestPath;

  let reason = 'Ingen gyldige parplasseringer funnet – bruker balansert profil.';
  if (winnerPath) {
    reason = `${recommendedProfile.label} gir best forventet parscore (${winnerPath.pairScore.toFixed(2)}) når motspillere velger høy produksjon (pip) og du følger med landsby nr. 2 på ${describeSecondPreview(board, winnerPath, recommendedProfile.weights)}.`;
  }

  const suggestedPaths: FirstSettlementPath[] = [];
  const winnerWeights = recommendedProfile.weights;
  const winnerEcon = computeBoardEconomics(board, winnerWeights);
  const topFirst = getValidVertices(placed)
    .map((id) => scoreVertex(id, board, winnerEcon))
    .sort((a, b) => b.total - a.total)
    .slice(0, lookaheadCount);
  for (const option of topFirst) {
    const path = evaluateFirstSettlementPath(
      board,
      placed,
      humanPlayer,
      playerCount,
      option.vertexId,
      winnerWeights
    );
    if (path) suggestedPaths.push(path);
  }
  suggestedPaths.sort((a, b) => b.pairScore - a.pairScore);

  return {
    recommendedProfileId: recommendedProfile.id,
    recommendedProfile,
    reason,
    evaluations: ranked,
    suggestedPaths,
  };
}

function describeSecondPreview(
  board: Board,
  path: FirstSettlementPath,
  weights: ResourceWeights
): string {
  const score = scoreSecondSettlement(
    path.bestSecondVertexId,
    path.firstVertexId,
    board,
    computeBoardEconomics(board, weights)
  );
  const resources = new Set(score.breakdown.map((b) => b.resource));
  const labels: Record<string, string> = {
    wood: 'tømmer',
    brick: 'tegl',
    sheep: 'ull',
    wheat: 'korn',
    ore: 'malm',
  };
  const types = [...resources].map((r) => labels[r] ?? r).join(', ');
  return types ? `et hjørne med ${types}` : 'nærliggende hjørne';
}

export function getSecondSettlementPreview(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  firstVertexId: string,
  weights: ResourceWeights
): string | null {
  const path = evaluateFirstSettlementPath(
    board,
    placed,
    humanPlayer,
    playerCount,
    firstVertexId,
    weights
  );
  return path?.bestSecondVertexId ?? null;
}

export function isHumanFirstSettlementTurn(
  placed: PlacedSettlement[],
  humanPlayer: number
): boolean {
  return placed.filter((p) => p.player === humanPlayer).length === 0;
}
