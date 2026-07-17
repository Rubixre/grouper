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
  /**
   * Rangeringsscore: egen parstyrke + relativ margin mot motstanderne.
   * «Ikke bare gjøre det bra — gjøre det bedre enn dem.»
   */
  relativeScore?: number;
  /** ownPair − beste motstanderpar (etter simulering) */
  marginVsBestOpponent?: number;
  /** ownPair − snitt motstanderpar */
  marginVsMeanOpponent?: number;
  /** Merverdi av å nekte motstanderne din #1-plass */
  denialValue?: number;
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
/**
 * Vekt på relativ margin (egen − motstander) i lookahead-rangering.
 * 0 = kun absolutt egenstyrke; høyere = mer «slå dem», ikke bare «vær sterk».
 */
export const RELATIVE_ADVANTAGE_WEIGHT = 0.42;
/** Andel av relativ ledd som er vs beste motstander (resten vs snitt). */
export const RELATIVE_BEST_SHARE = 0.65;
/**
 * Vekt på denial: hvor mye bedre din #1 er enn beste spot som blir igjen til dem.
 * Høy nok til at elite-#1 fortsatt prioriteres (nekte dem pip-gull).
 */
export const DENIAL_WEIGHT = 0.35;

const DEFAULT_LOOKAHEAD_CANDIDATES = 12;
const LOOKAHEAD_PIP_CANDIDATES = 6;
export const LOOKAHEAD_IMMEDIATE_BLEND = 0.55;
export const LOOKAHEAD_PIP_GUARD = 0.028;

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
 * Estimér motstandernes parstyrke etter simulering frem til din #2-tur.
 * Fullførte par scorer direkte; de med bare #1 får beste gjenværende #2
 * (optimistisk for dem → konservativt for din relative margin).
 */
export function estimateOpponentPairScores(
  board: Board,
  simulated: PlacedSettlement[],
  humanPlayer: number,
  weights: ResourceWeights
): number[] {
  const econ = computeBoardEconomics(board, weights);
  const byPlayer = new Map<number, string[]>();
  for (const p of simulated) {
    if (p.player === humanPlayer || p.player < 0) continue;
    const list = byPlayer.get(p.player) ?? [];
    list.push(p.vertexId);
    byPlayer.set(p.player, list);
  }

  const scores: number[] = [];
  for (const [, vertices] of byPlayer) {
    if (vertices.length >= 2) {
      scores.push(
        scoreSecondSettlement(vertices[1]!, vertices[0]!, board, econ, simulated)
          .total
      );
      continue;
    }
    if (vertices.length === 1) {
      const best = bestSecondOnBoard(board, vertices[0]!, simulated, econ);
      if (best) scores.push(best.total);
      else scores.push(scoreVertex(vertices[0]!, board, econ, simulated).total);
    }
  }
  return scores;
}

/**
 * Denial: hvor mye sterkere er spoten du tok enn beste gjenværende for andre?
 * Positiv = du nekta dem en elite; ~0 = du tok noe midt på treet.
 */
export function denialValueForFirstSpot(
  board: Board,
  placedBefore: PlacedSettlement[],
  firstVertexId: string,
  firstScore: number,
  weights: ResourceWeights
): number {
  const econ = computeBoardEconomics(board, weights);
  const after: PlacedSettlement[] = [
    ...placedBefore,
    { vertexId: firstVertexId, player: -1, isCity: false },
  ];
  const remaining = getValidVertices(after)
    .map((id) => scoreVertex(id, board, econ, after).total)
    .sort((a, b) => b - a);
  const bestLeft = remaining[0] ?? 0;
  return firstScore - bestLeft;
}

/**
 * Absolutt egenstyrke + relativ margin mot motstanderne.
 * marginVsBest veier tyngst (må slå den sterkeste), snitt myker av outliers.
 */
