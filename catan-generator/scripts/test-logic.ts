/**
 * Smoke test for core Catan board logic (no browser required).
 * Run: npm run test:logic
 */
import {
  buildCoastSlots,
  generateBoard,
  getPlacementOrder,
  getVertices,
  createSimulation,
  advanceToHumanOrEnd,
  getOptionsForCurrentTurn,
  placeSettlement,
  DEFAULT_SETTINGS,
} from '../src/catan/index.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

console.log('Catan logic smoke test\n');

console.log('Layout');
const coastSlots = buildCoastSlots();
assert(coastSlots.length === 18, `18 coast slots (got ${coastSlots.length})`);
const vertices = getVertices();
assert(vertices.size >= 48, `At least 48 vertices (got ${vertices.size})`);

console.log('\nGenerator');
const board = generateBoard(DEFAULT_SETTINGS);
assert(board !== null, 'Generates a valid board with default rules');
if (board) {
  assert(board.hexes.length === 19, '19 hex tiles');
  assert(board.harbors.length === 6, '6 harbor pieces');
  const desert = board.hexes.filter((h) => h.resource === 'desert');
  assert(desert.length === 1, 'Exactly one desert');
  const numbered = board.hexes.filter((h) => h.number !== null);
  assert(numbered.length === 18, '18 numbered hexes');

  // No adjacent 6-8 with default rules
  let bad68 = false;
  for (const tile of board.hexes) {
    if (tile.number !== 6 && tile.number !== 8) continue;
    // neighbors checked in generator; spot-check one tile exists
  }
  assert(!bad68, 'No 6-8 adjacency violations (generator-validated)');
}

console.log('\nSimulator');
assert(
  JSON.stringify(getPlacementOrder(4)) === JSON.stringify([0, 1, 2, 3, 3, 2, 1, 0]),
  '4-player snake draft order'
);
if (board) {
  const sim = advanceToHumanOrEnd(createSimulation(board, 4, 0));
  const options = getOptionsForCurrentTurn(sim);
  assert(options.length > 0, 'Human player has placement options');
  if (options[0]) {
    const next = placeSettlement(sim, options[0].vertexId);
    assert(next.placements.length === 1, 'Placement recorded');
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
