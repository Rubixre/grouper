/**
 * Måler optimismeskjevhet i lookahead: gap mellom trygg (topp-pip blokkert)
 * og optimistisk (én greedy-simulering), samt hvor ofte robust rangering
 * avviker fra ren optimistisk «beste #2».
 */
import { generateBoard } from '../src/catan/generator.ts';
import { DEFAULT_SETTINGS, DEFAULT_RESOURCE_WEIGHTS } from '../src/catan/types.ts';
import {
  evaluateFirstSettlementPath,
  opponentPlacementsUntilSecond,
  rankFirstSettlementsWithLookahead,
} from '../src/catan/strategyAdvisor.ts';
import { getValidVertices, scoreVertex } from '../src/catan/settlements.ts';
import { computeBoardEconomics } from '../src/catan/placementModel.ts';

const PLAYER_COUNT = 4;
const HUMAN = 0;
const BOARDS = 60;

let boards = 0;
let paths = 0;
let optimismGapSum = 0;
let optimismGapMax = 0;
let pathsWithOptimismGap = 0;
let harborOnlyUpside = 0;
let rankFlipsVsPureOptimistic = 0;
let recommendedDiffersFromOptimisticSecond = 0;

for (let i = 0; i < BOARDS; i++) {
  const board = generateBoard(
    { ...DEFAULT_SETTINGS, allowAdjacent6And8: true, allowAdjacentSameNumber: true },
    'base'
  );
  if (!board) continue;
  boards += 1;

  const econ = computeBoardEconomics(board, DEFAULT_RESOURCE_WEIGHTS);
  const topFirst = getValidVertices([])
    .map((id) => scoreVertex(id, board, econ, []))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const robustRanked = rankFirstSettlementsWithLookahead(
    board,
    [],
    HUMAN,
    PLAYER_COUNT,
    DEFAULT_RESOURCE_WEIGHTS,
    12
  );

  const optimisticOrder = topFirst
    .map((spot) => {
      const path = evaluateFirstSettlementPath(
        board,
        [],
        HUMAN,
        PLAYER_COUNT,
        spot.vertexId,
        DEFAULT_RESOURCE_WEIGHTS
      );
      return {
        id: spot.vertexId,
        optimistic: path?.optimisticPairScore ?? spot.total,
        robust: path?.pairScore ?? spot.total,
      };
    })
    .sort((a, b) => b.optimistic - a.optimistic);

  if (
    robustRanked[0] &&
    optimisticOrder[0] &&
    robustRanked[0].vertexId !== optimisticOrder[0].id
  ) {
    rankFlipsVsPureOptimistic += 1;
  }

  for (const spot of topFirst) {
    const path = evaluateFirstSettlementPath(
      board,
      [],
      HUMAN,
      PLAYER_COUNT,
      spot.vertexId,
      DEFAULT_RESOURCE_WEIGHTS
    );
    if (!path) continue;
    paths += 1;

    const gap = (path.optimisticPairScore ?? path.pairScore) - (path.safePairScore ?? path.pairScore);
    if (gap > 0.02) {
      pathsWithOptimismGap += 1;
      optimismGapSum += gap;
      optimismGapMax = Math.max(optimismGapMax, gap);
    }

    if (
      path.bestSecondVertexId &&
      path.optimisticPairScore != null &&
      path.safePairScore != null &&
      Math.abs(path.optimisticPairScore - path.safePairScore) > 0.02
    ) {
      // Anbefalt #2 er trygg-planen; tell når den skiller seg fra rå greedy-best
      // (vi har ikke optimistic second id eksplisitt — bruk contested-flag + gap)
      if (path.secondContested) recommendedDiffersFromOptimisticSecond += 1;
    }

    if (
      path.optimisticPairScore != null &&
      path.safePairScore != null &&
      path.optimisticPairScore > path.safePairScore + 0.02 &&
      path.pairScore < path.safePairScore + 0.05
    ) {
      harborOnlyUpside += 1;
    }
  }
}

console.log(
  JSON.stringify(
    {
      boards,
      paths,
      opponentSlots: opponentPlacementsUntilSecond(HUMAN, PLAYER_COUNT),
      pathsWithOptimismGap,
      pathsWithOptimismGapRate: paths ? pathsWithOptimismGap / paths : 0,
      meanOptimismGapWhenPresent: pathsWithOptimismGap
        ? optimismGapSum / pathsWithOptimismGap
        : 0,
      maxOptimismGap: optimismGapMax,
      boardsWhereRobustTopDiffersFromOptimistic: rankFlipsVsPureOptimistic,
      recommendedDiffersFromOptimisticSecond,
      nearSafePairDespiteOptimisticGap: harborOnlyUpside,
    },
    null,
    2
  )
);