export function applyRelativeAdvantage(
  ownPair: number,
  opponentPairs: number[],
  denialValue: number,
  relativeWeight = RELATIVE_ADVANTAGE_WEIGHT,
  denialWeight = DENIAL_WEIGHT
): {
  relativeScore: number;
  marginVsBest: number;
  marginVsMean: number;
} {
  if (opponentPairs.length === 0) {
    return {
      relativeScore: ownPair + denialWeight * Math.max(0, denialValue),
      marginVsBest: 0,
      marginVsMean: 0,
    };
  }
  const bestOpp = Math.max(...opponentPairs);
  const meanOpp =
    opponentPairs.reduce((sum, s) => sum + s, 0) / opponentPairs.length;
  const marginVsBest = ownPair - bestOpp;
  const marginVsMean = ownPair - meanOpp;
  const relativeMargin =
    RELATIVE_BEST_SHARE * marginVsBest +
    (1 - RELATIVE_BEST_SHARE) * marginVsMean;
  return {
    relativeScore:
      ownPair +
      relativeWeight * relativeMargin +
      denialWeight * Math.max(0, denialValue),
    marginVsBest,
    marginVsMean,
  };
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

  const ownPair = chosenIsThreatened ? pairScore * 0.85 : pairScore;
  const opponentPairs = estimateOpponentPairScores(
    board,
    simulated,
    humanPlayer,
    weights
  );
  const denial = denialValueForFirstSpot(
    board,
    placed,
    firstVertexId,
    firstLocal.total,
    weights
  );
  const relative = applyRelativeAdvantage(ownPair, opponentPairs, denial);

  return {
    firstVertexId,
    firstScore: firstLocal.total,
    bestSecondVertexId: chosen.vertexId,
    pairScore: ownPair,
    relativeScore: relative.relativeScore,
    marginVsBestOpponent: relative.marginVsBest,
    marginVsMeanOpponent: relative.marginVsMean,
    denialValue: denial,
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
    const relativeBase = path.relativeScore ?? path.pairScore;
    const blended =
      relativeBase +
      LOOKAHEAD_IMMEDIATE_BLEND * spot.total +
      LOOKAHEAD_PIP_GUARD * pip;
    return {
      ...spot,
      immediateScore: spot.total,
      expectedPairScore: path.pairScore,
      expectedSecondVertexId: path.bestSecondVertexId,
      relativeAdvantage: path.marginVsBestOpponent,
      denialValue: path.denialValue,
      total: blended,
    };
  });

  withLookahead.sort((a, b) => {
    const totalDiff = b.total - a.total;
    if (Math.abs(totalDiff) > 1e-9) return totalDiff;
    const relDiff =
      (b.relativeAdvantage ?? 0) - (a.relativeAdvantage ?? 0);
    if (Math.abs(relDiff) > 1e-9) return relDiff;
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
      if (path && (!bestPath || (path.relativeScore ?? path.pairScore) > (bestPath.relativeScore ?? bestPath.pairScore))) {
        bestPath = path;
      }
    }

    evaluations.push({ profile, bestPath });
  }

  const ranked = [...evaluations].sort(
    (a, b) =>
      (b.bestPath?.relativeScore ?? b.bestPath?.pairScore ?? 0) -
      (a.bestPath?.relativeScore ?? a.bestPath?.pairScore ?? 0)
  );
  const winner = ranked[0];
  const recommendedProfile = winner?.profile ?? STRATEGY_PROFILES[0];
  const winnerPath = winner?.bestPath;

  let reason = 'Ingen gyldige parplasseringer funnet – bruker balansert profil.';
  if (winnerPath) {
    const margin = winnerPath.marginVsBestOpponent;
    const marginNote =
      margin != null
        ? margin >= 0
          ? ` Relativ margin mot sterkeste motstander +${margin.toFixed(2)}.`
          : ` Relativ margin mot sterkeste motstander ${margin.toFixed(2)} (de er sterkere absolutt — vurder denial/posisjon).`
        : '';
    const denialNote =
      winnerPath.denialValue != null && winnerPath.denialValue > 0.05
        ? ` Denial av topp-spot +${winnerPath.denialValue.toFixed(2)}.`
        : '';
    reason = `${recommendedProfile.label} gir best relativ parscore (${(winnerPath.relativeScore ?? winnerPath.pairScore).toFixed(2)}) med landsby nr. 2 på ${describeSecondPreview(board, winnerPath, recommendedProfile.weights)}.${marginNote}${denialNote}`;
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
  suggestedPaths.sort(
    (a, b) =>
      (b.relativeScore ?? b.pairScore) - (a.relativeScore ?? a.pairScore)
  );

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
