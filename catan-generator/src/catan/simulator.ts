import type {
  Board,
  PlacedSettlement,
  PlayerCount,
  ResourceWeights,
  SettlementScore,
} from './types';
import { rankVertices } from './settlements';

/** Snake-draft placement order for initial settlements (2 per player) */
export function getPlacementOrder(playerCount: PlayerCount): number[] {
  switch (playerCount) {
    case 2:
      return [0, 1, 1, 0];
    case 3:
      return [0, 1, 2, 2, 1, 0];
    case 4:
      return [0, 1, 2, 3, 3, 2, 1, 0];
  }
}

export const PLAYER_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#2ecc71'];
export const PLAYER_NAMES = ['Spiller 1', 'Spiller 2', 'Spiller 3', 'Spiller 4'];

export interface SimulationState {
  board: Board;
  playerCount: PlayerCount;
  placements: PlacedSettlement[];
  placementOrder: number[];
  currentStep: number;
  humanPlayer: number;
  finished: boolean;
}

export function createSimulation(
  board: Board,
  playerCount: PlayerCount,
  humanPlayer = 0
): SimulationState {
  return {
    board,
    playerCount,
    placements: [],
    placementOrder: getPlacementOrder(playerCount),
    currentStep: 0,
    humanPlayer,
    finished: false,
  };
}

export function currentPlayer(state: SimulationState): number | null {
  if (state.finished || state.currentStep >= state.placementOrder.length) {
    return null;
  }
  return state.placementOrder[state.currentStep];
}

export function isHumanTurn(state: SimulationState): boolean {
  const p = currentPlayer(state);
  return p !== null && p === state.humanPlayer;
}

export function getOptionsForCurrentTurn(
  state: SimulationState,
  weights?: ResourceWeights
): SettlementScore[] {
  return rankVertices(state.board, state.placements, weights);
}

/** Simple greedy AI: pick highest-scoring valid vertex */
export function aiPickVertex(
  state: SimulationState,
  weights?: ResourceWeights
): string | null {
  const options = getOptionsForCurrentTurn(state, weights);
  return options[0]?.vertexId ?? null;
}

export function placeSettlement(
  state: SimulationState,
  vertexId: string
): SimulationState {
  const player = currentPlayer(state);
  if (player === null) return state;

  const placements: PlacedSettlement[] = [
    ...state.placements,
    { vertexId, player, isCity: false },
  ];

  const nextStep = state.currentStep + 1;
  const finished = nextStep >= state.placementOrder.length;

  return {
    ...state,
    placements,
    currentStep: nextStep,
    finished,
  };
}

/** Auto-play AI turns until human's turn or finished */
export function advanceToHumanOrEnd(
  state: SimulationState,
  weights?: ResourceWeights
): SimulationState {
  let s = state;
  while (!s.finished && !isHumanTurn(s)) {
    const pick = aiPickVertex(s, weights);
    if (!pick) break;
    s = placeSettlement(s, pick);
  }
  return s;
}

export function getPlayerSettlements(
  state: SimulationState,
  player: number
): PlacedSettlement[] {
  return state.placements.filter((p) => p.player === player);
}
