import type { HarborDefinition, PlacedHarbor } from './types';
import { getBoardMapping } from './mapping';
import { hexCorner, hexToPixel } from './hex';

/**
 * Fixed harbor layout (klokken fra topp, K / H-nummerering fra kartlegging).
 * Hver havn påvirker nøyaktig to noder (H).
 */
export const HARBOR_LAYOUT: HarborDefinition[] = [
  {
    id: 'harbor-18',
    name: '3:1 havn',
    harbor: { kind: 'generic' },
    edgeHexIndex: 18,
    nodeIndices: [29, 2],
  },
  {
    id: 'harbor-2',
    name: 'Ullhavn',
    harbor: { kind: 'resource', resource: 'sheep' },
    edgeHexIndex: 2,
    nodeIndices: [4, 3],
  },
  {
    id: 'harbor-4',
    name: '3:1 havn',
    harbor: { kind: 'generic' },
    edgeHexIndex: 4,
    nodeIndices: [8, 7],
  },
  {
    id: 'harbor-6',
    name: '3:1 havn',
    harbor: { kind: 'generic' },
    edgeHexIndex: 6,
    nodeIndices: [9, 12],
  },
  {
    id: 'harbor-8',
    name: 'Teglhavn',
    harbor: { kind: 'resource', resource: 'brick' },
    edgeHexIndex: 8,
    nodeIndices: [13, 14],
  },
  {
    id: 'harbor-10',
    name: 'Tømmerhavn',
    harbor: { kind: 'resource', resource: 'wood' },
    edgeHexIndex: 10,
    nodeIndices: [17, 18],
  },
  {
    id: 'harbor-12',
    name: '3:1 havn',
    harbor: { kind: 'generic' },
    edgeHexIndex: 12,
    nodeIndices: [21, 20],
  },
  {
    id: 'harbor-14',
    name: 'Kornhavn',
    harbor: { kind: 'resource', resource: 'wheat' },
    edgeHexIndex: 14,
    nodeIndices: [24, 23],
  },
  {
    id: 'harbor-16',
    name: 'Malmhavn',
    harbor: { kind: 'resource', resource: 'ore' },
    edgeHexIndex: 16,
    nodeIndices: [27, 28],
  },
];

function nodeLabel(index: number): string {
  return `H${index}`;
}

function edgeLabel(index: number): string {
  return `K${index}`;
}

function resolveNode(mapping: ReturnType<typeof getBoardMapping>, index: number) {
  const corner = mapping.cornerByLabel.get(nodeLabel(index));
  if (!corner) {
    throw new Error(`Unknown coast node H${index}`);
  }
  return corner;
}

function resolveEdge(mapping: ReturnType<typeof getBoardMapping>, index: number) {
  const edge = mapping.edgeByLabel.get(edgeLabel(index));
  if (!edge) {
    throw new Error(`Unknown edge hex K${index}`);
  }
  return edge;
}

/** Place harbors at fixed K/H positions from design spec */
export function placeFixedHarbors(hexSize = 1): PlacedHarbor[] {
  const mapping = getBoardMapping();

  return HARBOR_LAYOUT.map((definition) => {
    const edge = resolveEdge(mapping, definition.edgeHexIndex);
    const nodeA = resolveNode(mapping, definition.nodeIndices[0]);
    const nodeB = resolveNode(mapping, definition.nodeIndices[1]);

    const pA = hexCorner(nodeA.anchor, nodeA.corner, hexSize);
    const pB = hexCorner(nodeB.anchor, nodeB.corner, hexSize);
    const midX = (pA.x + pB.x) / 2;
    const midY = (pA.y + pB.y) / 2;
    const center = hexToPixel(edge.coord, hexSize);
    const angle = Math.atan2(midY - center.y, midX - center.x);

    return {
      definition,
      edgeHexLabel: edge.label,
      nodeLabels: [nodeA.label, nodeB.label] as [string, string],
      edgeCoord: edge.coord,
      nodeVertexIds: [nodeA.vertexId, nodeB.vertexId] as [string, string],
      angle,
    };
  });
}

/** Harbors that affect a settlement vertex (must be one of the two H nodes) */
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
