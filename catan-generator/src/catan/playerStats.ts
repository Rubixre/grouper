import type { Board, PlacedSettlement } from './types';
import { getHarborsForVertex, harborShortLabel } from './harbors';
import { getVertices } from './settlements';
import type { SimulationState } from './simulator';
import { PLAYER_NAMES } from './simulator';

/** Terningsannsynlighet per tall (to terninger) */
export const DICE_ROLL_PROB: Record<number, number> = {
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36,
};

export const PROD_RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type ProdResource = (typeof PROD_RESOURCES)[number];

export const RESOURCE_LABELS: Record<ProdResource, string> = {
  wood: 'Tømmer',
  brick: 'Tegl',
  sheep: 'Ull',
  wheat: 'Korn',
  ore: 'Malm',
};

export const RESOURCE_COLORS: Record<ProdResource, string> = {
  wood: '#2d6a4f',
  brick: '#c1440e',
  sheep: '#95d5b2',
  wheat: '#f4d35e',
  ore: '#6c757d',
};

export interface ResourceBreakdown {
  byResource: Record<ProdResource, number>;
  byNumber: Record<number, number>;
  totalPerRoll: number;
  resourceCount: number;
  hotNumberCount: number;
}

export interface PlayerHarborAccess {
  name: string;
  ratio: string;
  fromSettlement: 1 | 2;
}

export interface PlayerStats {
  player: number;
  name: string;
  firstSettlement: ResourceBreakdown | null;
  secondSettlement: ResourceBreakdown | null;
  combined: ResourceBreakdown;
  startingResources: Record<ProdResource, number>;
  harbors: PlayerHarborAccess[];
  shareOfTable: number;
}

export interface SimulationSummary {
  players: PlayerStats[];
  tableTotalPerRoll: number;
  resourceTotals: Record<ProdResource, number>;
}

function emptyResourceRecord(): Record<ProdResource, number> {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

function vertexProduction(vertexId: string, board: Board): ResourceBreakdown {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId);
  const byResource = emptyResourceRecord();
  const byNumber: Record<number, number> = {};
  let totalPerRoll = 0;
  const resourceTypes = new Set<ProdResource>();
  let hotNumberCount = 0;

  if (!vertex) {
    return {
      byResource,
      byNumber,
      totalPerRoll: 0,
      resourceCount: 0,
      hotNumberCount: 0,
    };
  }

  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (
      !tile ||
      tile.kind !== 'land' ||
      !tile.resource ||
      tile.resource === 'desert' ||
      !tile.number
    ) {
      continue;
    }

    const resource = tile.resource as ProdResource;
    const prob = DICE_ROLL_PROB[tile.number] ?? 0;

    byResource[resource] += prob;
    byNumber[tile.number] = (byNumber[tile.number] ?? 0) + prob;
    totalPerRoll += prob;
    resourceTypes.add(resource);
    if (tile.number === 6 || tile.number === 8) hotNumberCount++;
  }

  return {
    byResource,
    byNumber,
    totalPerRoll,
    resourceCount: resourceTypes.size,
    hotNumberCount,
  };
}

function combineBreakdowns(a: ResourceBreakdown, b: ResourceBreakdown): ResourceBreakdown {
  const byResource = emptyResourceRecord();
  for (const r of PROD_RESOURCES) {
    byResource[r] = a.byResource[r] + b.byResource[r];
  }

  const byNumber: Record<number, number> = { ...a.byNumber };
  for (const [num, val] of Object.entries(b.byNumber)) {
    const n = Number(num);
    byNumber[n] = (byNumber[n] ?? 0) + val;
  }

  return {
    byResource,
    byNumber,
    totalPerRoll: a.totalPerRoll + b.totalPerRoll,
    resourceCount: PROD_RESOURCES.filter((r) => byResource[r] > 0).length,
    hotNumberCount: a.hotNumberCount + b.hotNumberCount,
  };
}

function emptyBreakdown(): ResourceBreakdown {
  return {
    byResource: emptyResourceRecord(),
    byNumber: {},
    totalPerRoll: 0,
    resourceCount: 0,
    hotNumberCount: 0,
  };
}

function playerSettlementsInOrder(
  placements: PlacedSettlement[],
  player: number
): PlacedSettlement[] {
  return placements.filter((p) => p.player === player);
}

function harborsForPlayer(
  settlements: PlacedSettlement[],
  board: Board
): PlayerHarborAccess[] {
  const seen = new Set<string>();
  const result: PlayerHarborAccess[] = [];

  settlements.forEach((placement, index) => {
    const settlementNum = (index + 1) as 1 | 2;
    for (const h of getHarborsForVertex(placement.vertexId, board.harbors)) {
      const key = `${h.definition.id}:${placement.vertexId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ratio = harborShortLabel(h.definition.harbor);
      result.push({
        name: h.definition.name,
        ratio,
        fromSettlement: settlementNum,
      });
    }
  });

  return result;
}

export function computePlayerStats(
  state: SimulationState,
  player: number
): PlayerStats {
  const settlements = playerSettlementsInOrder(state.placements, player);
  const first = settlements[0]
    ? vertexProduction(settlements[0].vertexId, state.board)
    : null;
  const second = settlements[1]
    ? vertexProduction(settlements[1].vertexId, state.board)
    : null;

  let combined = emptyBreakdown();
  if (first) combined = first;
  if (second) combined = second ? combineBreakdowns(combined, second) : combined;

  const startingResources = second ? { ...second.byResource } : emptyResourceRecord();

  return {
    player,
    name: PLAYER_NAMES[player] ?? `Spiller ${player + 1}`,
    firstSettlement: first,
    secondSettlement: second,
    combined,
    startingResources,
    harbors: harborsForPlayer(settlements, state.board),
    shareOfTable: 0,
  };
}

export function computeSimulationSummary(state: SimulationState): SimulationSummary {
  const players: PlayerStats[] = [];
  for (let p = 0; p < state.playerCount; p++) {
    players.push(computePlayerStats(state, p));
  }

  const tableTotalPerRoll = players.reduce((s, p) => s + p.combined.totalPerRoll, 0);
  const resourceTotals = emptyResourceRecord();
  for (const p of players) {
    for (const r of PROD_RESOURCES) {
      resourceTotals[r] += p.combined.byResource[r];
    }
  }

  for (const p of players) {
    p.shareOfTable =
      tableTotalPerRoll > 0 ? p.combined.totalPerRoll / tableTotalPerRoll : 0;
  }

  return { players, tableTotalPerRoll, resourceTotals };
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)} %`;
}

export function formatPerRoll(value: number, digits = 3): string {
  return value.toFixed(digits);
}
