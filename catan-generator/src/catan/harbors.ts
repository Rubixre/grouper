import type { HarborDefinition, PlacedHarbor } from './types';
import type { BoardSize } from './boardLayout';
import type { CoastMeetCorner } from './mapping';
import { kLabelForGroupSlot } from './edgePieces';
import { getBoardMapping } from './mapping';
import { hexCorner, hexToPixel } from './hex';

/**
 * Havner festet til en fysisk kantbrikke (B1–B6) på en bestemt hex i triplet (offset 0–2).
 * H-noder nummereres H1–H30 med klokken rundt kanten; hver havn påvirker to påfølgende
 * noder på den aktuelle kanthexen.
 */
export const HARBOR_LAYOUT: HarborDefinition[] = [
  {
    id: 'harbor-g0-o0',
    name: '3:1 havn',
    harbor: { kind: 'generic' },
    pieceGroup: 0,
    hexOffset: 0,
  },
  {
    id: 'harbor-g0-o2',
    name: 'Ullhavn',
    harbor: { kind: 'resource', resource: 'sheep' },
    pieceGroup: 0,
    hexOffset: 2,
  },
  {
    id: 'harbor-g1-o1',
    name: '3:1 havn',
    harbor: { kind: 'generic' },
    pieceGroup: 1,
    hexOffset: 1,
  },
  {
    id: 'harbor-g2-o0',
    name: '3:1 havn',
    harbor: { kind: 'generic' },
    pieceGroup: 2,
    hexOffset: 0,
  },
  {
    id: 'harbor-g2-o2',
    name: 'Teglhavn',
    harbor: { kind: 'resource', resource: 'brick' },
    pieceGroup: 2,
    hexOffset: 2,
  },
  {
    id: 'harbor-g3-o1',
    name: 'Tømmerhavn',
    harbor: { kind: 'resource', resource: 'wood' },
    pieceGroup: 3,
    hexOffset: 1,
  },
  {
    id: 'harbor-g4-o0',
    name: '3:1 havn',
    harbor: { kind: 'generic' },
    pieceGroup: 4,
    hexOffset: 0,
  },
  {
    id: 'harbor-g4-o2',
    name: 'Kornhavn',
    harbor: { kind: 'resource', resource: 'wheat' },
    pieceGroup: 4,
    hexOffset: 2,
  },
  {
    id: 'harbor-g5-o1',
    name: 'Malmhavn',
    harbor: { kind: 'resource', resource: 'ore' },
    pieceGroup: 5,
    hexOffset: 1,
  },
];

/** H-noder på en kanthex, sortert H1→H30 langs kysten */
function hNodesOnEdgeHex(
  kLabel: string,
  mapping: ReturnType<typeof getBoardMapping>
): CoastMeetCorner[] {
  return mapping.coastCorners
    .filter((c) => c.edgeHexLabels.includes(kLabel))
    .sort((a, b) => a.index - b.index);
}

/**
 * Velg to påfølgende H-noder på kanthexen for havnens plassering.
 * - 2 noder: begge
 * - 3 noder: offset 0/2 = første par, offset 1 = siste par langs kysten
 */
function hNodesForEdgeHex(
  kLabel: string,
  hexOffset: number,
  mapping: ReturnType<typeof getBoardMapping>
): [CoastMeetCorner, CoastMeetCorner] {
  const sorted = hNodesOnEdgeHex(kLabel, mapping);

  if (sorted.length === 2) return [sorted[0], sorted[1]];
  if (sorted.length !== 3) {
    throw new Error(`Expected 2 or 3 H-nodes for ${kLabel}, got ${sorted.length}`);
  }

  if (hexOffset === 1) return [sorted[1], sorted[2]];
  return [sorted[0], sorted[1]];
}

/** Place harbors after edge-piece rotation (0–5 = 1/6 turn each) */
export function placeHarbors(
  rotation: number,
  hexSize = 1,
  size: BoardSize = 'base'
): PlacedHarbor[] {
  const mapping = getBoardMapping(size);

  return HARBOR_LAYOUT.map((definition) => {
    const kLabel =       kLabelForGroupSlot(
      definition.pieceGroup,
      definition.hexOffset,
      rotation,
      size
    );
    const edge = mapping.edgeByLabel.get(kLabel)!;
    const [nodeA, nodeB] = hNodesForEdgeHex(kLabel, definition.hexOffset, mapping);

    const pA = hexCorner(nodeA.anchor, nodeA.corner, hexSize);
    const pB = hexCorner(nodeB.anchor, nodeB.corner, hexSize);
    const midX = (pA.x + pB.x) / 2;
    const midY = (pA.y + pB.y) / 2;
    const center = hexToPixel(edge.coord, hexSize);
    const angle = Math.atan2(midY - center.y, midX - center.x);

    return {
      definition,
      pieceGroup: definition.pieceGroup,
      edgeHexLabel: kLabel,
      nodeLabels: [nodeA.label, nodeB.label] as [string, string],
      edgeCoord: edge.coord,
      nodeVertexIds: [nodeA.vertexId, nodeB.vertexId] as [string, string],
      angle,
    };
  });
}

/** @deprecated Use placeHarbors */
export function placeFixedHarbors(hexSize = 1): PlacedHarbor[] {
  return placeHarbors(0, hexSize);
}

export function getHarborsForVertex(
  vertexId: string,
  harbors: PlacedHarbor[]
): PlacedHarbor[] {
  return harbors.filter(
    (h) => h.nodeVertexIds[0] === vertexId || h.nodeVertexIds[1] === vertexId
  );
}

export function harborShortLabel(harbor: PlacedHarbor['definition']['harbor']): string {
  if (harbor.kind === 'generic') return '3:1';
  const map = { wood: 'Tømmer', brick: 'Tegl', sheep: 'Ull', wheat: 'Korn', ore: 'Malm' };
  return `2:1 ${map[harbor.resource]}`;
}

/** Expected H pairs at rotation 0 (for tests / docs) */
export const HARBOR_H_PAIRS_ROT0: Record<string, [string, string]> = {
  K18: ['H30', 'H1'],
  K2: ['H3', 'H4'],
  K4: ['H7', 'H8'],
  K6: ['H10', 'H11'],
  K8: ['H13', 'H14'],
  K10: ['H17', 'H18'],
  K12: ['H20', 'H21'],
  K14: ['H23', 'H24'],
  K16: ['H27', 'H28'],
};
