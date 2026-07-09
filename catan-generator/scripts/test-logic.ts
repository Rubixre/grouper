/**
 * Smoke test for core Catan board logic (no browser required).
 * Run: npm run test:logic
 */
import {
  BOARD_HEX_COORDS,
  EDGE_HEX_COUNT,
  LAND_HEX_COUNT,
  ROW_COUNTS_BASE,
  buildCoastSlots,
  clearBoardCaches,
  generateBoard,
  getBoardHexCoords,
  getEdgeHexSet,
  getEdgePieces,
  getLandHexCoords,
  getPlacementOrder,
  getSingleEdgePieces,
  getVertices,
  getBoardMapping,
  HARBOR_H_PAIRS_ROT0,
  kLabelForGroupSlot,
  placeHarbors,
  resetBoardMapping,
  resetVertices,
  setBoardSize,
  createSimulation,
  currentPlayer,
  placeSettlement,
  getOptionsForCurrentTurn,
  scoreSecondSettlement,
  DEFAULT_SETTINGS,
} from '../src/catan/index.ts';
import { computeSimulationSummary } from '../src/catan/playerStats.ts';
import { hexCorner, hexToPixel } from '../src/catan/hex.ts';

resetVertices();
resetBoardMapping();
setBoardSize('base');
clearBoardCaches();
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

console.log('Layout (base)');
assert(ROW_COUNTS_BASE.join(',') === '4,5,6,7,6,5,4', '7 centered rows');
assert(getBoardHexCoords('base').length === 37, `37 board hexes (got ${getBoardHexCoords('base').length})`);
assert(getEdgeHexSet('base').size === EDGE_HEX_COUNT, `${EDGE_HEX_COUNT} edge hexes (got ${getEdgeHexSet('base').size})`);
assert(getLandHexCoords('base').length === LAND_HEX_COUNT, `${LAND_HEX_COUNT} land hexes (got ${getLandHexCoords('base').length})`);

const px = BOARD_HEX_COORDS.map((c) => hexToPixel(c, 1));
const cx = px.reduce((s, p) => s + p.x, 0) / px.length;
const cy = px.reduce((s, p) => s + p.y, 0) / px.length;
assert(Math.abs(cx) < 0.001 && Math.abs(cy) < 0.001, `Board centered at origin (cx=${cx.toFixed(3)}, cy=${cy.toFixed(3)})`);

const coastSlots = buildCoastSlots('base');
assert(coastSlots.length === 18, `18 coast slots (got ${coastSlots.length})`);
const vertices = getVertices();
assert(vertices.size >= 60, `At least 60 vertices (got ${vertices.size})`);

const mapping = getBoardMapping('base');
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

const pieces = getEdgePieces(0, 'base');
assert(pieces.length === 6, '6 edge pieces');
assert(pieces[0].kLabels.join(',') === 'K18,K1,K2', `B1 default ${pieces[0].kLabels}`);
assert(kLabelForGroupSlot(0, 0, 1, 'base') === 'K3', 'rotation 1 moves B1 start to K3');

const rotated = placeHarbors(2, 1, 'base');
assert(rotated.length === 9, '9 harbors after rotation');

console.log('\nLayout (5–6 utvidelse)');
setBoardSize('extension56');
clearBoardCaches();
resetVertices();
resetBoardMapping();
assert(getBoardHexCoords('extension56').length === 52, '52 hexes in extension');
assert(getLandHexCoords('extension56').length === 30, '30 land hexes in extension');
assert(getEdgeHexSet('extension56').size === 22, '22 edge hexes in extension');
assert(getSingleEdgePieces('extension56').length === 4, '4 single edge pieces B7–B10');
const extMapping = getBoardMapping('extension56');
assert(extMapping.edgeHexes.length === 22, '22 numbered edge hexes');
assert(extMapping.coastCorners.length > 30, 'More than 30 coast nodes on extension');

console.log('\nGenerator');
setBoardSize('base');
clearBoardCaches();
resetVertices();
resetBoardMapping();
const board = generateBoard(DEFAULT_SETTINGS, 'base');
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

const strictSettings = {
  ...DEFAULT_SETTINGS,
  allowAdjacent6And8: false,
  allowAdjacent2And12: false,
  allowAdjacentSameResource: false,
  allowAdjacentSameNumber: false,
};
const strictBoard = generateBoard(strictSettings);
if (strictBoard) {
  assert(strictBoard.hexes.length === 37, 'Strict settings still generate board');
}

const fixedHarborBoard = generateBoard({ ...DEFAULT_SETTINGS, randomHarbors: false }, 'base');
if (fixedHarborBoard) {
  assert(fixedHarborBoard.edgeRotation === 0, 'Fixed harbors use rotation 0');
}

