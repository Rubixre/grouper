import type { BoardSize } from './boardLayout';
import type { HarborDefinition, HarborType, HexCoord, PlacedHarbor } from './types';
import { coordKey } from './hex';
import { getBoardMapping } from './mapping';
import { hexCorner, hexToPixel } from './hex';

/** Permutasjon av fysiske plasseringer for utvidelsens kantbrikker */
export interface ExtensionEdgeOrder {
  /** Indeks i EXTENSION_TRIPLE_TEMPLATES for hver triple-slot */
  triple: number[];
  /** Indeks i EXTENSION_SINGLE_TEMPLATES for hver single-slot */
  single: number[];
}

export const EXTENSION_IDENTITY_ORDER: ExtensionEdgeOrder = {
  triple: [0, 1, 2, 3, 4, 5],
  single: [0, 1, 2, 3],
};

/** Faste K-områder for 3-hex brikker (grunnposisjon rot 0) */
export const EXTENSION_TRIPLE_SLOTS: [string, string, string][] = [
  ['K1', 'K2', 'K3'],
  ['K4', 'K5', 'K6'],
  ['K8', 'K9', 'K10'],
  ['K12', 'K13', 'K14'],
  ['K15', 'K16', 'K17'],
  ['K19', 'K20', 'K21'],
];

/** Faste K-posisjoner for 1-hex brikker */
export const EXTENSION_SINGLE_SLOTS = ['K7', 'K11', 'K18', 'K22'] as const;

/** Faste H-nodepar for havner på enkelt-hex K-plasseringer */
export const EXTENSION_SINGLE_HARBOR_NODES: Partial<
  Record<(typeof EXTENSION_SINGLE_SLOTS)[number], [string, string]>
> = {
  K11: ['H18', 'H19'],
  K18: ['H30', 'H31'],
};

interface HarborOnPiece {
  name: string;
  harbor: HarborType;
  /** 0–2 innen trippel; 0 for enkelt-hex */
  hexOffset: number;
}

interface TriplePieceTemplate {
  pieceNumber: number;
  label: string;
  harbors: HarborOnPiece[];
}

interface SinglePieceTemplate {
  pieceNumber: number;
  label: string;
  harbors: HarborOnPiece[];
}

/** Innhold på 3-hex brikker – samme havner som grunnspillet der det er angitt */
export const EXTENSION_TRIPLE_TEMPLATES: TriplePieceTemplate[] = [
  {
    pieceNumber: 1,
    label: 'B1',
    harbors: [
      { name: '3:1 havn', harbor: { kind: 'generic' }, hexOffset: 0 },
      { name: 'Ullhavn', harbor: { kind: 'resource', resource: 'sheep' }, hexOffset: 2 },
    ],
  },
  {
    pieceNumber: 2,
    label: 'B2',
    harbors: [{ name: '3:1 havn', harbor: { kind: 'generic' }, hexOffset: 1 }],
  },
  {
    pieceNumber: 4,
    label: 'B4',
    harbors: [
      { name: '3:1 havn', harbor: { kind: 'generic' }, hexOffset: 0 },
      { name: 'Teglhavn', harbor: { kind: 'resource', resource: 'brick' }, hexOffset: 2 },
    ],
  },
  {
    pieceNumber: 6,
    label: 'B6',
    harbors: [
      { name: 'Tømmerhavn', harbor: { kind: 'resource', resource: 'wood' }, hexOffset: 1 },
    ],
  },
  {
    pieceNumber: 7,
    label: 'B7',
    harbors: [
      { name: '3:1 havn', harbor: { kind: 'generic' }, hexOffset: 0 },
      { name: 'Kornhavn', harbor: { kind: 'resource', resource: 'wheat' }, hexOffset: 2 },
    ],
  },
  {
    pieceNumber: 9,
    label: 'B9',
    harbors: [
      { name: 'Malmhavn', harbor: { kind: 'resource', resource: 'ore' }, hexOffset: 1 },
    ],
  },
];

