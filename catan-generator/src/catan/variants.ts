import type { BoardSize } from './types';

/**
 * Board-game rule packs. v1.0 ships base + extension56.
 * Future packs (seafarers-like, cities-like) plug in here without scattering ifs.
 */

export type BoardVariantId = 'base' | 'extension56' | 'seafarersLite' | 'citiesLite';

export interface BoardVariantDefinition {
  id: BoardVariantId;
  /** Maps to existing board layout size when implemented */
  boardSize: BoardSize | null;
  /** Available in App Store v1.0 */
  shippedInV1: boolean;
  /** i18n key under variants.* */
  labelKey: string;
  descriptionKey: string;
}

export const BOARD_VARIANTS: BoardVariantDefinition[] = [
  {
    id: 'base',
    boardSize: 'base',
    shippedInV1: true,
    labelKey: 'variants.base',
    descriptionKey: 'variants.baseDesc',
  },
  {
    id: 'extension56',
    boardSize: 'extension56',
    shippedInV1: true,
    labelKey: 'variants.extension56',
    descriptionKey: 'variants.extension56Desc',
  },
  {
    id: 'seafarersLite',
    boardSize: null,
    shippedInV1: false,
    labelKey: 'variants.seafarersLite',
    descriptionKey: 'variants.seafarersLiteDesc',
  },
  {
    id: 'citiesLite',
    boardSize: null,
    shippedInV1: false,
    labelKey: 'variants.citiesLite',
    descriptionKey: 'variants.citiesLiteDesc',
  },
];

export function variantForBoardSize(size: BoardSize): BoardVariantDefinition {
  return (
    BOARD_VARIANTS.find((v) => v.boardSize === size && v.shippedInV1) ??
    BOARD_VARIANTS[0]!
  );
}

export function shippedVariants(): BoardVariantDefinition[] {
  return BOARD_VARIANTS.filter((v) => v.shippedInV1);
}

export function upcomingVariants(): BoardVariantDefinition[] {
  return BOARD_VARIANTS.filter((v) => !v.shippedInV1);
}