const extBoard = generateBoard(DEFAULT_SETTINGS, 'extension56');
assert(extBoard !== null, 'Generates valid 5–6 player board');
if (extBoard) {
  assert(extBoard.boardSize === 'extension56', 'Board size flag set');
  assert(extBoard.hexes.length === 52, '52 hex tiles in extension');
  const extLand = extBoard.hexes.filter((h) => h.kind === 'land');
  const extEdge = extBoard.hexes.filter((h) => h.kind === 'edge');
  assert(extLand.length === 30, '30 land hexes in extension');
  assert(extEdge.length === 22, '22 edge hexes in extension');
  const wood = extLand.filter((h) => h.resource === 'wood');
  const desert = extLand.filter((h) => h.resource === 'desert');
  assert(wood.length === 6, '6 wood tiles in extension');
  assert(desert.length === 2, '2 desert tiles in extension');
  assert(extLand.filter((h) => h.number !== null).length === 28, '28 numbered land hexes');
}

console.log('\nResource weights');
import {
  WEIGHTS_GENERAL,
  WEIGHTS_LONGEST_ROAD_ONLY,
  WEIGHTS_LARGEST_ARMY_ONLY,
  coverageBonus,
  getWeightsForProfile,
  blendWeightsByScores,
} from '../src/catan/resourceWeights.ts';
import { DEFAULT_RESOURCE_WEIGHTS } from '../src/catan/types.ts';
import {
  analyzeStrategy,
  countOpponentSteps,
  getSecondPlacementStep,
  getRankedOptions,
  projectPlacements,
} from '../src/catan/strategyInference.ts';

assert(Math.abs(DEFAULT_RESOURCE_WEIGHTS.wheat - WEIGHTS_GENERAL.wheat) < 0.01, 'Default matches general average');
assert(
  getWeightsForProfile('longestRoadOnly').wood > WEIGHTS_GENERAL.wood,
  'Longest road boosts wood vs general'
);
assert(
  getWeightsForProfile('largestArmyOnly').ore > WEIGHTS_GENERAL.ore,
  'Largest army boosts ore vs general'
);
const highValueCoverage = coverageBonus(
  new Set(['wheat', 'ore', 'wood']),
  WEIGHTS_GENERAL
);
const lowValueCoverage = coverageBonus(
  new Set(['wood', 'brick', 'sheep']),
  WEIGHTS_GENERAL
);
assert(
  highValueCoverage > lowValueCoverage,
  'Coverage bonus favors high-value resource mix'
);
assert(
  coverageBonus(new Set(['wheat', 'ore', 'wood', 'brick', 'sheep']), WEIGHTS_GENERAL) >
    highValueCoverage,
  'Full resource coverage scores higher'
);
const blended = blendWeightsByScores({
  both: 1,
  largestArmyOnly: 0,
  longestRoadOnly: 0,
  neither: 0,
});
assert(blended.wheat === getWeightsForProfile('both').wheat, 'Blend single profile');

console.log('\nStrategy inference');
const order4 = getPlacementOrder(4);
const order3 = getPlacementOrder(3);
assert(getSecondPlacementStep(order4, 0) === 7, 'Player 0 second placement at step 7');
assert(getSecondPlacementStep(order4, 3) === 4, 'Player 3 second placement at step 4');
assert(getSecondPlacementStep(order3, 2) === 3, 'Player 2 (P3) second placement at step 3');
assert(
  countOpponentSteps(order3, 2, 3, 3) === 0,
  'No opponent steps between P3 first and second (consecutive turns)'
);
assert(
  countOpponentSteps(order3, 2, 2, 3) === 0,
  'No opponents between step 2 and 3 for P3 in 3-player draft'
);
assert(
  countOpponentSteps(order4, 0, 1, 7) === 6,
  'Six opponent steps before P0 second in 4-player draft'
);
if (board) {
  const sim = createSimulation(board, 4);
  const autoRanked = getRankedOptions(sim, 0, 'auto');
  assert(autoRanked.options.length > 0, 'Auto ranking has options');
  assert(autoRanked.analysis !== null, 'Auto ranking provides analysis for focus player turn');
  assert(
    Object.keys(autoRanked.analysis!.profileScores).length === 4,
    'Four victory profile scores'
  );

  const projected = projectPlacements(board, [], order4, 1, 7, 0);
  assert(projected.length === 6, 'Projects 6 opponent placements before P0 second settlement');
  const analysis = analyzeStrategy(board, [], order4, 0, 0);
  assert(analysis.usedLookahead, 'First turn analysis uses lookahead');
  assert(analysis.projectedSteps === 6, 'P0 first turn projects 6 opponent moves');

  const sim3 = createSimulation(board, 3);
  let state3 = sim3;
  for (let i = 0; i < 2; i++) {
    const opts = getOptionsForCurrentTurn(state3);
    state3 = placeSettlement(state3, opts[0].vertexId);
  }
  assert(currentPlayer(state3) === 2, 'Step 2 is player 3 (index 2)');
  const p3first = getRankedOptions(state3, 2, 'auto');
  assert(p3first.analysis !== null, 'P3 auto analysis on first settlement turn');
  assert(
    p3first.analysis!.projectedSteps === 0,
    'P3 places twice in a row – no opponent projection before 2nd settlement'
  );
}

