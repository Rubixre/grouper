import type { BoardMapping, CoastMeetCorner } from './mapping';

export type HarborPiecePort =
  | { kind: 'triple'; offset: 0 | 1 | 2 }
  | { kind: 'single' };

/** H-noder på en kanthex, sortert H1→Hn langs kysten */
export function hNodesOnEdgeHex(
  kLabel: string,
  mapping: BoardMapping
): CoastMeetCorner[] {
  return mapping.coastCorners
    .filter((c) => c.edgeHexLabels.includes(kLabel))
    .sort((a, b) => a.index - b.index);
}

/**
 * Velg havnport (to påfølgende H-noder) på en kanthex.
 *
 * Kanthexen fungerer som en fysisk brikke: når en havnbrikke plasseres på en
 * K-posisjon, må porten «roteres» slik at den treffer land siden av hexen –
 * uavhengig av hvilken brikkemal (B1–B10) som ligger der.
 *
 * - 2 noder på K: begge danner porten
 * - 3 noder, trippel offset 1 (midt): siste par langs kysten
 * - 3 noder, trippel offset 0/2 (ende): første par langs kysten
 * - 3 noder, enkelt-hex plassering: siste par (mot land)
 */
export function harborPortNodes(
  kLabel: string,
  port: HarborPiecePort,
  mapping: BoardMapping
): [CoastMeetCorner, CoastMeetCorner] {
  const sorted = hNodesOnEdgeHex(kLabel, mapping);

  if (sorted.length === 2) {
    return [sorted[0], sorted[1]];
  }
  if (sorted.length !== 3) {
    throw new Error(`Expected 2 or 3 H-nodes for ${kLabel}, got ${sorted.length}`);
  }

  if (port.kind === 'single' || port.offset === 1) {
    return [sorted[1], sorted[2]];
  }

  return [sorted[0], sorted[1]];
}

export function harborPortNodeLabels(
  kLabel: string,
  port: HarborPiecePort,
  mapping: BoardMapping
): [string, string] {
  const [a, b] = harborPortNodes(kLabel, port, mapping);
  return [a.label, b.label];
}
