/**
 * Audit which strategies the model recommends as strongest across many boards.
 * Also compares raw vs weight-sum-normalized ranking.
 */
import { generateBoard } from '../src/catan/generator.ts';
import { DEFAULT_SETTINGS } from '../src/catan/types.ts';
import {
  recommendStrategy,
  buildStrategyRelativeLevels,
} from '../src/catan/strategyAdvisor.ts';
import { findHarborStrategyOpportunities } from '../src/catan/harborStrategy.ts';
import {
  STRATEGY_PROFILES,
  type StrategyChoice,
  type StrategyProfileId,
} from '../src/catan/resourceWeights.ts';

const N = Number(process.argv[2] ?? 80);
const PLAYER_COUNT = 4 as const;
const HUMAN = 0;

function weightSum(id: StrategyProfileId): number {
  const w = STRATEGY_PROFILES.find((p) => p.id === id)!.weights;
  return w.wheat + w.ore + w.wood + w.brick + w.sheep;
}

function pickWinner(
  levels: Partial<Record<StrategyChoice, number>>
): StrategyChoice | null {
  let best: StrategyChoice | null = null;
  let bestLevel = -1;
  for (const [choice, level] of Object.entries(levels) as [StrategyChoice, number][]) {
    if (level > bestLevel) {
      bestLevel = level;
      best = choice;
    }
  }
  return best;
}

function normalizedWinner(
  evaluations: {
    profile: { id: StrategyProfileId };
    bestPath: { adjustedPairScore?: number; pairScore: number } | null;
  }[]
): StrategyProfileId | null {
  let best: StrategyProfileId | null = null;
  let bestScore = -Infinity;
  for (const ev of evaluations) {
    if (!ev.bestPath) continue;
    const raw = ev.bestPath.adjustedPairScore ?? ev.bestPath.pairScore;
    const norm = raw / weightSum(ev.profile.id);
    if (norm > bestScore) {
      bestScore = norm;
      best = ev.profile.id;
    }
  }
  return best;
}

const winCounts: Record<string, number> = {};
const uiWinCounts: Record<string, number> = {};
const normWinCounts: Record<string, number> = {};
const levelSums: Record<string, number> = {};
const levelCounts: Record<string, number> = {};
const rawScoreSums: Record<string, number> = {};
const margins: number[] = [];

const choices = [
  ...STRATEGY_PROFILES.map((p) => p.id),
  'harbor',
] as StrategyChoice[];
for (const c of choices) {
  winCounts[c] = 0;
  uiWinCounts[c] = 0;
  normWinCounts[c] = 0;
  levelSums[c] = 0;
  levelCounts[c] = 0;
  rawScoreSums[c] = 0;
}

console.log(`Running ${N} boards × recommendStrategy (4p, human seat 0)…\n`);

for (let i = 0; i < N; i++) {
  // Reseed so runs are reproducible across invocations
  let s = (10_000 + i) >>> 0;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s >>> 0) / 0x1_0000_0000;
  };

  const board = generateBoard(DEFAULT_SETTINGS, 'base');
  if (!board) {
    console.warn(`board ${i} failed`);
    continue;
  }

  const rec = recommendStrategy(board, [], HUMAN, PLAYER_COUNT);
  winCounts[rec.recommendedProfileId] =
    (winCounts[rec.recommendedProfileId] ?? 0) + 1;

  const harbors = findHarborStrategyOpportunities(
    board,
    [],
    HUMAN,
    PLAYER_COUNT
  );
  const topHarbor = harbors[0]?.vsBalanced?.effectiveScore ?? null;
  const levels = buildStrategyRelativeLevels(rec.evaluations, topHarbor);
  const uiWinner = pickWinner(levels);
  if (uiWinner) uiWinCounts[uiWinner] = (uiWinCounts[uiWinner] ?? 0) + 1;

  const norm = normalizedWinner(rec.evaluations);
  if (norm) normWinCounts[norm] = (normWinCounts[norm] ?? 0) + 1;

  const scores = rec.evaluations
    .map((ev) => ({
      id: ev.profile.id,
      raw: ev.bestPath?.adjustedPairScore ?? ev.bestPath?.pairScore ?? 0,
    }))
    .filter((s) => s.raw > 0)
    .sort((a, b) => b.raw - a.raw);
  if (scores.length >= 2) {
    margins.push(scores[0]!.raw - scores[1]!.raw);
  }

  for (const ev of rec.evaluations) {
    const id = ev.profile.id;
    const raw = ev.bestPath?.adjustedPairScore ?? ev.bestPath?.pairScore;
    if (raw == null) continue;
    rawScoreSums[id] = (rawScoreSums[id] ?? 0) + raw;
    const level = levels[id];
    if (level != null) {
      levelSums[id] = (levelSums[id] ?? 0) + level;
      levelCounts[id] = (levelCounts[id] ?? 0) + 1;
    }
  }
  if (levels.harbor != null) {
    levelSums.harbor = (levelSums.harbor ?? 0) + levels.harbor;
    levelCounts.harbor = (levelCounts.harbor ?? 0) + 1;
  }
}

function pct(n: number): string {
  return `${((100 * n) / N).toFixed(1)}%`;
}

console.log('=== A) recommendStrategy winner (pairScore, no harbor) ===');
for (const c of STRATEGY_PROFILES.map((p) => p.id)) {
  console.log(
    `  ${c.padEnd(14)} ${String(winCounts[c] ?? 0).padStart(3)}  ${pct(winCounts[c] ?? 0)}`
  );
}

console.log('\n=== B) UI gold recommendation (levels incl. harbor) ===');
for (const c of choices) {
  console.log(
    `  ${c.padEnd(14)} ${String(uiWinCounts[c] ?? 0).padStart(3)}  ${pct(uiWinCounts[c] ?? 0)}`
  );
}

console.log('\n=== C) Weight-sum normalized winner (profiles only) ===');
for (const c of STRATEGY_PROFILES.map((p) => p.id)) {
  console.log(
    `  ${c.padEnd(14)} ${String(normWinCounts[c] ?? 0).padStart(3)}  ${pct(normWinCounts[c] ?? 0)}`
  );
}

console.log('\n=== D) Average UI levels (best=100) ===');
for (const c of choices) {
  const n = levelCounts[c] ?? 0;
  const avg = n ? (levelSums[c] ?? 0) / n : 0;
  console.log(`  ${c.padEnd(14)} avg ${avg.toFixed(1)}  (n=${n})`);
}

console.log('\n=== E) Average raw adjustedPairScore + weight sums ===');
for (const p of STRATEGY_PROFILES) {
  const avg = (rawScoreSums[p.id] ?? 0) / N;
  const sum = weightSum(p.id);
  console.log(
    `  ${p.id.padEnd(14)} avgScore ${avg.toFixed(3)}  Σw ${sum.toFixed(3)}  score/Σw ${(avg / sum).toFixed(3)}`
  );
}

const avgMargin =
  margins.reduce((a, b) => a + b, 0) / Math.max(1, margins.length);
console.log(`\nAvg raw margin (1st–2nd profile): ${avgMargin.toFixed(3)}`);
console.log(`Boards: ${N}`);
