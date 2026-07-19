import type { Board, BoardSize, GeneratorSettings, PlayerCount } from './types';
import { DEFAULT_SETTINGS } from './types';
import {
  clearBoardCaches,
  setBoardSize as setActiveBoardSize,
} from './boardLayout';
import { resetBoardMapping } from './mapping';
import { resetVertices } from './settlements';
import {
  createSimulationConfig,
  type SimulationConfig,
} from './playerConfig';
import type { SimulationState } from './simulator';
import { isStrategyChoice, type StrategyChoice } from './resourceWeights';
import { createBoardStory, type BoardStory } from './boardStory';

const STORAGE_KEY = 'catan-generator-session-v1';

export type AppMode = 'view' | 'simulate';

export interface PersistedSession {
  version: 1;
  settings: GeneratorSettings;
  boardSize: BoardSize;
  board: Board;
  playerCount: PlayerCount;
  simulationConfig: SimulationConfig;
  /** Ressursprofil eller havnmodus */
  strategyChoice: StrategyChoice;
  simulation: SimulationState | null;
  selectedVertex: string | null;
  mode: AppMode;
}

export interface RestoredSession {
  settings: GeneratorSettings;
  boardSize: BoardSize;
  board: Board;
  boardStory: BoardStory;
  playerCount: PlayerCount;
  simulationConfig: SimulationConfig;
  strategyChoice: StrategyChoice;
  simulation: SimulationState | null;
  selectedVertex: string | null;
  mode: AppMode;
}

/** Aktiver layout-cacher for et lagret brett (hjørner, kartlegging, osv.) */
export function activateBoardCaches(boardSize: BoardSize): void {
  setActiveBoardSize(boardSize);
  clearBoardCaches();
  resetVertices();
  resetBoardMapping();
}

function isBoardSize(value: unknown): value is BoardSize {
  return value === 'base' || value === 'extension56';
}

function isPlayerCount(value: unknown): value is PlayerCount {
  return value === 2 || value === 3 || value === 4 || value === 5 || value === 6;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeSettings(raw: unknown): GeneratorSettings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS };
  return {
    allowAdjacent6And8: Boolean(raw.allowAdjacent6And8 ?? DEFAULT_SETTINGS.allowAdjacent6And8),
    allowAdjacent2And12: Boolean(raw.allowAdjacent2And12 ?? DEFAULT_SETTINGS.allowAdjacent2And12),
    allowAdjacentSameResource: Boolean(
      raw.allowAdjacentSameResource ?? DEFAULT_SETTINGS.allowAdjacentSameResource
    ),
    allowAdjacentSameNumber: Boolean(
      raw.allowAdjacentSameNumber ?? DEFAULT_SETTINGS.allowAdjacentSameNumber
    ),
    randomHarbors: Boolean(raw.randomHarbors ?? DEFAULT_SETTINGS.randomHarbors),
    bonanzaBoard: Boolean(raw.bonanzaBoard ?? DEFAULT_SETTINGS.bonanzaBoard),
  };
}

function sanitizeSimulationConfig(raw: unknown, playerCount: PlayerCount): SimulationConfig {
  const fallback = createSimulationConfig(playerCount, 0);
  if (!isObject(raw) || !Array.isArray(raw.players)) return fallback;

  const players = raw.players.slice(0, playerCount).map((p, i) => {
    if (!isObject(p)) return fallback.players[i]!;
    return {
      name: typeof p.name === 'string' && p.name.trim() ? p.name : fallback.players[i]!.name,
      color: typeof p.color === 'string' && p.color ? p.color : fallback.players[i]!.color,
    };
  });

  while (players.length < playerCount) {
    players.push(fallback.players[players.length]!);
  }

  const human =
    typeof raw.humanPlayerIndex === 'number' &&
    raw.humanPlayerIndex >= 0 &&
    raw.humanPlayerIndex < playerCount
      ? raw.humanPlayerIndex
      : 0;

  return { players, humanPlayerIndex: human };
}

function sanitizeBoard(raw: unknown): Board | null {
  if (!isObject(raw) || !isBoardSize(raw.boardSize) || !Array.isArray(raw.hexes)) return null;
  if (raw.hexes.length === 0) return null;
  return raw as unknown as Board;
}

function sanitizeSimulation(
  raw: unknown,
  board: Board,
  config: SimulationConfig,
  playerCount: PlayerCount
): SimulationState | null {
  if (!isObject(raw)) return null;
  if (!Array.isArray(raw.placements) || !Array.isArray(raw.placementOrder)) return null;
  if (typeof raw.currentStep !== 'number' || typeof raw.finished !== 'boolean') return null;

  return {
    board,
    playerCount,
    config,
    placements: raw.placements as SimulationState['placements'],
    placementOrder: raw.placementOrder as number[],
    currentStep: Math.max(0, Math.min(raw.currentStep, raw.placementOrder.length)),
    finished: Boolean(raw.finished),
  };
}

export function loadSession(): RestoredSession | null {
  try {
    const rawText = localStorage.getItem(STORAGE_KEY);
    if (!rawText) return null;
    const parsed: unknown = JSON.parse(rawText);
    if (!isObject(parsed) || parsed.version !== 1) return null;

    const board = sanitizeBoard(parsed.board);
    if (!board) return null;

    const boardSize = isBoardSize(parsed.boardSize) ? parsed.boardSize : board.boardSize;
    const playerCount = isPlayerCount(parsed.playerCount) ? parsed.playerCount : 4;
    const settings = sanitizeSettings(parsed.settings);
    const simulationConfig = sanitizeSimulationConfig(parsed.simulationConfig, playerCount);
    const rawChoice =
      typeof parsed.strategyChoice === 'string'
        ? parsed.strategyChoice
        : typeof parsed.strategyProfile === 'string'
          ? parsed.strategyProfile
          : 'general';
    const strategyChoice: StrategyChoice = isStrategyChoice(rawChoice)
      ? rawChoice
      : 'general';
    const selectedVertex =
      typeof parsed.selectedVertex === 'string' ? parsed.selectedVertex : null;
    const simulation = sanitizeSimulation(
      parsed.simulation,
      board,
      simulationConfig,
      playerCount
    );

    activateBoardCaches(boardSize);

    const restoredMode: AppMode =
      simulation !== null && parsed.mode === 'simulate' ? 'simulate' : 'view';

    return {
      settings,
      boardSize,
      board,
      boardStory: createBoardStory(board),
      playerCount,
      simulationConfig,
      strategyChoice,
      simulation,
      selectedVertex: restoredMode === 'simulate' ? selectedVertex : null,
      mode: restoredMode,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: PersistedSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Quota / private mode — ignore; live session still works
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
