import type {
  Board,
  PlacedSettlement,
  PlayerCount,
  ResourceWeights,
  SettlementScore,
} from './types';
import { DEFAULT_RESOURCE_WEIGHTS } from './types';
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
  vertexPipTotal,
} from './settlements';
import { computeBoardEconomics } from './placementModel';
import { getPlacementOrder } from './draftOrder';

export interface FirstSettlementPath {
  firstVertexId: string;
  firstScore: number;
  /** Anbefalt #2 under trygg plan (ikke blant motstandernes sannsynlige førstevalg) */
  bestSecondVertexId: string;
  /** Robust parscore (sikret #1 + sannsynlig #2-løft; spekulativ upside nedvektet) */
  pairScore: number;
  /** Beste rå parscore etter én motstandersimulering (optimistisk) */
  optimisticPairScore?: number;
  /** #2 som simulert rest ville gitt (kan være «ta sjansen») */
  optimisticSecondVertexId?: string;
  /** Beste parscore når omstridte spots er blokkert før din #2 */
  safePairScore?: number;
  /** True hvis anbefalt/optimistisk #2 er usikker mot motstandernes førstevalg */
  secondContested?: boolean;
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
 * Motstandernes trekk er usikre. Pip-only «trygg»-blokkering var for svak:
 * UI/motspillere rangerer etter PSM, så en høy PSM-spot kan overleve pip-blokk
 * og likevel være motstanderens førstevalg.
 *
 * Robust modell:
 * - TRYGG: motstanderne tar de N hotteste PSM-plassene (scoreVertex)
 * - Hard filter: anbefalt #2 skal ikke ligge i trussel-sonen for 1. landsby
 * - Simulering bruker samme PSM-motspillermodell
 * - Spekulativ havn/upside nedvektet
 */
export const PAIR_UPSIDE_CREDIT = 0.2;
export const HARBOR_UPSIDE_CREDIT = 0.08;
/**
 * Ekstra buffer utover antall motstander-førsteplasseringer:
 * lookahead kan løfte spots som ikke er absolutt topp i shallow score.
 */
export const FIRST_SETTLEMENT_THREAT_BUFFER = 2;

const DEFAULT_LOOKAHEAD_CANDIDATES = 12;
const LOOKAHEAD_PIP_CANDIDATES = 6;
export const LOOKAHEAD_IMMEDIATE_BLEND = 0.55;
export const LOOKAHEAD_PIP_GUARD = 0.02;

/** Antall motstanderplasseringer mellom din 1. og 2. landsby */
export function opponentPlacementsUntilSecond(
  humanPlayer: number,
  playerCount: PlayerCount
): number {
  const order = getPlacementOrder(playerCount);
  let seenHuman = 0;
  let between = 0;
  let counting = false;
  for (const player of order) {
    if (player === humanPlayer) {
      seenHuman += 1;
      if (seenHuman === 1) {
        counting = true;
        continue;
      }
      if (seenHuman === 2) return between;
      continue;
    }
    if (counting) between += 1;
  }
  return between;
}

/** Antall motstander-førsteplasseringer mellom din #1 og #2 */
export function opponentFirstSettlementsUntilSecond(
  humanPlayer: number,
  playerCount: PlayerCount
): number {
  const order = getPlacementOrder(playerCount);
  let seenHuman = 0;
  let firsts = 0;
  let counting = false;
  const firstDone = new Set<number>();
  for (const player of order) {
    if (player === humanPlayer) {
      seenHuman += 1;
      if (seenHuman === 1) {
        counting = true;
        continue;
      }
      if (seenHuman === 2) return firsts;
      continue;
    }
    if (counting && !firstDone.has(player)) {
      firsts += 1;
      firstDone.add(player);
    }
  }
  return firsts;
}

/**
 * PSM-rangering (umiddelbar) — samme type signal motstandere følger i UI
 * for første landsby, uten rekursiv lookahead.
 */
export function contestationRanks(
  board: Board,
  placedAfterHumanFirst: PlacedSettlement[],
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): Map<string, number> {
  const econ = computeBoardEconomics(board, weights);
  const ranked = getValidVertices(placedAfterHumanFirst)
    .map((id) => ({
      id,
      score: scoreVertex(id, board, econ, placedAfterHumanFirst).total,
      pip: vertexPipTotal(id, board),
    }))
    .sort(
      (a, b) => b.score - a.score || b.pip - a.pip || a.id.localeCompare(b.id)
    );
  const ranks = new Map<string, number>();
  ranked.forEach((entry, index) => ranks.set(entry.id, index));
  return ranks;
}

/**
 * Hjørner som er realistiske førstevalg for motstandere etter din #1.
 * Anbefalt landsby #2 skal ikke ligge her.
 */
export function firstSettlementThreatIds(
  board: Board,
  placedAfterHumanFirst: PlacedSettlement[],
  playerCount: PlayerCount,
  humanPlayer: number,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): Set<string> {
  const firsts = opponentFirstSettlementsUntilSecond(humanPlayer, playerCount);
  const threatCount = Math.min(
    getValidVertices(placedAfterHumanFirst).length,
    firsts + FIRST_SETTLEMENT_THREAT_BUFFER
  );
  const ranks = contestationRanks(board, placedAfterHumanFirst, weights);
  const threatened = new Set<string>();
  for (const [id, rank] of ranks) {
    if (rank < threatCount) threatened.add(id);
  }
  return threatened;
}

/**
 * Blokker de N mest omstridte hjørnene sekvensielt (PSM-score, pip som tiebreak).
 */
export function occupyContestedSpots(
  board: Board,
  placed: PlacedSettlement[],
  count: number,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): PlacedSettlement[] {
  const econ = computeBoardEconomics(board, weights);
  let current = [...placed];
  for (let i = 0; i < count; i++) {
    const valid = getValidVertices(current);
    if (valid.length === 0) break;
    let bestId = valid[0]!;
    let bestScore = -Infinity;
    let bestPip = -1;
    for (const id of valid) {
      const score = scoreVertex(id, board, econ, current).total;
      const pip = vertexPipTotal(id, board);
      if (
        score > bestScore + 1e-12 ||
        (Math.abs(score - bestScore) <= 1e-12 &&
          (pip > bestPip || (pip === bestPip && id < bestId)))
      ) {
        bestScore = score;
        bestPip = pip;
        bestId = id;
      }
    }
    current = [
      ...current,
      { vertexId: bestId, player: -100 - i, isCity: false },
    ];
  }
  return current;
}

/** @deprecated Bruk occupyContestedSpots — alias for bakoverkompatibilitet. */
export function occupyTopPipSpots(
  board: Board,
  placed: PlacedSettlement[],
  count: number,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): PlacedSettlement[] {
  return occupyContestedSpots(board, placed, count, weights);
}

function bestSecondOnBoard(
  board: Board,
  firstVertexId: string,
  placed: PlacedSettlement[],
  econ: ReturnType<typeof computeBoardEconomics>,
  avoid: Set<string> = new Set()
): SettlementScore | null {
  const options = getValidVertices(placed)
    .filter((id) => !avoid.has(id))
    .map((id) => scoreSecondSettlement(id, firstVertexId, board, econ, placed))
    .sort((a, b) => b.total - a.total);
  return options[0] ?? null;
}

/**
 * #1 er allerede sikret — usikkerhet gjelder bare løftet fra landsby #2.
 */
export function blendSafeAndOptimisticPairScore(
  firstSecured: number,
  safeTotal: number,
  safeHarborSecond: number,
  optimisticTotal: number,
  optimisticHarborSecond: number
): number {
  const safeSecondLift = safeTotal - firstSecured;
  const optSecondLift = optimisticTotal - firstSecured;
  const safeLiftCore = safeSecondLift - Math.max(0, safeHarborSecond);
  const optLiftCore = optSecondLift - Math.max(0, optimisticHarborSecond);
  const liftCore =
    (1 - PAIR_UPSIDE_CREDIT) * safeLiftCore +
    PAIR_UPSIDE_CREDIT * Math.max(safeLiftCore, optLiftCore);
  const harborExtra = Math.max(
    0,
    optimisticHarborSecond - Math.max(0, safeHarborSecond)
  );
  const harbor =
    Math.max(0, safeHarborSecond) + HARBOR_UPSIDE_CREDIT * harborExtra;
  return firstSecured + liftCore + harbor;
}

/** Simuler motspillere (PSM-score) til det er din andre landsby-tur */
export function simulateToHumanSecondTurn(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  humanFirstVertex: string,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
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
    firstVertexId,
    weights
  );
  if (!simulated) return null;

