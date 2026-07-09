import type {
  Board,
  HarborType,
  HexCoord,
  PlacedSettlement,
  ResourceType,
  ResourceWeights,
  SettlementScore,
  Vertex,
} from './types';
import { DEFAULT_RESOURCE_WEIGHTS } from './types';
import { getHarborsForVertex } from './harbors';
import { coordKey, hexNeighbor } from './hex';
import { getBoardSet, getLandSet } from './boardLayout';

/** Dice roll probability for each number token */
const NUMBER_PROB: Record<number, number> = {
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36,
};

const PROD_RESOURCES: Exclude<ResourceType, 'desert'>[] = [
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
];

type ProdResource = Exclude<ResourceType, 'desert'>;

interface ProductionProfile {
  byResource: Partial<Record<ProdResource, number>>;
  byNumber: Partial<Record<number, number>>;
  total: number;
  resources: Set<ProdResource>;
  breakdown: { resource: ResourceType; value: number }[];
}

function vertexKey(hexes: HexCoord[]): string {
  return hexes
    .map(coordKey)
    .sort()
    .join('|');
}

/** Build all settlement vertices and adjacency graph */
export function buildVertices(): Map<string, Vertex> {
  const boardSet = getBoardSet();
  const raw = new Map<string, HexCoord[]>();

  for (const key of boardSet) {
    const coord = { q: Number(key.split(',')[0]), r: Number(key.split(',')[1]) };
    for (let corner = 0; corner < 6; corner++) {
      const participants: HexCoord[] = [coord];
      const n1 = hexNeighbor(coord, (corner + 5) % 6);
      const n2 = hexNeighbor(coord, corner);
      if (boardSet.has(coordKey(n1))) participants.push(n1);
      if (boardSet.has(coordKey(n2))) participants.push(n2);

      if (participants.length >= 1) {
        const id = vertexKey(participants);
        if (!raw.has(id)) raw.set(id, participants);
      }
    }
  }

  const vertexAnchors = new Map<string, { anchor: HexCoord; corner: number }>();

  for (const key of boardSet) {
    const coord = { q: Number(key.split(',')[0]), r: Number(key.split(',')[1]) };
    for (let corner = 0; corner < 6; corner++) {
      const participants: HexCoord[] = [coord];
      const n1 = hexNeighbor(coord, (corner + 5) % 6);
      const n2 = hexNeighbor(coord, corner);
      if (boardSet.has(coordKey(n1))) participants.push(n1);
      if (boardSet.has(coordKey(n2))) participants.push(n2);
      if (participants.length >= 1) {
        const id = vertexKey(participants);
        if (!vertexAnchors.has(id)) {
          vertexAnchors.set(id, { anchor: coord, corner });
        }
      }
    }
  }

  const vertices = new Map<string, Vertex>();
  for (const [id, hexes] of raw) {
    const anchorInfo = vertexAnchors.get(id)!;
    vertices.set(id, {
      id,
      hexes,
      anchor: anchorInfo.anchor,
      corner: anchorInfo.corner,
      neighbors: [],
    });
  }

  // Build adjacency: vertices sharing an edge on a hex
  const byHexCorner = new Map<string, string>();
  for (const key of boardSet) {
    const coord = { q: Number(key.split(',')[0]), r: Number(key.split(',')[1]) };
    for (let c = 0; c < 6; c++) {
      const participants: HexCoord[] = [coord];
      const n1 = hexNeighbor(coord, (c + 5) % 6);
      const n2 = hexNeighbor(coord, c);
      if (boardSet.has(coordKey(n1))) participants.push(n1);
      if (boardSet.has(coordKey(n2))) participants.push(n2);
      if (participants.length >= 1) {
        byHexCorner.set(`${coordKey(coord)}:${c}`, vertexKey(participants));
      }
    }
  }

  for (const key of boardSet) {
    const coord = { q: Number(key.split(',')[0]), r: Number(key.split(',')[1]) };
    for (let c = 0; c < 6; c++) {
      const id = byHexCorner.get(`${coordKey(coord)}:${c}`);
      if (!id) continue;
      const adj = [
        byHexCorner.get(`${coordKey(coord)}:${(c + 5) % 6}`),
        byHexCorner.get(`${coordKey(coord)}:${(c + 1) % 6}`),
      ].filter(Boolean) as string[];
      const v = vertices.get(id)!;
      for (const a of adj) {
        if (!v.neighbors.includes(a)) v.neighbors.push(a);
      }
    }
  }

  return vertices;
}

