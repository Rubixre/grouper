import type {
  Board,
  PlacedSettlement,
  PlayerCount,
  ResourceWeights,
  SettlementScore,
} from './types';
import type { SimulationConfig } from './playerConfig';
import { getValidVertices, rankVertices } from './settlements';
import { rankFirstSettlementsWithLookahead } from './strategyAdvisor';
import { getPlacementOrder } from './draftOrder';
import { DEFAULT_RESOURCE_WEIGHTS } from './types';

export { getPlacementOrder } from './draftOrder';

/** @deprecated Use SimulationConfig.players instead */
export const PLAYER_COLORS = [
  '#c0392b',
  '#e8d4b0',
  '#2f5fa8',
  '#e6b800',
  '#1f8a7a',
  '#6b3a8c',
];

/** @deprecated Use SimulationConfig.players instead */
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
  config: SimulationConfig;
  placements: PlacedSettlement[];
  placementOrder: number[];
  currentStep: number;
  finished: boolean;
}

export function createSimulation(
  board: Board,
  config: SimulationConfig
): SimulationState {
  return {
    board,
    playerCount: config.players.length as PlayerCount,
    config,
    placements: [],
    placementOrder: getPlacementOrder(config.players.length as PlayerCount),
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

export function isHumanTurn(state: SimulationState): boolean {
  const player = currentPlayer(state);
  return player !== null && player === state.config.humanPlayerIndex;
}

/** Rangér gyldige plasseringer for spilleren som har tur */
export function getOptionsForCurrentTurn(
  state: SimulationState,
  weights?: ResourceWeights
): SettlementScore[] {
  const player = currentPlayer(state);
  if (player === null) return [];

  const resolvedWeights = weights ?? DEFAULT_RESOURCE_WEIGHTS;
  const ownCount = state.placements.filter((p) => p.player === player).length;

  // Første landsby: ranger etter forventet parscore (lookahead)
  if (ownCount === 0) {
    return rankFirstSettlementsWithLookahead(
      state.board,
      state.placements,
      player,
      state.playerCount,
      resolvedWeights
    );
  }

  return rankVertices(state.board, state.placements, resolvedWeights, player);
}

export function placeSettlement(
  state: SimulationState,
  vertexId: string
): SimulationState {
  const player = currentPlayer(state);
  if (player === null) return state;

  const valid = getValidVertices(state.placements);
  if (!valid.includes(vertexId)) return state;

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

/** Motspillere plasserer automatisk på toppvalg til det er din tur */
export function advanceToHumanTurn(
  state: SimulationState,
  weights?: ResourceWeights
): SimulationState {
  const human = state.config.humanPlayerIndex;
  let next = state;

  while (!next.finished && currentPlayer(next) !== human) {
    const options = getOptionsForCurrentTurn(next, weights);
    if (options.length === 0) break;
    next = placeSettlement(next, options[0].vertexId);
  }

  return next;
}

export function getPlayerSettlements(
  state: SimulationState,
  player: number
): PlacedSettlement[] {
  return state.placements.filter((p) => p.player === player);
}
