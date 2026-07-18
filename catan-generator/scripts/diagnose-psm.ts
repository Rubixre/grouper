/**
 * Diagnose PSM ranking failures: elite spots (high pip / multi-red) losing to weaker ones.
 */
import { generateBoard } from '../src/catan/generator.ts';
import { DEFAULT_SETTINGS } from '../src/catan/types.ts';
import { DEFAULT_RESOURCE_WEIGHTS } from '../src/catan/types.ts';
import {
  getValidVertices,
  scoreVertex,
  getVertices,
  vertexPipTotal,
  vertexRawByResource,
} from '../src/catan/settlements.ts';
import { computeBoardEconomics } from '../src/catan/placementModel.ts';
import { rankFirstSettlementsWithLookahead } from '../src/catan/strategyAdvisor.ts';
import { createSimulation, getOptionsForCurrentTurn } from '../src/catan/simulator.ts';
import { createSimulationConfig } from '../src/catan/playerConfig.ts';
import type { Board } from '../src/catan/types.ts';

function redCount(vertexId: string, board: Board): number {
  const v = getVertices().get(vertexId);
  if (!v) return 0;
  let n = 0;
  for (const hex of v.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (tile?.number === 6 || tile?.number === 8) n += 1;
  }
  return n;
}

function producingHexCount(vertexId: string, board: Board): number {
  const v = getVertices().get(vertexId);
  if (!v) return 0;
  let n = 0;
  for (const hex of v.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (
      tile?.kind === 'land' &&
      tile.resource &&
      tile.resource !== 'desert' &&
      tile.number
    ) {
      n += 1;
    }
  }
  return n;
}

type Case = {
  boardPipBest: number;
  chosenPip: number;
  eliteReds: number;
  chosenReds: number;
  eliteRankAfterLookahead: number;
  chosenImmediateRank: number;
  reason: string;
};

const failures: Case[] = [];
let boards = 0;
let multiRedBoards = 0;
let multiRedLost = 0;
let pipBestLost = 0;

for (let i = 0; i < 80; i++) {
  const board = generateBoard(
    { ...DEFAULT_SETTINGS, allowAdjacent6And8: true, allowAdjacentSameNumber: true },
    'base'
  );
  if (!board) continue;
  boards += 1;

  const econ = computeBoardEconomics(board, DEFAULT_RESOURCE_WEIGHTS);
  const valid = getValidVertices([]);
  const scored = valid
    .map((id) => {
      const score = scoreVertex(id, board, econ, []);
      return {
        id,
        pip: vertexPipTotal(id, board),
        reds: redCount(id, board),
        hexes: producingHexCount(id, board),
        immediate: score.total,
        production: score.production,
        expansion: score.expansionPotential ?? 0,
        lowHex: score.lowHexPenalty ?? 0,
        resources: Object.keys(vertexRawByResource(id, board)).length,
      };
    })
    .sort((a, b) => b.immediate - a.immediate);

  const byPip = [...scored].sort((a, b) => b.pip - a.pip);
  const pipBest = byPip[0]!;
  const eliteMultiRed = scored
    .filter((s) => s.reds >= 2 && s.hexes >= 3)
    .sort((a, b) => b.pip - a.pip || b.immediate - a.immediate)[0];

  const ranked = rankFirstSettlementsWithLookahead(
    board,
    [],
    0,
    4,
    DEFAULT_RESOURCE_WEIGHTS
  );
  const chosen = ranked[0]!;
  const chosenMeta = scored.find((s) => s.id === chosen.vertexId)!;

  if (eliteMultiRed) {
    multiRedBoards += 1;
    const eliteRank = ranked.findIndex((r) => r.vertexId === eliteMultiRed.id);
    if (chosen.vertexId !== eliteMultiRed.id && eliteMultiRed.pip > chosenMeta.pip + 2 / 36) {
      multiRedLost += 1;
      failures.push({
        boardPipBest: pipBest.pip * 36,
        chosenPip: chosenMeta.pip * 36,
        eliteReds: eliteMultiRed.reds,
        chosenReds: chosenMeta.reds,
        eliteRankAfterLookahead: eliteRank,
        chosenImmediateRank: scored.findIndex((s) => s.id === chosen.vertexId),
        reason: `multi-red pip=${(eliteMultiRed.pip * 36).toFixed(1)} imm=${eliteMultiRed.immediate.toFixed(3)} lost to pip=${(chosenMeta.pip * 36).toFixed(1)} imm=${chosenMeta.immediate.toFixed(3)} pair=${(chosen.expectedPairScore ?? 0).toFixed(3)} elitePair=${(ranked[eliteRank]?.expectedPairScore ?? 0).toFixed(3)}`,
      });
    }
  }

  if (chosen.vertexId !== pipBest.id && pipBest.pip > chosenMeta.pip + 3 / 36) {
    pipBestLost += 1;
  }
}

console.log(`Boards: ${boards}`);
console.log(`Boards with 2+ red 3-hex spots: ${multiRedBoards}`);
console.log(`Multi-red clearly better pip but not chosen: ${multiRedLost}`);
console.log(`Pip-best lost by >3/36: ${pipBestLost}`);
console.log('\nSample failures:');
for (const f of failures.slice(0, 12)) {
  console.log('-', f.reason, `| eliteRank=${f.eliteRankAfterLookahead} chosenImmRank=${f.chosenImmediateRank}`);
}

// Construct the user's example synthetically via score comparison
console.log('\n--- Synthetic user scenario ---');
{
  const board = generateBoard(DEFAULT_SETTINGS, 'base');
  if (board) {
    // Find any 3-hex vertices and compare score deltas for hypothetical profiles
    const econ = computeBoardEconomics(board);
    const strong = {
      pip: (5 + 5 + 5) / 36,
      prod:
        (5 / 36) * econ.dynamicWeights.wheat +
        (5 / 36) * econ.dynamicWeights.ore +
        (5 / 36) * econ.dynamicWeights.sheep,
      reds: 3,
    };
    const weak = {
      pip: (1 + 4 + 5) / 36,
      prod:
        (1 / 36) * econ.dynamicWeights.brick +
        (4 / 36) * econ.dynamicWeights.wood +
        (5 / 36) * econ.dynamicWeights.sheep,
      reds: 1,
    };
    console.log('Strong 6/8/8 wheat-ore-sheep prod', strong.prod.toFixed(3), 'pip', (strong.pip * 36).toFixed(1));
    console.log('Weak 12/5/6 brick-wood-sheep prod', weak.prod.toFixed(3), 'pip', (weak.pip * 36).toFixed(1));
    console.log('Prod gap (strong-weak)', (strong.prod - weak.prod).toFixed(3));
  }
}

// How often does #1 option leave a higher-pip spot for P2?
let leftBetterForOpp = 0;
for (let i = 0; i < 40; i++) {
  const board = generateBoard(DEFAULT_SETTINGS, 'base');
  if (!board) continue;
  const sim = createSimulation(board, createSimulationConfig(4, 0));
  const opts = getOptionsForCurrentTurn(sim);
  if (!opts[0]) continue;
  const econ = computeBoardEconomics(board);
  const chosenPip = vertexPipTotal(opts[0].vertexId, board);
  const bestOther = getValidVertices([])
    .filter((id) => id !== opts[0].vertexId)
    .map((id) => vertexPipTotal(id, board))
    .sort((a, b) => b - a)[0]!;
  if (bestOther > chosenPip + 2 / 36) leftBetterForOpp += 1;
}
console.log(`\nFirst pick leaves >+2/36 pip spot open: ${leftBetterForOpp}/40`);
