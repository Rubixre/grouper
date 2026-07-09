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
import { coastSlotsForHex, getHarborAtSlot } from './harbors';
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

function harborBonusForVertex(
  vertex: Vertex,
  board: Board,
  weights: ResourceWeights
): number {
  let bonus = 0;
  const seenHarbors = new Set<string>();

  for (const hex of vertex.hexes) {
    const slots = coastSlotsForHex(hex, board.coastSlots);
    for (const slot of slots) {
      const harbor = getHarborAtSlot(slot, board.harbors);
      if (!harbor || seenHarbors.has(harbor.piece.id)) continue;
      seenHarbors.add(harbor.piece.id);
      bonus += harborValue(harbor.piece.harbor, hex, board, weights);
    }
  }
  return bonus;
}

function harborValue(
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

export function scoreVertex(
  vertexId: string,
  board: Board,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): SettlementScore {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId)!;
  const breakdown: { resource: ResourceType; value: number }[] = [];
  let production = 0;
  const resourceSet = new Set<ResourceType>();

  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (!tile || tile.kind !== 'land' || !tile.resource || tile.resource === 'desert' || !tile.number) continue;

    resourceSet.add(tile.resource);
    const value =
      (NUMBER_PROB[tile.number] ?? 0) *
      weights[tile.resource as keyof ResourceWeights];
    production += value;
    breakdown.push({ resource: tile.resource, value });
  }

  const diversity = resourceSet.size * 0.08;
  const harbor = harborBonusForVertex(vertex, board, weights);

  return {
    vertexId,
    total: production + diversity + harbor,
    production,
    diversity,
    harbor,
    breakdown,
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
  weights?: ResourceWeights
): SettlementScore[] {
  return getValidVertices(placed)
    .map((id) => scoreVertex(id, board, weights))
    .sort((a, b) => b.total - a.total);
}