/** Innhold på 1-hex brikker */
export const EXTENSION_SINGLE_TEMPLATES: SinglePieceTemplate[] = [
  { pieceNumber: 3, label: 'B3', harbors: [] },
  {
    pieceNumber: 5,
    label: 'B5',
    harbors: [
      { name: 'Ullhavn', harbor: { kind: 'resource', resource: 'sheep' }, hexOffset: 0 },
    ],
  },
  {
    pieceNumber: 8,
    label: 'B8',
    harbors: [{ name: '3:1 havn', harbor: { kind: 'generic' }, hexOffset: 0 }],
  },
  { pieceNumber: 10, label: 'B10', harbors: [] },
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hNodesOnEdgeHex(kLabel: string, mapping: ReturnType<typeof getBoardMapping>) {
  return mapping.coastCorners
    .filter((c) => c.edgeHexLabels.includes(kLabel))
    .sort((a, b) => a.index - b.index);
}

function hNodesForEdgeHex(
  kLabel: string,
  hexOffset: number,
  mapping: ReturnType<typeof getBoardMapping>
) {
  const sorted = hNodesOnEdgeHex(kLabel, mapping);
  if (sorted.length === 2) return [sorted[0], sorted[1]] as const;
  if (sorted.length !== 3) {
    throw new Error(`Expected 2 or 3 H-nodes for ${kLabel}, got ${sorted.length}`);
  }
  if (hexOffset === 1) return [sorted[1], sorted[2]] as const;
  return [sorted[0], sorted[1]] as const;
}

/** Havn på 1-hex brikke: noden rett før første H på hexen + den første H-noden */
function hNodesForSingleEdgeHex(
  kLabel: string,
  mapping: ReturnType<typeof getBoardMapping>
) {
  const fixed = EXTENSION_SINGLE_HARBOR_NODES[kLabel as (typeof EXTENSION_SINGLE_SLOTS)[number]];
  if (fixed) {
    const nodeA = mapping.cornerByLabel.get(fixed[0]);
    const nodeB = mapping.cornerByLabel.get(fixed[1]);
    if (!nodeA || !nodeB) {
      throw new Error(`Missing coast nodes ${fixed.join(',')} for ${kLabel}`);
    }
    return [nodeA, nodeB] as const;
  }

  const sorted = hNodesOnEdgeHex(kLabel, mapping);
  if (sorted.length < 2) {
    throw new Error(`Expected at least 2 H-nodes for single ${kLabel}, got ${sorted.length}`);
  }
  const first = sorted[0];
  const coastCount = mapping.coastCorners.length;
  const prevIndex = first.index === 1 ? coastCount : first.index - 1;
  const prev = mapping.coastCorners[prevIndex - 1];
  return [prev, first] as const;
}

function harborDefinition(
  template: TriplePieceTemplate | SinglePieceTemplate,
  harbor: HarborOnPiece
): HarborDefinition {
  return {
    id: `ext-${template.label}-o${harbor.hexOffset}-${harbor.harbor.kind === 'generic' ? 'g' : harbor.harbor.resource}`,
    name: harbor.name,
    harbor: harbor.harbor,
    pieceGroup: template.pieceNumber - 1,
    hexOffset: harbor.hexOffset,
  };
}

export function countHarborNodeOverlaps(harbors: PlacedHarbor[]): number {
  const seen = new Set<string>();
  let overlaps = 0;
  for (const h of harbors) {
    for (const v of h.nodeVertexIds) {
      if (seen.has(v)) overlaps++;
      else seen.add(v);
    }
  }
  return overlaps;
}

export function placeExtensionHarbors(
  order: ExtensionEdgeOrder,
  hexSize = 1
): PlacedHarbor[] {
  const mapping = getBoardMapping('extension56');
  const placed: PlacedHarbor[] = [];

  order.triple.forEach((templateIndex, slotIndex) => {
    const template = EXTENSION_TRIPLE_TEMPLATES[templateIndex];
    const kLabels = EXTENSION_TRIPLE_SLOTS[slotIndex];

    for (const harbor of template.harbors) {
      const kLabel = kLabels[harbor.hexOffset];
      const edge = mapping.edgeByLabel.get(kLabel)!;
      const [nodeA, nodeB] = hNodesForEdgeHex(kLabel, harbor.hexOffset, mapping);
      const pA = hexCorner(nodeA.anchor, nodeA.corner, hexSize);
      const pB = hexCorner(nodeB.anchor, nodeB.corner, hexSize);
      const midX = (pA.x + pB.x) / 2;
      const midY = (pA.y + pB.y) / 2;
      const center = hexToPixel(edge.coord, hexSize);
      const angle = Math.atan2(midY - center.y, midX - center.x);
      const definition = harborDefinition(template, harbor);

      placed.push({
        definition,
        pieceGroup: template.pieceNumber - 1,
        edgeHexLabel: kLabel,
        nodeLabels: [nodeA.label, nodeB.label],
        edgeCoord: edge.coord,
        nodeVertexIds: [nodeA.vertexId, nodeB.vertexId],
        angle,
      });
    }
  });

  order.single.forEach((templateIndex, slotIndex) => {
    const template = EXTENSION_SINGLE_TEMPLATES[templateIndex];
    const kLabel = EXTENSION_SINGLE_SLOTS[slotIndex];

    for (const harbor of template.harbors) {
      const edge = mapping.edgeByLabel.get(kLabel)!;
      const [nodeA, nodeB] = hNodesForSingleEdgeHex(kLabel, mapping);
      const pA = hexCorner(nodeA.anchor, nodeA.corner, hexSize);
      const pB = hexCorner(nodeB.anchor, nodeB.corner, hexSize);
      const midX = (pA.x + pB.x) / 2;
      const midY = (pA.y + pB.y) / 2;
      const center = hexToPixel(edge.coord, hexSize);
      const angle = Math.atan2(midY - center.y, midX - center.x);
      const definition = harborDefinition(template, harbor);

      placed.push({
        definition,
        pieceGroup: template.pieceNumber - 1,
        edgeHexLabel: kLabel,
        nodeLabels: [nodeA.label, nodeB.label],
        edgeCoord: edge.coord,
        nodeVertexIds: [nodeA.vertexId, nodeB.vertexId],
        angle,
      });
    }
  });

  return placed;
}

export function randomExtensionEdgeOrder(maxAttempts = 300): ExtensionEdgeOrder {
  let best = EXTENSION_IDENTITY_ORDER;
  let bestOverlaps = countHarborNodeOverlaps(
    placeExtensionHarbors(EXTENSION_IDENTITY_ORDER)
  );

  for (let i = 0; i < maxAttempts; i++) {
    const candidate: ExtensionEdgeOrder = {
      triple: shuffle([0, 1, 2, 3, 4, 5]),
      single: shuffle([0, 1, 2, 3]),
    };
    const overlaps = countHarborNodeOverlaps(placeExtensionHarbors(candidate));
    if (overlaps === 0) return candidate;
    if (overlaps < bestOverlaps) {
      bestOverlaps = overlaps;
      best = candidate;
    }
  }

  return best;
}

export function getExtensionTriplePieces(order: ExtensionEdgeOrder) {
  const mapping = getBoardMapping('extension56');

  return EXTENSION_TRIPLE_SLOTS.map((slotKLabels, slotIndex) => {
    const template = EXTENSION_TRIPLE_TEMPLATES[order.triple[slotIndex]];
    const coords = slotKLabels.map((label) => {
      const edge = mapping.edgeByLabel.get(label);
      if (!edge) throw new Error(`Missing edge hex ${label}`);
      return edge.coord;
    }) as [HexCoord, HexCoord, HexCoord];

    return {
      groupIndex: template.pieceNumber - 1,
      label: template.label,
      kLabels: slotKLabels as [string, string, string],
      coords,
    };
  });
}

export function getExtensionSinglePieces(order: ExtensionEdgeOrder) {
  const mapping = getBoardMapping('extension56');

  return EXTENSION_SINGLE_SLOTS.map((kLabel, slotIndex) => {
    const template = EXTENSION_SINGLE_TEMPLATES[order.single[slotIndex]];
    const edge = mapping.edgeByLabel.get(kLabel);
    if (!edge) throw new Error(`Missing single edge hex ${kLabel}`);

    return {
      groupIndex: template.pieceNumber - 1,
      label: template.label,
      kLabel,
      coord: edge.coord,
    };
  });
}

export function extensionEdgePieceGroupMap(order: ExtensionEdgeOrder): Map<string, number> {
  const map = new Map<string, number>();
  for (const piece of getExtensionTriplePieces(order)) {
    for (const coord of piece.coords) {
      map.set(coordKey(coord), piece.groupIndex);
    }
  }
  for (const piece of getExtensionSinglePieces(order)) {
    map.set(coordKey(piece.coord), piece.groupIndex);
  }
  return map;
}

export function isExtensionSize(size: BoardSize): boolean {
  return size === 'extension56';
}
