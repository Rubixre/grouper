/**
 * Skriver ut konkrete eksempler på plasseringspoeng.
 * Kjør: npx tsx scripts/score-examples.ts
 */
import { generateBoard } from '../src/catan/generator.ts';
import { DEFAULT_SETTINGS } from '../src/catan/types.ts';
import { explainPlacementScore, rankVertices } from '../src/catan/settlements.ts';
import { createSimulation, getOptionsForCurrentTurn, placeSettlement } from '../src/catan/simulator.ts';
import { RESOURCE_LABELS } from '../src/catan/playerStats.ts';
import type { ProdResource } from '../src/catan/playerStats.ts';

const board = generateBoard({ ...DEFAULT_SETTINGS, randomHarbors: false }, 'base')!;
const options = rankVertices(board, []);

function printExplanation(label: string, score: ReturnType<typeof explainPlacementScore>) {
  console.log(`\n=== ${label} ===`);
  console.log(`Formel: ${score.kind === 'first' ? 'prod + dekning + havn' : 'prod + utfylling − overlapp + dekning + havn'}`);
  console.log('Hex-bidrag (sannsynlighet × ressursvekt):');
  for (const row of score.hexContributions) {
    const res = RESOURCE_LABELS[row.resource as ProdResource];
    console.log(
      `  ${res} ${row.number}: ${(row.probability * 100).toFixed(0)}% × ${row.resourceWeight.toFixed(3)} = ${row.value.toFixed(3)}`
    );
  }
  console.log(`Produksjon: ${score.production.toFixed(3)}`);
  console.log(`Dekning (${score.coveredResources.join(', ')}): +${score.diversity.toFixed(3)}`);
  if (score.kind === 'second') {
    console.log(`Utfylling: +${(score.portfolio ?? 0).toFixed(3)}`);
    console.log(`Overlapp: −${(score.overlap ?? 0).toFixed(3)}`);
  }
  if (score.harbor > 0) console.log(`Havn: +${score.harbor.toFixed(3)}`);
  console.log(`TOTAL: ${score.total.toFixed(2)}`);
}

const best = options[0];
const mid = options[Math.floor(options.length / 2)];

printExplanation(`Eksempel 1 – Beste 1. landsby (#1, score ${best.total.toFixed(2)})`, explainPlacementScore(best, board));
printExplanation(`Eksempel 2 – Middels plassering (#${Math.floor(options.length / 2) + 1}, score ${mid.total.toFixed(2)})`, explainPlacementScore(mid, board));

let sim = createSimulation(board, 4);
for (let i = 0; i < 7; i++) {
  const opts = getOptionsForCurrentTurn(sim);
  sim = placeSettlement(sim, opts[0].vertexId);
}
const secondOpts = getOptionsForCurrentTurn(sim);
const firstId = sim.placements.find((p) => p.player === 0)!.vertexId;
const bestSecond = secondOpts[0];

printExplanation(
  `Eksempel 3 – Beste 2. landsby for Spiller 1 (score ${bestSecond.total.toFixed(2)})`,
  explainPlacementScore(bestSecond, board, firstId)
);

console.log('\n(Ressursvekter: korn 1.295, malm 1.238, tømmer/tegl 0.78, ull 0.763)');
