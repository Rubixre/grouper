import type { PlayerCount } from './types';

/** Spillernes valgfrie farger (Catan-typiske) */
export const PLAYER_COLOR_PRESETS = [
  '#c0392b', // Rød
  '#e8d4b0', // Lys beige
  '#1a3a6e', // Mørk blå
  '#c9972a', // Okergul
  '#1f8a7a', // Turkis-grønn
  '#4a235a', // Mørk lilla
] as const;

export const DEFAULT_PLAYER_COLORS = PLAYER_COLOR_PRESETS;

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
