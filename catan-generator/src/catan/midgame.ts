import type { Board, PlacedSettlement, PlayerCount } from './types';
import type { SimulationState } from './simulator';
import {
  longestRoadHolder,
  ownedRoadKey,
  roadsFromPlacements,
  type OwnedRoad,
} from './roadGraph';
import { rankRobberTargets, type RobberHexAdvice } from './robberAdvice';
import { roadEdgeKey } from './roadPlan';

export interface MidgameState {
  roads: OwnedRoad[];
  robberHexKey: string | null;
  longestRoadPlayer: number | null;
}

export function createMidgameState(simulation: SimulationState): MidgameState {
  const roads = roadsFromPlacements(simulation.placements);
  const { holder } = longestRoadHolder(
    roads,
    simulation.placements,
    simulation.playerCount,
    null
  );
  return {
    roads,
    robberHexKey: null,
    longestRoadPlayer: holder,
  };
}

export function refreshLongestRoad(
  midgame: MidgameState,
  placements: PlacedSettlement[],
  playerCount: PlayerCount
): MidgameState {
  const { holder } = longestRoadHolder(
    midgame.roads,
    placements,
    playerCount,
    midgame.longestRoadPlayer
  );
  return { ...midgame, longestRoadPlayer: holder };
}

export function upgradeToCity(
  placements: PlacedSettlement[],
  vertexId: string,
  player: number
): PlacedSettlement[] {
  return placements.map((p) =>
    p.vertexId === vertexId && p.player === player && !p.isCity
      ? { ...p, isCity: true }
      : p
  );
}

export interface VictoryPointRow {
  player: number;
  settlements: number;
  cities: number;
  buildingVp: number;
  longestRoadBonus: number;
  totalVp: number;
}

export function computeVictoryPoints(
  placements: PlacedSettlement[],
  playerCount: PlayerCount,
  longestRoadPlayer: number | null
): VictoryPointRow[] {
  const rows: VictoryPointRow[] = [];
  for (let player = 0; player < playerCount; player++) {
    const mine = placements.filter((p) => p.player === player);
    const cities = mine.filter((p) => p.isCity).length;
    const settlements = mine.length - cities;
    const buildingVp = settlements * 1 + cities * 2;
    const longestRoadBonus = longestRoadPlayer === player ? 2 : 0;
    rows.push({
      player,
      settlements,
      cities,
      buildingVp,
      longestRoadBonus,
      totalVp: buildingVp + longestRoadBonus,
    });
  }
  return rows.sort((a, b) => b.totalVp - a.totalVp || a.player - b.player);
}

export function topRobberAdvice(
  board: Board,
  placements: PlacedSettlement[],
  selfPlayer: number,
  robberHexKey: string | null,
  limit = 5
): RobberHexAdvice[] {
  return rankRobberTargets(board, placements, selfPlayer, robberHexKey).slice(
    0,
    limit
  );
}

export function addMidgameRoad(
  midgame: MidgameState,
  fromVertexId: string,
  toVertexId: string,
  player: number,
  placements: PlacedSettlement[],
  playerCount: PlayerCount
): MidgameState {
  const key = roadEdgeKey(fromVertexId, toVertexId);
  const exists = midgame.roads.some((r) => ownedRoadKey(r) === key);
  if (exists) return midgame;
  const roads = [
    ...midgame.roads,
    { fromVertexId, toVertexId, player },
  ];
  return refreshLongestRoad({ ...midgame, roads }, placements, playerCount);
}
