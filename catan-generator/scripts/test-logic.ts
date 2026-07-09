/**
 * Smoke test for core Catan board logic (no browser required).
 * Run: npm run test:logic
 */
import {
  BOARD_HEX_COORDS,
  ROW_COUNTS,
  buildCoastSlots,
  generateBoard,
  getEdgeHexSet,
  getLandHexCoords,
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
assert(ROW_COUNTS.join(',') === '4,5,6,7,6,5,4', '7 centered rows');
assert(BOARD_HEX_COORDS.length === 37, `37 board hexes (got ${BOARD_HEX_COORDS.length})`);
assert(getEdgeHexSet().size === 21, `21 edge hexes (got ${getEdgeHexSet().size})`);
assert(getLandHexCoords().length === 16, `16 land hexes (got ${getLandHexCoords().length})`);
const coastSlots = buildCoastSlots();
assert(coastSlots.length === 18, `18 coast slots (got ${coastSlots.length})`);
const vertices = getVertices();
assert(vertices.size >= 60, `At least 60 vertices (got ${vertices.size})`);

console.log('\nGenerator');
const board = generateBoard(DEFAULT_SETTINGS);
assert(board !== null, 'Generates a valid board with default rules');
if (board) {
  assert(board.hexes.length === 37, '37 hex tiles');
  const edges = board.hexes.filter((h) => h.kind === 'edge');
  const land = board.hexes.filter((h) => h.kind === 'land');
  assert(edges.length === 21, '21 blue edge hexes');
  assert(land.length === 16, '16 land hexes');
  assert(board.harbors.length === 6, '6 harbor pieces');
  const desert = land.filter((h) => h.resource === 'desert');
  assert(desert.length === 1, 'Exactly one desert');
  const numbered = land.filter((h) => h.number !== null);
  assert(numbered.length === 15, '15 numbered land hexes');
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
