import type {
  Board,
  PlacedSettlement,
  PlayerCount,
  ResourceWeights,
  SettlementScore,
} from './types';
import {
  HARBOR_EVAL_WEIGHTS,
  OPPONENT_RESOURCE_WEIGHTS,
  STRATEGY_PROFILES,
  totalResourceWeightSum,
  type StrategyChoice,
  type StrategyProfile,
  type StrategyProfileId,
} from './resourceWeights';
import {
  getValidVertices,
  pickOpponentChoice,
  scoreSecondSettlement,
  scoreVertex,
} from './settlements';
import { computeBoardEconomics } from './placementModel';
import { getPlacementOrder } from './draftOrder';
import { buildRoadScoringContext, withSetupRoad } from './roadPlan';

export interface FirstSettlementPath {
  firstVertexId: string;
  firstScore: number;
  bestSecondVertexId: string;
  /** Parscore hvis den simulerte motstander-stien holder */
  pairScore: number;
  /** 0–1: forutsigbarhet i motstandertrekk mellom #1 og #2 */
  pathConfidence: number;
  /** Spot blandet med par etter pathConfidence */
  adjustedPairScore: number;
}

export interface OpponentPathSimulation {
  placements: PlacedSettlement[];
  pathConfidence: number;
}

/** Geometrisk snitt — én usikker motstander-runde trekker stien ned. */
export function aggregatePathConfidence(stepConfidences: number[]): number {
  if (stepConfidences.length === 0) return 1;
  const logSum = stepConfidences.reduce(
    (sum, c) => sum + Math.log(Math.max(c, 1e-6)),
    0
  );
  return Math.exp(logSum / stepConfidences.length);
}

/**
 * Par-tillit brukt i rangering (ikke det samme som vist «% sikker»).
 *
 * Sti-sikkerhet c mappes konservativt: middels usikkerhet skal la spot
 * dominere, fordi forventet #2 er skjørt når motstandere har mange jevngode valg.
 *
 *   c = 0.50 → parvekt 0.25 (spot 75 %)
 *   c = 0.70 → parvekt 0.49
 *   c = 0.90 → parvekt 0.81
 */
export function pairTrustFromConfidence(confidence: number): number {
  const c = Math.min(1, Math.max(0, confidence));
  return c * c;
}

/**
 * Bland lokal spot-score med forventet par-surplus etter sti-sikkerhet.
 *
 * `pairScore` er full parverdi (~to landsbyer); vi legger kun til den
 * tillitsvektede marginalen `(pair - first)` slik at lav sikkerhet holder
 * resultatet på første-landsby-skala, mens høy sikkerhet løfter mot paret.
 * Algebraisk lik `first*(1-w) + pair*w`, men uttrykt som marginal for klarhet.
 */
