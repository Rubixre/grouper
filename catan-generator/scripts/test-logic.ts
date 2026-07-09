/**
 * Smoke test for core Catan board logic (no browser required).
 * Run: npm run test:logic
 */
import {
  BOARD_HEX_COORDS,
  EDGE_HEX_COUNT,
  LAND_HEX_COUNT,
  ROW_COUNTS,
  buildCoastSlots,
  generateBoard,
  getEdgeHexSet,
  getEdgePieces,
  getLandHexCoords,
  getPlacementOrder,
  getVertices,
  getBoardMapping,
  HARBOR_H_PAIRS_ROT0,
  kLabelForGroupSlot,
  placeHarbors,
  resetBoardMapping,
  resetVertices,
  createSimulation,
  placeSettlement,
  getOptionsForCurrentTurn,
  DEFAULT_SETTINGS,
} from '../src/catan/index.ts';
import { hexCorner, hexToPixel } from '../src/catan/hex.ts';

resetVertices();
resetBoardMapping();

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
assert(getEdgeHexSet().size === EDGE_HEX_COUNT, `${EDGE_HEX_COUNT} edge hexes (got ${getEdgeHexSet().size})`);
assert(getLandHexCoords().length === LAND_HEX_COUNT, `${LAND_HEX_COUNT} land hexes (got ${getLandHexCoords().length})`);

const px = BOARD_HEX_COORDS.map((c) => hexToPixel(c, 1));
const cx = px.reduce((s, p) => s + p.x, 0) / px.length;
const cy = px.reduce((s, p) => s + p.y, 0) / px.length;
assert(Math.abs(cx) < 0.001 && Math.abs(cy) < 0.001, `Board centered at origin (cx=${cx.toFixed(3)}, cy=${cy.toFixed(3)})`);

const coastSlots = buildCoastSlots();
assert(coastSlots.length === 18, `18 coast slots (got ${coastSlots.length})`);
const vertices = getVertices();
assert(vertices.size >= 60, `At least 60 vertices (got ${vertices.size})`);

const mapping = getBoardMapping();
assert(mapping.edgeHexes.length === 18, `18 numbered edge hexes (got ${mapping.edgeHexes.length})`);
assert(mapping.coastCorners.length === 30, `30 coast meet corners (got ${mapping.coastCorners.length})`);

let prevAngle = -Infinity;
for (const c of mapping.coastCorners) {
  const p = hexCorner(c.anchor, c.corner, 1);
  const ang = Math.atan2(p.y, p.x);
  assert(ang >= prevAngle - 0.001, `${c.label} clockwise order`);
  prevAngle = ang;
}
assert(mapping.coastCorners[0].label === 'H1', 'First coast node is H1');
assert(mapping.coastCorners[29].label === 'H30', 'Last coast node is H30');

const atZero = placeHarbors(0);
for (const h of atZero) {
  const expected = HARBOR_H_PAIRS_ROT0[h.edgeHexLabel];
  if (expected) {
    const pair = h.nodeLabels.join(',');
    const exp = expected.join(',');
    const rev = [...expected].reverse().join(',');
    assert(pair === exp || pair === rev, `${h.edgeHexLabel} nodes ${pair} expected ${exp}`);
  }
}

const pieces = getEdgePieces(0);
assert(pieces.length === 6, '6 edge pieces');
assert(pieces[0].kLabels.join(',') === 'K18,K1,K2', `B1 default ${pieces[0].kLabels}`);
assert(kLabelForGroupSlot(0, 0, 1) === 'K3', 'rotation 1 moves B1 start to K3');

const rotated = placeHarbors(2);
assert(rotated.length === 9, '9 harbors after rotation');

console.log('\nGenerator');
const board = generateBoard(DEFAULT_SETTINGS);
assert(board !== null, 'Generates a valid board with default rules');
if (board) {
  assert(board.hexes.length === 37, '37 hex tiles');
  const edges = board.hexes.filter((h) => h.kind === 'edge');
  const land = board.hexes.filter((h) => h.kind === 'land');
  assert(edges.length === 18, '18 blue edge hexes');
  assert(land.length === 19, '19 land hexes');
  assert(board.edgeRotation >= 0 && board.edgeRotation <= 5, 'edge rotation 0-5');
  assert(board.harbors.length === 9, '9 harbors');
  for (const h of board.harbors) {
    assert(h.nodeLabels.length === 2, `${h.edgeHexLabel} affects 2 nodes`);
  }
  const desert = land.filter((h) => h.resource === 'desert');
  assert(desert.length === 1, 'Exactly one desert');
  const numbered = land.filter((h) => h.number !== null);
  assert(numbered.length === 18, '18 numbered land hexes');
}

console.log('\nSimulator');
assert(
  JSON.stringify(getPlacementOrder(4)) === JSON.stringify([0, 1, 2, 3, 3, 2, 1, 0]),
  '4-player snake draft order'
);
if (board) {
  const sim = createSimulation(board, 4);
  const options = getOptionsForCurrentTurn(sim);
  assert(options.length > 0, 'First player has placement options');
  if (options[0]) {
    const afterP1 = placeSettlement(sim, options[0].vertexId);
    assert(afterP1.placements.length === 1, 'Placement recorded');
    assert(afterP1.currentStep === 1, 'Advances to next player');
    const p2options = getOptionsForCurrentTurn(afterP1);
    assert(p2options.length > 0, 'Second player has options');
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
