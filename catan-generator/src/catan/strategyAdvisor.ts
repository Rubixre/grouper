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
  pickOpponentVertex,
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

/**
 * Simuler motspillere til det er din andre landsby-tur.
 * Bruker samme PSM som live: myopisk #1, par-score på #2.
 */
export function simulateToHumanSecondTurn(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  humanFirstVertex: string,
  weights?: ResourceWeights
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

    const pickVertexId = pickOpponentVertex(board, simulated, player, weights);
    if (!pickVertexId) return null;

    simulated = [...simulated, { vertexId: pickVertexId, player, isCity: false }];
    step += 1;
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
    firstVertexId,
    weights
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
 * Rangér første-landsbyer etter forventet parscore:
 * toppskårere lokalt → simuler greedy-motspillere → beste landsby #2.
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

  const withLookahead = candidates.map((spot) => {
    const path = evaluateFirstSettlementPath(
      board,
      placed,
      player,
      playerCount,
      spot.vertexId,
      weights
    );
    if (!path) {
      return {
        ...spot,
        immediateScore: spot.total,
        expectedPairScore: spot.total,
      };
    }
    return {
      ...spot,
      immediateScore: spot.total,
      expectedPairScore: path.pairScore,
      expectedSecondVertexId: path.bestSecondVertexId,
      // Rangér og vis hovedsakelig på forventet par
      total: path.pairScore,
    };
  });

  withLookahead.sort((a, b) => {
    const pairDiff = (b.expectedPairScore ?? b.total) - (a.expectedPairScore ?? a.total);
    if (Math.abs(pairDiff) > 1e-9) return pairDiff;
    return (b.immediateScore ?? 0) - (a.immediateScore ?? 0);
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