let vertexCache: Map<string, Vertex> | null = null;

export function getVertices(): Map<string, Vertex> {
  if (!vertexCache) vertexCache = buildVertices();
  return vertexCache;
}

export function resetVertices(): void {
  vertexCache = null;
}

/** Catan distance rule: no settlement within 1 edge of another */
export function isVertexAvailable(
  vertexId: string,
  placed: PlacedSettlement[]
): boolean {
  const vertices = getVertices();
  const occupied = new Set(placed.map((p) => p.vertexId));
  if (occupied.has(vertexId)) return false;

  const v = vertices.get(vertexId);
  if (!v) return false;

  for (const n of v.neighbors) {
    if (occupied.has(n)) return false;
  }
  return true;
}

function buildProductionProfile(
  vertexId: string,
  board: Board,
  weights: ResourceWeights
): ProductionProfile {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId)!;
  const breakdown: { resource: ResourceType; value: number }[] = [];
  const byResource: Partial<Record<ProdResource, number>> = {};
  const byNumber: Partial<Record<number, number>> = {};
  const resources = new Set<ProdResource>();
  let total = 0;

  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (!tile || tile.kind !== 'land' || !tile.resource || tile.resource === 'desert' || !tile.number) {
      continue;
    }

    const resource = tile.resource;
    const value =
      (NUMBER_PROB[tile.number] ?? 0) *
      weights[resource as keyof ResourceWeights];

    resources.add(resource);
    byResource[resource] = (byResource[resource] ?? 0) + value;
    byNumber[tile.number] = (byNumber[tile.number] ?? 0) + value;
    total += value;
    breakdown.push({ resource, value });
  }

  return { byResource, byNumber, total, resources, breakdown };
}

function mergeProfiles(a: ProductionProfile, b: ProductionProfile): ProductionProfile {
  const byResource: Partial<Record<ProdResource, number>> = { ...a.byResource };
  const byNumber: Partial<Record<number, number>> = { ...a.byNumber };
  const resources = new Set<ProdResource>([...a.resources, ...b.resources]);

  for (const resource of PROD_RESOURCES) {
    const sum = (a.byResource[resource] ?? 0) + (b.byResource[resource] ?? 0);
    if (sum > 0) byResource[resource] = sum;
  }

  for (const number of Object.keys(NUMBER_PROB).map(Number)) {
    const sum = (a.byNumber[number] ?? 0) + (b.byNumber[number] ?? 0);
    if (sum > 0) byNumber[number] = sum;
  }

  return {
    byResource,
    byNumber,
    total: a.total + b.total,
    resources,
    breakdown: [...a.breakdown, ...b.breakdown],
  };
}

function harborValueForResource(
  harbor: HarborType,
  resource: ProdResource,
  production: number
): number {
  if (production <= 0) return 0;
  if (harbor.kind === 'generic') return production * 0.5;
  if (harbor.resource === resource) return production * 1.0;
  return production * 0.15;
}

function harborBonusForVertex(
  vertexId: string,
  vertex: Vertex,
  board: Board,
  weights: ResourceWeights
): number {
  const affecting = getHarborsForVertex(vertexId, board.harbors);
  if (affecting.length === 0) return 0;

  let bonus = 0;
  for (const placed of affecting) {
    for (const hex of vertex.hexes) {
      bonus += harborValueForHex(placed.definition.harbor, hex, board, weights);
    }
  }
  return bonus;
}

function harborValueForHex(
  harbor: HarborType,
  hex: HexCoord,
  board: Board,
  weights: ResourceWeights
): number {
  const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
  if (!tile || tile.kind !== 'land' || tile.resource === 'desert' || !tile.number) return 0;

  const prod =
    (NUMBER_PROB[tile.number] ?? 0) *
    weights[tile.resource as keyof ResourceWeights];

  if (harbor.kind === 'generic') return prod * 0.5;
  if (harbor.resource === tile.resource) return prod * 1.0;
  return prod * 0.15;
}