console.log('\nHarbor scoring');
import { getHarborsForVertex } from '../src/catan/harbors.ts';
import { scoreVertex, scoreSecondSettlement } from '../src/catan/settlements.ts';
if (board) {
  const w = getWeightsForProfile('general');
  const sim = createSimulation(board, 4);
  let state = sim;
  for (let i = 0; i < 7; i++) {
    const opts = getOptionsForCurrentTurn(state, 0, 'general');
    state = placeSettlement(state, opts[0].vertexId);
  }
  const secondOpts = getOptionsForCurrentTurn(state, 0, 'general');
  const harborOpts = secondOpts.filter(
    (o) => getHarborsForVertex(o.vertexId, board.harbors).length > 0
  );
  const inlandOpts = secondOpts.filter(
    (o) => getHarborsForVertex(o.vertexId, board.harbors).length === 0
  );
  if (harborOpts[0] && inlandOpts[0]) {
    const hRank = secondOpts.indexOf(harborOpts[0]) + 1;
    const iRank = secondOpts.indexOf(inlandOpts[0]) + 1;
    assert(
      harborOpts[0].harbor < harborOpts[0].production * 1.5,
      'Harbor bonus no longer dwarfs local production'
    );
    assert(
      inlandOpts[0].total >= harborOpts[0].total * 0.85 || iRank <= hRank + 3,
      'Inland options competitive with harbor options'
    );
  }

  const withHarbor = secondOpts.find(
    (o) => getHarborsForVertex(o.vertexId, board.harbors).length > 0
  );
  if (withHarbor) {
    const firstId = state.placements.find((p) => p.player === 0)!.vertexId;
    const scored = scoreSecondSettlement(withHarbor.vertexId, firstId, board, w);
    assert(scored.harbor < 0.15, 'Typical harbor bonus stays modest in early game');
  }
}

console.log('\nSimulator');
assert(
  JSON.stringify(getPlacementOrder(4)) === JSON.stringify([0, 1, 2, 3, 3, 2, 1, 0]),
  '4-player snake draft order'
);
assert(getPlacementOrder(5).length === 10, '5-player draft has 10 placements');
assert(getPlacementOrder(6).length === 12, '6-player draft has 12 placements');
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
    assert(
      p2options.every((o) => o.placementKind === 'first'),
      'First settlement uses first-placement scoring'
    );
  }

  // Second settlement uses pair scoring for returning player
  const sim4 = createSimulation(board, 4);
  let state = sim4;
  for (let i = 0; i < 7; i++) {
    const opts = getOptionsForCurrentTurn(state);
    assert(opts.length > 0, `Step ${i} has options`);
    state = placeSettlement(state, opts[0].vertexId);
  }
  const p1second = getOptionsForCurrentTurn(state, 0, 'general');
  assert(p1second.length > 0, 'Player 1 second settlement has options');
  assert(
    p1second.every((o) => o.placementKind === 'second'),
    'Second settlement uses pair scoring'
  );
  assert(
    p1second.every((o) => o.portfolio !== undefined && o.overlap !== undefined),
    'Second settlement exposes portfolio and overlap'
  );

  const firstPlacement = state.placements.find((p) => p.player === 0)!;
  const ranked = p1second[0];
  const direct = scoreSecondSettlement(
    ranked.vertexId,
    firstPlacement.vertexId,
    board,
    getWeightsForProfile('general')
  );
  assert(
    Math.abs(direct.total - ranked.total) < 1e-9,
    'Second settlement score matches scoreSecondSettlement'
  );

  console.log('\nSimulation summary');
  const finishedSim = createSimulation(board, 4);
  let finishedState = finishedSim;
  for (let i = 0; i < finishedSim.placementOrder.length; i++) {
    const opts = getOptionsForCurrentTurn(finishedState);
    finishedState = placeSettlement(finishedState, opts[0].vertexId);
  }
  assert(finishedState.finished, 'Simulation completes after all placements');
  const summary = computeSimulationSummary(finishedState);
  assert(summary.players.length === 4, 'Summary has 4 players');
  assert(
    Math.abs(summary.players.reduce((s, p) => s + p.shareOfTable, 0) - 1) < 1e-9,
    'Player shares sum to 100%'
  );
  assert(summary.tableTotalPerRoll > 0, 'Table has positive expected production');
  for (const p of summary.players) {
    assert(p.combined.totalPerRoll > 0, `${p.name} has expected production`);
    assert(p.combined.resourceCount >= 1, `${p.name} touches at least one resource`);
  }
  const p0 = summary.players[0];
  const startingSum = Object.values(p0.startingResources).reduce((a, b) => a + b, 0);
  assert(
    Math.abs(startingSum - (p0.secondSettlement?.totalPerRoll ?? 0)) < 1e-9,
    'Starting hand matches second settlement production'
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