  const econ = computeBoardEconomics(board, weights);
  const afterFirst: PlacedSettlement[] = [
    ...placed,
    { vertexId: firstVertexId, player: humanPlayer, isCity: false },
  ];
  const opponentSlots = opponentPlacementsUntilSecond(humanPlayer, playerCount);
  const firstLocal = scoreVertex(firstVertexId, board, econ, placed);
  const harborOnFirst = firstLocal.harbor;

  const threatIds = firstSettlementThreatIds(
    board,
    afterFirst,
    playerCount,
    humanPlayer,
    weights
  );

  const optimisticSecond = bestSecondOnBoard(
    board,
    firstVertexId,
    simulated,
    econ
  );
  if (!optimisticSecond) return null;

  const safeBoard = occupyContestedSpots(
    board,
    afterFirst,
    opponentSlots,
    weights
  );
  const safeSecond =
    bestSecondOnBoard(board, firstVertexId, safeBoard, econ, threatIds) ??
    bestSecondOnBoard(board, firstVertexId, safeBoard, econ) ??
    bestSecondOnBoard(board, firstVertexId, simulated, econ, threatIds);

  const chosen = safeSecond ?? optimisticSecond;
  const chosenIsThreatened = threatIds.has(chosen.vertexId);

  const safeTotal = safeSecond?.total ?? optimisticSecond.total * 0.75;
  const pairScore = blendSafeAndOptimisticPairScore(
    firstLocal.total,
    safeTotal,
    safeSecond ? Math.max(0, safeSecond.harbor - harborOnFirst) : 0,
    optimisticSecond.total,
    Math.max(0, optimisticSecond.harbor - harborOnFirst)
  );

