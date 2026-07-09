import type {
  Board,
  PlacedSettlement,
  PlayerCount,
  SettlementScore,
} from './types';
import { DEFAULT_RESOURCE_WEIGHTS } from './types';
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
    case 5:
      return [0, 1, 2, 3, 4, 4, 3, 2, 1, 0];
    case 6:
      return [0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0];
  }
}

export const PLAYER_COLORS = [
  '#e74c3c',
  '#3498db',
  '#f39c12',
  '#2ecc71',
  '#9b59b6',
  '#1abc9c',
];
export const PLAYER_NAMES = [
  'Spiller 1',
  'Spiller 2',
  'Spiller 3',
  'Spiller 4',
  'Spiller 5',
  'Spiller 6',
];

export interface SimulationState {
  board: Board;
  playerCount: PlayerCount;
  placements: PlacedSettlement[];
  placementOrder: number[];
  currentStep: number;
  finished: boolean;
}

export function createSimulation(
  board: Board,
  playerCount: PlayerCount
): SimulationState {
  return {
    board,
    playerCount,
    placements: [],
    placementOrder: getPlacementOrder(playerCount),
    currentStep: 0,
    finished: false,
  };
}

export function currentPlayer(state: SimulationState): number | null {
  if (state.finished || state.currentStep >= state.placementOrder.length) {
    return null;
  }
  return state.placementOrder[state.currentStep];
}

/** Rangér gyldige plasseringer for spilleren som har tur */
export function getOptionsForCurrentTurn(
  state: SimulationState
): SettlementScore[] {
  const player = currentPlayer(state);
  if (player === null) return [];
  return rankVertices(
    state.board,
    state.placements,
    DEFAULT_RESOURCE_WEIGHTS,
    player
  );
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

export function getPlayerSettlements(
  state: SimulationState,
  player: number
): PlacedSettlement[] {
  return state.placements.filter((p) => p.player === player);
}
