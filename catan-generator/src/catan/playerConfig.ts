import type { PlayerCount } from './types';

export const DEFAULT_PLAYER_COLORS = [
  '#e74c3c',
  '#3498db',
  '#f39c12',
  '#2ecc71',
  '#9b59b6',
  '#1abc9c',
] as const;

export const PLAYER_COLOR_PRESETS = [
  '#e74c3c',
  '#3498db',
  '#f39c12',
  '#2ecc71',
  '#9b59b6',
  '#1abc9c',
  '#e91e63',
  '#00bcd4',
  '#ff5722',
  '#795548',
] as const;

export interface PlayerConfig {
  name: string;
  color: string;
}

export interface SimulationConfig {
  players: PlayerConfig[];
  humanPlayerIndex: number;
}

export function defaultPlayerName(index: number): string {
  return `Spiller ${index + 1}`;
}

export function createDefaultPlayers(count: PlayerCount): PlayerConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    name: defaultPlayerName(i),
    color: DEFAULT_PLAYER_COLORS[i] ?? DEFAULT_PLAYER_COLORS[0],
  }));
}

export function createSimulationConfig(
  count: PlayerCount,
  humanPlayerIndex = 0
): SimulationConfig {
  return {
    players: createDefaultPlayers(count),
    humanPlayerIndex: Math.min(Math.max(0, humanPlayerIndex), count - 1),
  };
}

export function getPlayerConfig(
  config: SimulationConfig,
  playerIndex: number
): PlayerConfig {
  return (
    config.players[playerIndex] ?? {
      name: defaultPlayerName(playerIndex),
      color: DEFAULT_PLAYER_COLORS[playerIndex] ?? DEFAULT_PLAYER_COLORS[0],
    }
  );
}

export function getPlayerColor(config: SimulationConfig, playerIndex: number): string {
  return getPlayerConfig(config, playerIndex).color;
}

export function getPlayerName(config: SimulationConfig, playerIndex: number): string {
  return getPlayerConfig(config, playerIndex).name;
}