  const secondContested =
    chosenIsThreatened ||
    !safeSecond ||
    (optimisticSecond.vertexId !== chosen.vertexId &&
      optimisticSecond.total - safeTotal > 0.04);

  return {
    firstVertexId,
    firstScore: firstLocal.total,
    bestSecondVertexId: chosen.vertexId,
    pairScore: chosenIsThreatened ? pairScore * 0.85 : pairScore,
    optimisticPairScore: optimisticSecond.total,
    optimisticSecondVertexId: optimisticSecond.vertexId,
    safePairScore: safeTotal,
    secondContested,
  };
}

/**
 * Rangér første-landsbyer etter robust par + lokal styrke.
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
    .map((id) => scoreVertex(id, board, econ, placed))
    .sort((a, b) => b.total - a.total);

  if (shallow.length === 0) return [];

  const byPip = [...shallow].sort(
    (a, b) => vertexPipTotal(b.vertexId, board) - vertexPipTotal(a.vertexId, board)
  );

  const candidateMap = new Map<string, SettlementScore>();
  for (const spot of shallow.slice(0, Math.min(candidateCount, shallow.length))) {
    candidateMap.set(spot.vertexId, spot);
  }
  for (const spot of byPip.slice(0, Math.min(LOOKAHEAD_PIP_CANDIDATES, byPip.length))) {
    candidateMap.set(spot.vertexId, spot);
  }
  const candidates = [...candidateMap.values()];
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
    const pip = vertexPipTotal(spot.vertexId, board);
    const blended =
      path.pairScore +
      LOOKAHEAD_IMMEDIATE_BLEND * spot.total +
      LOOKAHEAD_PIP_GUARD * pip;
    return {
      ...spot,
      immediateScore: spot.total,
      expectedPairScore: path.pairScore,
      expectedSecondVertexId: path.bestSecondVertexId,
      total: blended,
    };
  });

  withLookahead.sort((a, b) => {
    const totalDiff = b.total - a.total;
    if (Math.abs(totalDiff) > 1e-9) return totalDiff;
    const pairDiff = (b.expectedPairScore ?? 0) - (a.expectedPairScore ?? 0);
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
      .map((id) => scoreVertex(id, board, econ, placed))
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
    const opt = winnerPath.optimisticPairScore;
    const safe = winnerPath.safePairScore;
    const threatNote = winnerPath.secondContested
      ? ' Unngår omstridte førstevalg hos motstandere der det er mulig.'
      : '';
    const gapNote =
      opt != null && safe != null && opt - safe > 0.05
        ? ` Trygg #2 ${safe.toFixed(2)} vs optimistisk rest ${opt.toFixed(2)} — vektlegger det sannsynlige.`
        : ' Planlegger for sannsynlig #2 (motstandere tar sterke PSM-plasser).';
    reason = `${recommendedProfile.label} gir best robust parscore (${winnerPath.pairScore.toFixed(2)}) med landsby nr. 2 på ${describeSecondPreview(board, winnerPath, recommendedProfile.weights)}.${gapNote}${threatNote}`;
  }

  const suggestedPaths: FirstSettlementPath[] = [];
  const winnerWeights = recommendedProfile.weights;
  const winnerEcon = computeBoardEconomics(board, winnerWeights);
  const topFirst = getValidVertices(placed)
    .map((id) => scoreVertex(id, board, winnerEcon, placed))
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