export function blendLookaheadScore(
  immediateScore: number,
  pairScore: number,
  confidence: number
): number {
  const pairWeight = pairTrustFromConfidence(confidence);
  const marginalSecond = pairScore - immediateScore;
  return immediateScore + pairWeight * marginalSecond;
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

/** Relativ styrke 0–100 der beste strategi i settet = 100 */
export type StrategyRelativeLevels = Partial<Record<StrategyChoice, number>>;

/**
 * Del rå PSM-score på Σ ressursvekter slik at profiler med høyere wheat/ore-skala
 * (f.eks. største hær) ikke «vinner» bare fordi tallene er større.
 */
export function normalizeStrategyScore(
  rawScore: number,
  weights: ResourceWeights
): number {
  const sum = totalResourceWeightSum(weights);
  if (sum <= 1e-9) return rawScore;
  return rawScore / sum;
}

function pathComparableScore(
  path: FirstSettlementPath | null | undefined,
  weights: ResourceWeights,
  useAdjusted: boolean
): number {
  if (!path) return 0;
  const raw = useAdjusted
    ? (path.adjustedPairScore ?? path.pairScore)
    : path.pairScore;
  return normalizeStrategyScore(raw, weights);
}

/**
 * Sammenlign strategier på samme skala (normalisert justert par / effektiv havnscore).
 * Beste = 100; øvrige = avrundet prosent av beste.
 */
export function buildStrategyRelativeLevels(
  evaluations: ProfileStrategyEvaluation[],
  harborEffectiveScore: number | null = null
): StrategyRelativeLevels {
  const scores: { choice: StrategyChoice; score: number }[] = [];

  for (const evaluation of evaluations) {
    const path = evaluation.bestPath;
    if (!path) continue;
    scores.push({
      choice: evaluation.profile.id,
      score: pathComparableScore(path, evaluation.profile.weights, true),
    });
  }

  if (harborEffectiveScore != null && Number.isFinite(harborEffectiveScore)) {
    scores.push({
      choice: 'harbor',
      score: normalizeStrategyScore(harborEffectiveScore, HARBOR_EVAL_WEIGHTS),
    });
  }

  if (scores.length === 0) return {};

  const max = Math.max(...scores.map((entry) => entry.score));
  if (max <= 1e-9) return {};

  const levels: StrategyRelativeLevels = {};
  for (const entry of scores) {
    levels[entry.choice] = Math.round((entry.score / max) * 100);
  }
  return levels;
}

/**
 * Simuler motspillere til det er din andre landsby-tur, med usikkerhet
 * i hvert motstandervalg (klar favoritt vs. mange jevngode).
 *
 * Motstandere bruker jevnere ressursvekter (OPPONENT_RESOURCE_WEIGHTS).
 * `weights` er bevart for bakoverkompatibilitet, men brukes ikke for
 * motspillervalg.
 */
export function simulateToHumanSecondTurnDetailed(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  humanFirstVertex: string,
  _weights?: ResourceWeights
): OpponentPathSimulation | null {
  void _weights;
  let simulated: PlacedSettlement[] = [
    ...placed,
    withSetupRoad(
      { vertexId: humanFirstVertex, player: humanPlayer, isCity: false },
      board,
      placed,
      buildRoadScoringContext(board, placed, humanPlayer, humanFirstVertex, {
        playerCount,
      })
    ),
  ];

  const order = getPlacementOrder(playerCount);
  let step = simulated.length;
  const stepConfidences: number[] = [];

  while (step < order.length) {
    const player = order[step];
    const humanCount = simulated.filter((p) => p.player === humanPlayer).length;

    if (player === humanPlayer && humanCount === 1) {
      return {
        placements: simulated,
        pathConfidence: aggregatePathConfidence(stepConfidences),
      };
    }

    const choice = pickOpponentChoice(
      board,
      simulated,
      player,
      OPPONENT_RESOURCE_WEIGHTS
    );
    if (!choice) return null;

    stepConfidences.push(choice.confidence);
    simulated = [
      ...simulated,
      withSetupRoad(
        { vertexId: choice.vertexId, player, isCity: false },
        board,
        simulated,
        buildRoadScoringContext(board, simulated, player, choice.vertexId, {
          playerCount,
        })
      ),
    ];
    step += 1;
  }

  return null;
}

/** Bakoverkompatibel wrapper — kun plasseringer. */
export function simulateToHumanSecondTurn(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  humanFirstVertex: string,
  weights?: ResourceWeights
): PlacedSettlement[] | null {
  return (
    simulateToHumanSecondTurnDetailed(
      board,
      placed,
      humanPlayer,
      playerCount,
      humanFirstVertex,
      weights
    )?.placements ?? null
  );
}

export function evaluateFirstSettlementPath(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  firstVertexId: string,
  weights: ResourceWeights
): FirstSettlementPath | null {
  const simulated = simulateToHumanSecondTurnDetailed(
    board,
    placed,
    humanPlayer,
    playerCount,
    firstVertexId,
    weights
  );
  if (!simulated) return null;

  const econ = computeBoardEconomics(board, weights);
  const secondOptions = getValidVertices(simulated.placements)
    .map((id) =>
      scoreSecondSettlement(
        id,
        firstVertexId,
        board,
        econ,
        simulated.placements,
        humanPlayer
      )
    )
    .sort((a, b) => b.total - a.total);
  if (secondOptions.length === 0) return null;

  const bestSecond = secondOptions[0]!;
  const firstScore = scoreVertex(
    firstVertexId,
    board,
    econ,
    placed,
    humanPlayer
  );
  const pathConfidence = simulated.pathConfidence;
  const pairScore = bestSecond.total;

  return {
    firstVertexId,
    firstScore: firstScore.total,
    bestSecondVertexId: bestSecond.vertexId,
    pairScore,
    pathConfidence,
    adjustedPairScore: blendLookaheadScore(
      firstScore.total,
      pairScore,
      pathConfidence
    ),
  };
}

const DEFAULT_LOOKAHEAD_CANDIDATES = 12;

/**
 * Rangér første-landsbyer med lookahead:
 * lokal score → simuler motstandere → beste #2.
 * Rangering bruker justert parscore (par blandet med spot etter tillit).
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
        lookaheadConfidence: 0,
      };
    }
    return {
      ...spot,
      immediateScore: spot.total,
      expectedPairScore: path.pairScore,
      expectedSecondVertexId: path.bestSecondVertexId,
      lookaheadConfidence: path.pathConfidence,
      // Rangér på justert par (usikker sti → mer vekt på lokal spot)
      total: path.adjustedPairScore,
    };
  });

  withLookahead.sort((a, b) => {
    const adjDiff = b.total - a.total;
    if (Math.abs(adjDiff) > 1e-9) return adjDiff;
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
      if (
        path &&
        (!bestPath ||
          path.adjustedPairScore > bestPath.adjustedPairScore ||
          (path.adjustedPairScore === bestPath.adjustedPairScore &&
            path.pairScore > bestPath.pairScore))
      ) {
        bestPath = path;
      }
    }

    evaluations.push({ profile, bestPath });
  }

  const ranked = [...evaluations].sort(
    (a, b) =>
      pathComparableScore(b.bestPath, b.profile.weights, true) -
      pathComparableScore(a.bestPath, a.profile.weights, true)
  );
  const winner = ranked[0];
  const recommendedProfile = winner?.profile ?? STRATEGY_PROFILES[0]!;
  const winnerPath = winner?.bestPath;

  let reason = 'Ingen gyldige parplasseringer funnet – bruker balansert profil.';
  if (winnerPath) {
    reason = `${recommendedProfile.label} gir best forventet parscore (${winnerPath.adjustedPairScore.toFixed(2)}) når motspillere velger høy produksjon (pip) og du følger med landsby nr. 2 på ${describeSecondPreview(board, winnerPath, recommendedProfile.weights, placed, humanPlayer)}.`;
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
  suggestedPaths.sort(
    (a, b) =>
      b.adjustedPairScore - a.adjustedPairScore || b.pairScore - a.pairScore
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
  weights: ResourceWeights,
  placed: PlacedSettlement[] = [],
  humanPlayer?: number
): string {
  const score = scoreSecondSettlement(
    path.bestSecondVertexId,
    path.firstVertexId,
    board,
    computeBoardEconomics(board, weights),
    placed,
    humanPlayer
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

/** Din tur til landsby #2 (én landsby allerede plassert). */
export function isHumanSecondSettlementTurn(
  placed: PlacedSettlement[],
  humanPlayer: number
): boolean {
  return placed.filter((p) => p.player === humanPlayer).length === 1;
}

/**
 * Anbefal strategi for landsby #2 ut fra gjenværende posisjoner
 * og synerget med din første landsby.
 */
export function recommendStrategyForSecondSettlement(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number
): StrategyRecommendation {
  const firstVertexId = placed.find((p) => p.player === humanPlayer)?.vertexId;
  const evaluations: ProfileStrategyEvaluation[] = [];

  if (!firstVertexId) {
    const fallback = STRATEGY_PROFILES[0]!;
    return {
      recommendedProfileId: fallback.id,
      recommendedProfile: fallback,
      reason: 'Ingen første landsby funnet – bruker balansert profil.',
      evaluations: STRATEGY_PROFILES.map((profile) => ({ profile, bestPath: null })),
      suggestedPaths: [],
    };
  }

  for (const profile of STRATEGY_PROFILES) {
    const weights = profile.weights;
    const econ = computeBoardEconomics(board, weights);
    const secondOptions = getValidVertices(placed)
      .map((id) =>
        scoreSecondSettlement(
          id,
          firstVertexId,
          board,
          econ,
          placed,
          humanPlayer
        )
      )
      .sort((a, b) => b.total - a.total);
    const best = secondOptions[0];
    if (!best) {
      evaluations.push({ profile, bestPath: null });
      continue;
    }
    const firstScore = scoreVertex(
      firstVertexId,
      board,
      econ,
      placed,
      humanPlayer
    );
    evaluations.push({
      profile,
      bestPath: {
        firstVertexId,
        firstScore: firstScore.total,
        bestSecondVertexId: best.vertexId,
        pairScore: best.total,
        // Motstandere har allerede plassert — ingen lookahead-usikkerhet
        pathConfidence: 1,
        adjustedPairScore: best.total,
      },
    });
  }

  const ranked = [...evaluations].sort(
    (a, b) =>
      pathComparableScore(b.bestPath, b.profile.weights, true) -
      pathComparableScore(a.bestPath, a.profile.weights, true)
  );
  const winner = ranked[0];
  const recommendedProfile = winner?.profile ?? STRATEGY_PROFILES[0]!;
  const winnerPath = winner?.bestPath;

  let reason = 'Ingen gyldige plasseringer igjen – bruker balansert profil.';
  if (winnerPath) {
    reason = `Ut fra gjenværende posisjoner passer ${recommendedProfile.label} best for landsby #2 (parscore ${winnerPath.pairScore.toFixed(2)}). Motspillere vektlegger ressursene mer likt.`;
  }

  const suggestedPaths = ranked
    .map((e) => e.bestPath)
    .filter((p): p is FirstSettlementPath => p !== null)
    .slice(0, 5);

  return {
    recommendedProfileId: recommendedProfile.id,
    recommendedProfile,
    reason,
    evaluations: ranked,
    suggestedPaths,
  };
}
