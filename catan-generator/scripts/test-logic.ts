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
  createSimulationConfig,
  placeSettlement,
  getOptionsForCurrentTurn,
  scoreSecondSettlement,
  DEFAULT_SETTINGS,
  verifyExtensionSingleHarborNodes,
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
assert(kLabelForGroupSlot(0, 0, 1, 'base') === 'K3', 'legacy rotation helper still maps starts');

import {
  BASE_IDENTITY_ORDER,
  randomBaseEdgeOrder,
} from '../src/catan/edgePieces.ts';
const baseShuffledOrder = [2, 0, 5, 1, 4, 3];
const baseShuffledHarbors = placeHarbors(0, 1, 'base', undefined, baseShuffledOrder);
assert(baseShuffledHarbors.length === 9, '9 harbors after piece shuffle');
const sheepHarbor = baseShuffledHarbors.find((h) => h.definition.id === 'harbor-g0-o2');
assert(sheepHarbor !== undefined, 'Sheep harbor present after shuffle');
assert(
  sheepHarbor!.edgeHexLabel === 'K5',
  `Sheep harbor (B1 offset 2) follows piece to slot 1 → K5 (got ${sheepHarbor!.edgeHexLabel})`
);
assert(
  sheepHarbor!.definition.hexOffset === 2,
  'Relative hex offset on piece is preserved after shuffle'
);

const identityPieces = getEdgePieces(0, 'base', undefined, BASE_IDENTITY_ORDER);
assert(identityPieces[0].label === 'B1', 'Identity order keeps B1 in first slot');
const baseShuffledPieces = getEdgePieces(0, 'base', undefined, baseShuffledOrder);
assert(baseShuffledPieces[0].label === 'B3', 'Shuffle puts B3 in first geometric slot');
assert(
  baseShuffledPieces[0].kLabels.join(',') === 'K18,K1,K2',
  'Geometric slot hexes stay fixed when pieces are shuffled'
);

// Flere kall skal kunne gi ulik piece-rekkefølge (statistisk)
const orders = new Set(
  Array.from({ length: 40 }, () => randomBaseEdgeOrder().join(','))
);
assert(orders.size > 1, 'randomBaseEdgeOrder produces more than one permutation');
assert(
  ![...orders].every((o) => o === '0,1,2,3,4,5'),
  'randomBaseEdgeOrder is not stuck on identity'
);

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
assert(extMapping.edgeHexes[0].label === 'K2', 'Extension ring starts at K2 after K rotation');
assert(
  getEdgePieces(0, 'extension56')[0].kLabels.join(',') === 'K1,K2,K3',
  'B1 default is K1–K3'
);
assert(
  getSingleEdgePieces('extension56').find((p) => p.label === 'B3')?.kLabel === 'K7',
  'B3 default on K7'
);
assert(
  getSingleEdgePieces('extension56').find((p) => p.label === 'B5')?.kLabel === 'K11',
  'B5 default on K11'
);
const extHarbors = placeHarbors(0, 1, 'extension56');
assert(extHarbors.length === 11, '11 harbors in extension default layout');
assert(
  extHarbors.some((h) => h.edgeHexLabel === 'K11' && h.definition.name === 'Ullhavn'),
  'B5 wool harbor on K11'
);
const b5Harbor = extHarbors.find((h) => h.edgeHexLabel === 'K11');
assert(
  b5Harbor?.nodeLabels.join(',') === 'H18,H19',
  `B5 wool at H18,H19 (got ${b5Harbor?.nodeLabels.join(',')})`
);
const b8Harbor = extHarbors.find((h) => h.edgeHexLabel === 'K18');
assert(
  b8Harbor?.nodeLabels.join(',') === 'H30,H31',
  `B8 3:1 at H30,H31 (got ${b8Harbor?.nodeLabels.join(',')})`
);
assert(
  !extHarbors.some((h) => h.edgeHexLabel === 'K7' || h.edgeHexLabel === 'K22'),
  'Blank pieces K7 and K22 have no harbors'
);
assert(verifyExtensionSingleHarborNodes(extMapping), 'Single K slots have land-facing ports');
const shuffledSingles = {
  triple: [0, 1, 2, 3, 4, 5],
  single: [2, 0, 1, 3],
} as const;
const shuffledHarbors = placeHarbors(0, 1, 'extension56', shuffledSingles);
const woolOnK18 = shuffledHarbors.find((h) => h.pieceGroup === 4);
const genericOnK7 = shuffledHarbors.find(
  (h) => h.pieceGroup === 7 && h.definition.harbor.kind === 'generic'
);
assert(woolOnK18?.edgeHexLabel === 'K18', 'Shuffled B5 wool sits on K18 slot');
assert(
  woolOnK18?.nodeLabels.join(',') === 'H30,H31',
  `Wool on K18 uses K18 port (got ${woolOnK18?.nodeLabels.join(',')})`
);
assert(genericOnK7?.edgeHexLabel === 'K7', 'Shuffled B8 3:1 sits on K7 slot');
assert(
  genericOnK7?.nodeLabels.join(',') === 'H11,H12',
  `3:1 on K7 uses K7 port (got ${genericOnK7?.nodeLabels.join(',')})`
);
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
  assert(
    (fixedHarborBoard.edgePieceOrder ?? []).join(',') === '0,1,2,3,4,5',
    'Fixed harbors use identity piece order'
  );
}

