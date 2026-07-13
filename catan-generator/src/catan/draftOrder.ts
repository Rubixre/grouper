import type { PlayerCount } from './types';

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