/** Havn vurdert mot spillerens samlede produksjon (begge landsbyer). */
function harborBonusForPlayer(
  vertexIds: string[],
  combined: ProductionProfile,
  board: Board
): number {
  const seen = new Set<string>();
  const harbors = vertexIds.flatMap((vertexId) =>
    getHarborsForVertex(vertexId, board.harbors).filter((h) => {
      if (seen.has(h.definition.id)) return false;
      seen.add(h.definition.id);
      return true;
    })
  );

  let bonus = 0;
  for (const placed of harbors) {
    for (const resource of PROD_RESOURCES) {
      const production = combined.byResource[resource] ?? 0;
      bonus += harborValueForResource(placed.definition.harbor, resource, production);
    }
  }
  return bonus;
}

function portfolioSynergy(first: ProductionProfile, second: ProductionProfile): {
  portfolio: number;
  overlap: number;
} {
  let gapFill = 0;
  let resourceOverlap = 0;

  for (const resource of PROD_RESOURCES) {
    const v1 = first.byResource[resource] ?? 0;
    const v2 = second.byResource[resource] ?? 0;

    if (v1 === 0 && v2 > 0) {
      gapFill += v2 * 0.55;
    } else if (v1 > 0 && v2 > 0) {
      resourceOverlap += Math.min(v1, v2) * 0.4;
    }
  }

  let numberOverlap = 0;
  for (const number of Object.keys(NUMBER_PROB).map(Number)) {
    const v1 = first.byNumber[number] ?? 0;
    const v2 = second.byNumber[number] ?? 0;
    if (v1 > 0 && v2 > 0) {
      numberOverlap += Math.min(v1, v2) * 0.2;
    }
  }

  const combinedDiversity = new Set([...first.resources, ...second.resources]).size * 0.14;
  const portfolio = gapFill + combinedDiversity;
  const overlap = resourceOverlap + numberOverlap;

  return { portfolio, overlap };
}

export function scoreVertex(
  vertexId: string,
  board: Board,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): SettlementScore {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId)!;
  const profile = buildProductionProfile(vertexId, board, weights);
  const diversity = profile.resources.size * 0.08;
  const harbor = harborBonusForVertex(vertexId, vertex, board, weights);

  return {
    vertexId,
    total: profile.total + diversity + harbor,
    production: profile.total,
    diversity,
    harbor,
    placementKind: 'first',
    breakdown: profile.breakdown,
  };
}

/** Sterkere vurdering når spilleren plasserer sin andre startlandsby. */
export function scoreSecondSettlement(
  secondVertexId: string,
  firstVertexId: string,
  board: Board,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): SettlementScore {
  const first = buildProductionProfile(firstVertexId, board, weights);
  const second = buildProductionProfile(secondVertexId, board, weights);
  const combined = mergeProfiles(first, second);
  const { portfolio, overlap } = portfolioSynergy(first, second);
  const harbor = harborBonusForPlayer([firstVertexId, secondVertexId], combined, board);
  const diversity = combined.resources.size * 0.1;

  // Produksjon fra landsby 2 = startressurser; portefølje og havn på total inntekt.
  const total =
    second.total * 1.25 +
    portfolio -
    overlap +
    diversity +
    harbor;

  return {
    vertexId: secondVertexId,
    total,
    production: second.total,
    diversity,
    harbor,
    portfolio,
    overlap,
    placementKind: 'second',
    breakdown: second.breakdown,
  };
}

export function getValidVertices(placed: PlacedSettlement[]): string[] {
  const vertices = getVertices();
  const landSet = getLandSet();
  return [...vertices.keys()].filter((id) => {
    const v = vertices.get(id);
    if (!v) return false;
    const touchesLand = v.hexes.some((h) => landSet.has(coordKey(h)));
    return touchesLand && isVertexAvailable(id, placed);
  });
}

export function rankVertices(
  board: Board,
  placed: PlacedSettlement[],
  weights?: ResourceWeights,
  currentPlayer?: number
): SettlementScore[] {
  const w = weights ?? DEFAULT_RESOURCE_WEIGHTS;

  if (currentPlayer !== undefined) {
    const playerSettlements = placed.filter((p) => p.player === currentPlayer);
    if (playerSettlements.length === 1) {
      const firstVertexId = playerSettlements[0].vertexId;
      return getValidVertices(placed)
        .map((id) => scoreSecondSettlement(id, firstVertexId, board, w))
        .sort((a, b) => b.total - a.total);
    }
  }

  return getValidVertices(placed)
    .map((id) => scoreVertex(id, board, w))
    .sort((a, b) => b.total - a.total);
}
