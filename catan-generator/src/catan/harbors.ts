import type { HarborPiece, PlacedHarborPiece } from './types';
import {
  COAST_SLOT_COUNT,
  HARBOR_PIECE_COUNT,
  harborSlotsForPiece,
} from './boardLayout';

/** Six unique harbor frame pieces for the base game */
export const HARBOR_PIECES: HarborPiece[] = [
  { id: 'h0', name: 'Generisk havn A', harbor: { kind: 'generic' }, slotSpan: 3 },
  { id: 'h1', name: 'Generisk havn B', harbor: { kind: 'generic' }, slotSpan: 3 },
  { id: 'h2', name: 'Tømmerhavn', harbor: { kind: 'resource', resource: 'wood' }, slotSpan: 3 },
  { id: 'h3', name: 'Teglhavn', harbor: { kind: 'resource', resource: 'brick' }, slotSpan: 3 },
  { id: 'h4', name: 'Ullhavn', harbor: { kind: 'resource', resource: 'sheep' }, slotSpan: 3 },
  { id: 'h5', name: 'Kornhavn', harbor: { kind: 'resource', resource: 'wheat' }, slotSpan: 3 },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Place 6 harbor pieces (3 coast slots each) around the 18-slot ring.
 * Pieces move as fixed triplets; whole assembly rotates to one of 6 orientations.
 */
export function placeHarborPieces(): {
  harbors: PlacedHarborPiece[];
  rotation: number;
} {
  const rotation = Math.floor(Math.random() * HARBOR_PIECE_COUNT);
  const shuffledPieces = shuffle(HARBOR_PIECES);

  const harbors: PlacedHarborPiece[] = shuffledPieces.map((piece, i) => {
    const slotIndex = ((rotation + i) * 3) % COAST_SLOT_COUNT;
    return { piece, startSlot: slotIndex };
  });

  return { harbors, rotation };
}

/** Check if a coast slot index is covered by any placed harbor piece */
export function getHarborAtSlot(
  slotIndex: number,
  harbors: PlacedHarborPiece[]
): PlacedHarborPiece | null {
  for (const h of harbors) {
    if (harborSlotsForPiece(h.startSlot).includes(slotIndex)) {
      return h;
    }
  }
  return null;
}

/** Coast slot indices adjacent to a hex coord (for harbor bonus on settlements) */
export function coastSlotsForHex(
  hexCoord: { q: number; r: number },
  coastSlots: { index: number; hex: { q: number; r: number }; edge: number }[]
): number[] {
  return coastSlots
    .filter((s) => s.hex.q === hexCoord.q && s.hex.r === hexCoord.r)
    .map((s) => s.index);
}