const randomHarborBoards = Array.from({ length: 12 }, () =>
  generateBoard({ ...DEFAULT_SETTINGS, randomHarbors: true }, 'base')
).filter(Boolean);
const randomOrders = new Set(
  randomHarborBoards.map((b) => (b!.edgePieceOrder ?? []).join(','))
);
assert(randomOrders.size > 1, 'Random harbors shuffle piece order across boards');

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
  const extNumberCounts = extLand.reduce<Record<number, number>>((acc, h) => {
    if (h.number !== null) acc[h.number] = (acc[h.number] ?? 0) + 1;
    return acc;
  }, {});
  assert(extNumberCounts[2] === 2, 'Extension has two 2-tiles');
  assert(extNumberCounts[12] === 2, 'Extension has two 12-tiles');
  for (const n of [3, 4, 5, 6, 8, 9, 10, 11]) {
    assert(extNumberCounts[n] === 3, `Extension has three ${n}-tiles`);
  }
}

console.log('\nResource weights');
import {
  WEIGHTS_GENERAL,
  WEIGHTS_LONGEST_ROAD_ONLY,
  WEIGHTS_LARGEST_ARMY_ONLY,
  coverageBonus,
  getStrategyWeights,
} from '../src/catan/resourceWeights.ts';
import { DEFAULT_RESOURCE_WEIGHTS } from '../src/catan/types.ts';

assert(Math.abs(DEFAULT_RESOURCE_WEIGHTS.wheat - WEIGHTS_GENERAL.wheat) < 0.01, 'Default matches general average');
assert(
  WEIGHTS_LONGEST_ROAD_ONLY.wood > WEIGHTS_GENERAL.wood,
  'Longest road profile has higher wood weight'
);
assert(
  WEIGHTS_LARGEST_ARMY_ONLY.ore > WEIGHTS_GENERAL.ore,
  'Largest army profile has higher ore weight'
);

assert(
  getStrategyWeights('longestRoad').wood > getStrategyWeights('largestArmy').wood,
  'Longest road strategy weights wood higher than largest army'
);
assert(
  getStrategyWeights('largestArmy').ore > getStrategyWeights('longestRoad').ore,
  'Largest army strategy weights ore higher than longest road'
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

console.log('\nSupply-based scarcity');
{
  const makeLand = (
    resource: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore',
    number: number,
    q: number,
    r: number
  ) => ({
    coord: { q, r },
    kind: 'land' as const,
    resource,
    number,
  });

  const scarcityBoard = {
    boardSize: 'base' as const,
    hexes: [
      makeLand('brick', 6, 0, 0),
      makeLand('brick', 8, 1, 0),
      makeLand('brick', 5, 2, 0),
      makeLand('sheep', 2, 0, 1),
      makeLand('sheep', 12, 1, 1),
      makeLand('sheep', 3, 2, 1),
      makeLand('sheep', 11, 3, 1),
    ],
    harbors: [],
    coastSlots: [],
    edgeRotation: 0,
  };

  const econ = computeBoardEconomics(scarcityBoard);
  assert(
    econ.hexCountByResource.brick < econ.hexCountByResource.sheep,
    'Brick has fewer tiles in scarcity fixture'
  );
  assert(
    econ.supplyByResource.brick > econ.supplyByResource.sheep,
    'Brick has higher expected supply despite fewer tiles'
  );
  assert(
    econ.placementOpportunityByResource.brick > 0,
    'Hot brick tiles create good placement opportunities'
  );
  assert(
    econ.placementOpportunityByResource.sheep < econ.placementOpportunityByResource.brick,
    'Cold sheep tiles create far fewer good placement opportunities than hot brick'
  );
  assert(
    econ.scarcityMultiplier.sheep > econ.scarcityMultiplier.brick,
    'Scarcity multiplier follows supply and placement access'
  );
  assert(
    econ.dynamicWeights.sheep > econ.dynamicWeights.brick,
    'Low-access resource gets higher dynamic weight'
  );
  assert(
    econ.scarcityMultiplier.sheep <= 1.29,
    'Scarcity factor is capped near neutral'
  );
  assert(
    econ.scarcityMultiplier.brick >= 0.79,
    'Abundant resource scarcity factor has a floor near neutral'
  );

  const roadEcon = computeBoardEconomics(scarcityBoard, WEIGHTS_LONGEST_ROAD_ONLY);
  const armyEcon = computeBoardEconomics(scarcityBoard, WEIGHTS_LARGEST_ARMY_ONLY);
  assert(
    roadEcon.strategyWeights.brick === WEIGHTS_LONGEST_ROAD_ONLY.brick,
    'Strategy weights are kept separate from scarcity tuning'
  );
  assert(
    roadEcon.dynamicWeights.wood + roadEcon.dynamicWeights.brick >
      armyEcon.dynamicWeights.wood + armyEcon.dynamicWeights.brick,
    'Strategy profile still drives resource priorities more than scarcity'
  );

  const fewWoodBoard = {
    boardSize: 'base' as const,
    hexes: [
      makeLand('wood', 6, 0, 0),
      makeLand('wood', 5, 2, 0),
      makeLand('wood', 8, 4, 0),
      makeLand('brick', 9, 0, 2),
      makeLand('brick', 10, 2, 2),
      makeLand('brick', 4, 4, 2),
      makeLand('brick', 9, 6, 2),
    ],
    harbors: [],
    coastSlots: [],
    edgeRotation: 0,
  };

  const manyWoodBoard = {
    boardSize: 'base' as const,
    hexes: [
      makeLand('wood', 4, 0, 0),
      makeLand('wood', 5, 1, 0),
      makeLand('wood', 9, 2, 0),
      makeLand('wood', 10, 3, 0),
      makeLand('brick', 10, 0, 2),
      makeLand('brick', 4, 2, 2),
      makeLand('brick', 3, 4, 2),
    ],
    harbors: [],
    coastSlots: [],
    edgeRotation: 0,
  };

  const fewWood = computeBoardEconomics(fewWoodBoard);
  const manyWood = computeBoardEconomics(manyWoodBoard);
  assert(
    Math.abs(fewWood.supplyByResource.wood - manyWood.supplyByResource.wood) < 0.02,
    'Similar wood supply in few-tile vs many-tile fixture'
  );
  assert(
    fewWood.placementOpportunityByResource.wood < manyWood.placementOpportunityByResource.wood,
    'Fewer wood tiles means fewer good placement opportunities'
  );
  assert(
    fewWood.scarcityMultiplier.wood > manyWood.scarcityMultiplier.wood,
    'Fewer placement opportunities increases wood scarcity'
  );
}

console.log('\nMono-resource penalty');
import { scoreFirstPlacement } from '../src/catan/placementModel.ts';
{
  const oreOnly6 = {
    byResource: { ore: (5 / 36) * DEFAULT_RESOURCE_WEIGHTS.ore },
    byNumber: { 6: (5 / 36) * DEFAULT_RESOURCE_WEIGHTS.ore },
    rawByResource: { ore: 5 / 36 },
    rawByNumber: { 6: 5 / 36 },
    rawByResourceNumber: { ore: { 6: 5 / 36 } },
    total: (5 / 36) * DEFAULT_RESOURCE_WEIGHTS.ore,
    pipTotal: 5 / 36,
    producingHexCount: 1,
    desertNeighbors: 1,
    hasRedNumber: true,
    resources: new Set(['ore']),
    breakdown: [{ resource: 'ore' as const, value: (5 / 36) * DEFAULT_RESOURCE_WEIGHTS.ore }],
  };

  const balanced = {
    byResource: {
      wood: (5 / 36) * DEFAULT_RESOURCE_WEIGHTS.wood,
      brick: (4 / 36) * DEFAULT_RESOURCE_WEIGHTS.brick,
      sheep: (4 / 36) * DEFAULT_RESOURCE_WEIGHTS.sheep,
    },
    byNumber: {
      6: (5 / 36) * DEFAULT_RESOURCE_WEIGHTS.wood,
      5: (4 / 36) * DEFAULT_RESOURCE_WEIGHTS.brick,
      9: (4 / 36) * DEFAULT_RESOURCE_WEIGHTS.sheep,
    },
    rawByResource: { wood: 5 / 36, brick: 4 / 36, sheep: 4 / 36 },
    rawByNumber: { 6: 5 / 36, 5: 4 / 36, 9: 4 / 36 },
    rawByResourceNumber: {
      wood: { 6: 5 / 36 },
      brick: { 5: 4 / 36 },
      sheep: { 9: 4 / 36 },
    },
    total:
      (5 / 36) * DEFAULT_RESOURCE_WEIGHTS.wood +
      (4 / 36) * DEFAULT_RESOURCE_WEIGHTS.brick +
      (4 / 36) * DEFAULT_RESOURCE_WEIGHTS.sheep,
    pipTotal: 13 / 36,
    producingHexCount: 3,
    desertNeighbors: 0,
    hasRedNumber: true,
    resources: new Set(['wood', 'brick', 'sheep']),
    breakdown: [],
  };

  const monoScore = scoreFirstPlacement(oreOnly6, DEFAULT_RESOURCE_WEIGHTS, 0);
  const balancedScore = scoreFirstPlacement(balanced, DEFAULT_RESOURCE_WEIGHTS, 0);

  assert(
    (monoScore.components.monoResourcePenalty ?? 0) > 0,
    'Single-resource placement gets mono-resource penalty'
  );
  assert(monoScore.components.redAnchorBonus === 0, 'Red anchor bonus requires resource diversity');
  assert(
    balancedScore.total > monoScore.total,
    'Balanced 3-resource spot outranks lone ore-6 edge gamble'
  );
}

console.log('\nStrategy advisor');
import {
  recommendStrategy,
  simulateToHumanSecondTurn,
  rankFirstSettlementsWithLookahead,
  evaluateFirstSettlementPath,
} from '../src/catan/strategyAdvisor.ts';
import {
  getValidVertices,
  opponentPlacementScore,
  pickGreedyOpponentVertex,
  vertexPipTotal,
  vertexResourceTypes,
  OPPONENT_RESOURCE_BONUS,
} from '../src/catan/settlements.ts';
if (board) {
  const config = createSimulationConfig(4, 0);
  const sim = createSimulation(board, config);
  const rec = recommendStrategy(board, sim.placements, config.humanPlayerIndex, 4);
  assert(rec.recommendedProfileId.length > 0, 'Strategy recommendation returns profile');
  assert(rec.suggestedPaths.length > 0, 'Strategy recommendation has suggested paths');

  const valid = getValidVertices(sim.placements);
  let bestOpponentVertex = valid[0]!;
  let bestOpponentScore = -Infinity;
  for (const vertexId of valid) {
    const score = opponentPlacementScore(vertexId, board);
    if (score > bestOpponentScore || (score === bestOpponentScore && vertexId < bestOpponentVertex)) {
      bestOpponentScore = score;
      bestOpponentVertex = vertexId;
    }
  }
  const greedyPick = pickGreedyOpponentVertex(board, sim.placements, 1);
  assert(
    greedyPick === bestOpponentVertex,
    'Greedy opponent picks highest pip+resource-diversity for first settlement'
  );
  assert(OPPONENT_RESOURCE_BONUS > 0, 'Opponent resource bonus is positive');

  // Sjekk at mangfold påvirker valet når pip er likt nok
  let foundDiversityPreference = false;
  for (const a of valid) {
    for (const b of valid) {
      if (a >= b) continue;
      const pipA = vertexPipTotal(a, board);
      const pipB = vertexPipTotal(b, board);
      const resA = vertexResourceTypes(a, board).size;
      const resB = vertexResourceTypes(b, board).size;
      if (Math.abs(pipA - pipB) < 1e-12 && resA !== resB) {
        const scoreA = opponentPlacementScore(a, board);
        const scoreB = opponentPlacementScore(b, board);
        assert(
          (scoreA > scoreB) === (resA > resB),
          'Equal pip: more unique resources scores higher for opponents'
        );
        foundDiversityPreference = true;
        break;
      }
    }
    if (foundDiversityPreference) break;
  }

  // Andre landsby: maksimerer pip + union av unike ressursyper
  const opponentFirst = greedyPick!;
  const afterOpponentFirst = [
    ...sim.placements,
    { vertexId: opponentFirst, player: 1, isCity: false as const },
  ];
  const secondPick = pickGreedyOpponentVertex(board, afterOpponentFirst, 1);
  assert(secondPick !== null, 'Opponent finds a second settlement');
  {
    const firstRes = vertexResourceTypes(opponentFirst, board);
    let bestId: string | null = null;
    let best = -Infinity;
    for (const vertexId of getValidVertices(afterOpponentFirst)) {
      const ur = new Set([...firstRes, ...vertexResourceTypes(vertexId, board)]);
      const s =
        vertexPipTotal(opponentFirst, board) +
        vertexPipTotal(vertexId, board) +
        OPPONENT_RESOURCE_BONUS * ur.size;
      if (s > best || (s === best && vertexId < (bestId ?? ''))) {
        best = s;
        bestId = vertexId;
      }
    }
    assert(secondPick === bestId, 'Second settlement maximizes pip + union resources');
  }

  const humanFirst = valid[1] ?? valid[0];
  const simulated = simulateToHumanSecondTurn(
    board,
    sim.placements,
    config.humanPlayerIndex,
    4,
    humanFirst
  );
  assert(simulated !== null, 'Greedy simulation reaches human second settlement turn');
  assert(
    simulated!.filter((p) => p.player === config.humanPlayerIndex).length === 1,
    'Simulation stops after human first settlement only'
  );

  const lookaheadOpts = rankFirstSettlementsWithLookahead(
    board,
    sim.placements,
    config.humanPlayerIndex,
    4,
    DEFAULT_RESOURCE_WEIGHTS,
    8
  );
  assert(lookaheadOpts.length > 0, 'Lookahead ranking returns options');
  assert(
    lookaheadOpts[0]!.expectedPairScore !== undefined,
    'Top first settlements include expected pair score'
  );
  assert(
    lookaheadOpts[0]!.expectedSecondVertexId !== undefined,
    'Top first settlements include expected second vertex'
  );
  const topPath = evaluateFirstSettlementPath(
    board,
    sim.placements,
    config.humanPlayerIndex,
    4,
    lookaheadOpts[0]!.vertexId,
    DEFAULT_RESOURCE_WEIGHTS
  );
  assert(topPath !== null, 'Lookahead top option has a valid path');
  assert(
    Math.abs((lookaheadOpts[0]!.expectedPairScore ?? 0) - (topPath?.pairScore ?? -1)) < 1e-9,
    'Lookahead total matches evaluateFirstSettlementPath pair score'
  );

  const turnOpts = getOptionsForCurrentTurn(sim);
  assert(
    turnOpts[0]?.expectedPairScore !== undefined,
    'getOptionsForCurrentTurn uses lookahead on first settlement'
  );
}

console.log('\nBoard story');
import {
  createBoardStory,
  __analyzeBoardTraitsForTest,
  __measureResourcePulsesForTest,
} from '../src/catan/boardStory.ts';
if (board) {
  const story = createBoardStory(board);
  assert(story.islandName.length > 3, 'Board story has island name');
  assert(story.narrative.includes('Catanøyriket'), 'Board story mentions Catanøyriket');
  assert(story.highlights.length >= 1, 'Board story highlights distinctive traits');
  assert(story.highlights.length <= 3, 'Board story keeps at most three highlights');
  assert(story.stats.resources.length === 5, 'Board story includes resource stats');
  assert(story.stats.totalExpectedProduction > 0, 'Board stats have total expected production');
  assert(!/\bens\b/i.test(story.islandName), 'Island name avoids bare genitive like Leirens');
  assert(!/\s/.test(story.islandName), 'Island name is a single compound word');
  // Intro should be one short beat, not stacked lore paragraphs
  assert(story.narrative.split('. ').length >= 2, 'Narrative has more than one sentence');
  assert(story.narrative.split('. ').length <= 5, 'Narrative stays a flowing introduction');

  const again = createBoardStory(board);
  assert(again.islandName === story.islandName, 'Same board yields same island name');

  const traits = __analyzeBoardTraitsForTest(board);
  assert(traits.length >= 1, 'Trait analysis returns at least one trait');
  assert(
    traits.every((t) => typeof t.lore === 'string' && t.lore.length > 10),
    'Traits carry mythical lore fragments'
  );
}

{
  const makeLand = (
    resource: 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | 'desert',
    q: number,
    r: number,
    number: number | null = 5
  ) => ({
    coord: { q, r },
    kind: 'land' as const,
    resource,
    number: resource === 'desert' ? null : number,
  });

  // Standard tile counts (4 wood / 3 brick / …), but brick gets hot numbers and
  // sits in a cluster; wood gets cold numbers. That — not tile count — is unique.
  const uniqueBoard = {
    boardSize: 'base' as const,
    hexes: [
      makeLand('brick', 0, 0, 6),
      makeLand('brick', 1, 0, 8),
      makeLand('brick', 0, 1, 5),
      makeLand('wood', 3, 0, 2),
      makeLand('wood', -2, 2, 3),
      makeLand('wood', 2, 2, 11),
      makeLand('wood', -1, -2, 12),
      makeLand('sheep', 2, 0, 4),
      makeLand('sheep', -1, 1, 9),
      makeLand('sheep', 1, -1, 10),
      makeLand('sheep', -2, 0, 4),
      makeLand('wheat', 1, 1, 9),
      makeLand('wheat', -1, 0, 10),
      makeLand('wheat', 0, -1, 3),
      makeLand('wheat', 2, -1, 11),
      makeLand('ore', -2, 1, 5),
      makeLand('ore', 1, -2, 9),
      makeLand('ore', 0, 2, 10),
      makeLand('desert', 0, -2, null),
    ],
    harbors: [
      {
        definition: {
          id: 'brick-port',
          name: 'Teglhavn',
          harbor: { kind: 'resource' as const, resource: 'brick' as const },
          pieceGroup: 0,
          hexOffset: 1,
        },
        pieceGroup: 0,
        edgeHexLabel: 'E1',
        nodeLabels: ['K1', 'K2'] as [string, string],
        edgeCoord: { q: 3, r: -1 },
        nodeVertexIds: ['a', 'b'] as [string, string],
        angle: 0,
      },
    ],
    coastSlots: [],
    edgeRotation: 0,
  };

  const pulses = __measureResourcePulsesForTest(uniqueBoard);
  const brickPulse = pulses.pulses.find((p) => p.resource === 'brick')!;
  const woodPulse = pulses.pulses.find((p) => p.resource === 'wood')!;
  assert(brickPulse.tileCount === 3, 'Fixture keeps standard brick tile count');
  assert(woodPulse.tileCount === 4, 'Fixture keeps standard wood tile count');
  assert(brickPulse.ratio > 1.1, 'Hot numbers lift brick production above fair share');
  assert(woodPulse.ratio < 0.9, 'Cold numbers drop wood production below fair share');

  const uniqueTraits = __analyzeBoardTraitsForTest(uniqueBoard);
  assert(
    uniqueTraits.some((t) => t.id === 'high_production' && t.resource === 'brick'),
    'Highlights unusually high brick expected production'
  );
  assert(
    uniqueTraits.some((t) => t.id === 'low_production' && t.resource === 'wood'),
    'Highlights unusually low wood expected production'
  );
  assert(
    uniqueTraits.some((t) => t.id === 'resource_cluster' && t.resource === 'brick'),
    'Highlights brick resource cluster'
  );
  assert(
    !/havn|nøkkelen til øyas handel/i.test(createBoardStory(uniqueBoard).narrative),
    'Board story narrative does not push harbors as the key to victory'
  );

  const boringCounts = __analyzeBoardTraitsForTest({
    ...uniqueBoard,
    hexes: [
      makeLand('brick', 0, 0, 5),
      makeLand('brick', 2, 2, 5),
      makeLand('brick', -2, 1, 4),
      makeLand('wood', 1, 0, 6),
      makeLand('wood', -1, 2, 8),
      makeLand('wood', 2, -1, 3),
      makeLand('wood', -2, -1, 9),
      makeLand('sheep', 0, 1, 10),
      makeLand('sheep', 1, -1, 4),
      makeLand('sheep', -1, 0, 9),
      makeLand('sheep', 1, 1, 3),
      makeLand('wheat', 0, -1, 11),
      makeLand('wheat', 2, 0, 10),
      makeLand('wheat', -1, -1, 5),
      makeLand('wheat', -2, 2, 4),
      makeLand('ore', 1, -2, 8),
      makeLand('ore', -1, 1, 6),
      makeLand('ore', 2, 1, 2),
      makeLand('desert', 0, 2, null),
    ],
    harbors: [],
  });
  assert(
    !boringCounts.some((t) => t.id === 'low_production' && t.resource === 'brick' && t.strength > 0.5),
    'Does not call evenly numbered brick uniquely production-weak from tile count alone'
  );
}

console.log('\nPlacement scoring');
import { getHarborsForVertex } from '../src/catan/harbors.ts';
import { computeBoardEconomics } from '../src/catan/placementModel.ts';
if (board) {
  const sim = createSimulation(board, createSimulationConfig(4));
  const options = getOptionsForCurrentTurn(sim);
  assert(options.length > 0, 'First turn has ranked placement options');
  assert(options[0].placementKind === 'first', 'First turn uses first-settlement scoring');

  let state = sim;
  for (let i = 0; i < 7; i++) {
    const opts = getOptionsForCurrentTurn(state);
    state = placeSettlement(state, opts[0].vertexId);
  }
  const secondOpts = getOptionsForCurrentTurn(state);
  assert(secondOpts.length > 0, 'Second settlement has options');
  assert(
    secondOpts.every((o) => o.placementKind === 'second'),
    'Second settlement uses pair scoring'
  );
  assert(
    secondOpts.every((o) => o.portfolio !== undefined && o.overlap !== undefined),
    'Second settlement exposes portfolio and overlap'
  );
  assert(
    secondOpts.every(
      (o) =>
        o.firstProduction !== undefined &&
        o.secondProduction !== undefined &&
        Math.abs(o.production - (o.firstProduction + o.secondProduction)) < 1e-9
    ),
    'Second settlement uses combined pair production'
  );
  assert(
    secondOpts.every((o) => {
      const recomposed =
        o.production +
        o.diversity +
        (o.portfolio ?? 0) -
        (o.overlap ?? 0) +
        o.harbor +
        (o.buildingSynergy ?? 0) +
        (o.coordination ?? 0) +
        (o.pairPipBonus ?? 0) -
        (o.desertPenalty ?? 0);
      return Math.abs(recomposed - o.total) < 1e-6;
    }),
    'Second settlement score components sum to total'
  );
  assert(
    secondOpts.every((o) => (o.buildingSynergy ?? 0) >= 0),
    'Second settlement exposes building synergy'
  );

  const harborOpts = secondOpts.filter(
    (o) => getHarborsForVertex(o.vertexId, board.harbors).length > 0
  );
  if (harborOpts[0]) {
    assert(
      harborOpts[0].harbor <= harborOpts[0].production * 0.08,
      'Harbor bonus capped relative to pair production'
    );
  }

  assert(
    computeBoardEconomics(board).dynamicWeights.brick >
      DEFAULT_RESOURCE_WEIGHTS.brick,
    'Low-supply brick gets higher dynamic weight on standard board'
  );

  const firstId = state.placements.find((p) => p.player === 0)!.vertexId;
  const ranked = secondOpts[0];
  const direct = scoreSecondSettlement(ranked.vertexId, firstId, board);
  assert(
    Math.abs(direct.total - ranked.total) < 1e-9,
    'Second settlement score matches scoreSecondSettlement'
  );

  const inland = secondOpts.find(
    (o) => getHarborsForVertex(o.vertexId, board.harbors).length === 0
  );
  if (inland && harborOpts[0]) {
    assert(
      inland.production >= harborOpts[0].production * 0.9 ||
        inland.total >= harborOpts[0].total * 0.8,
      'Production matters more than harbor access'
    );
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
  const sim = createSimulation(board, createSimulationConfig(4));
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
  const sim4 = createSimulation(board, createSimulationConfig(4));
  let state = sim4;
  for (let i = 0; i < 7; i++) {
    const opts = getOptionsForCurrentTurn(state);
    assert(opts.length > 0, `Step ${i} has options`);
    state = placeSettlement(state, opts[0].vertexId);
  }
  const p1second = getOptionsForCurrentTurn(state);
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
    board
  );
  assert(
    Math.abs(direct.total - ranked.total) < 1e-9,
    'Second settlement score matches scoreSecondSettlement'
  );

  console.log('\nSimulation summary');
  const finishedSim = createSimulation(board, createSimulationConfig(4));
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

console.log('\nSession persistence');
import {
  clearSession,
  loadSession,
  saveSession,
} from '../src/catan/sessionPersistence.ts';
{
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  (globalThis as { localStorage: typeof memoryStorage }).localStorage = memoryStorage;

  clearSession();
  assert(loadSession() === null, 'Empty storage yields no session');

  if (board) {
    const config = createSimulationConfig(4, 0);
    let sim = createSimulation(board, config);
    const firstOpts = getOptionsForCurrentTurn(sim);
    sim = placeSettlement(sim, firstOpts[0].vertexId);

    saveSession({
      version: 1,
      settings: DEFAULT_SETTINGS,
      boardSize: 'base',
      board,
      playerCount: 4,
      simulationConfig: config,
      strategyProfile: 'general',
      simulation: sim,
      selectedVertex: null,
      mode: 'simulate',
    });

    const restored = loadSession();
    assert(restored !== null, 'Saved session can be loaded');
    assert(restored!.board.hexes.length === board.hexes.length, 'Restored board hex count');
    assert(restored!.mode === 'simulate', 'Restored simulate mode');
    assert(restored!.simulation?.placements.length === 1, 'Restored placement progress');
    assert(
      restored!.simulation?.placements[0]?.vertexId === firstOpts[0].vertexId,
      'Restored same placed vertex'
    );
    assert(restored!.boardStory.islandName.length > 0, 'Restored session rebuilds board story');
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
