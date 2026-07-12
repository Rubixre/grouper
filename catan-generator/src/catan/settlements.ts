import type {
  Board,
  HexCoord,
  PlacedSettlement,
  ResourceType,
  ResourceWeights,
  SettlementScore,
  Vertex,
} from './types';
import { DEFAULT_RESOURCE_WEIGHTS } from './types';
import { coverageBonus } from './resourceWeights';
import { getHarborsForVertex } from './harbors';
import { coordKey, hexNeighbor } from './hex';
import { getBoardSet, getLandSet } from './boardLayout';

/** Dice roll probability for each number token */
export const NUMBER_PROB: Record<number, number> = {
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

/** Havner har minimal vekt i plasseringsvurdering */
const HARBOR_MAX_SHARE_OF_PRODUCTION = 0.03;

function capHarborBonus(harbor: number, production: number): number {
  if (harbor <= 0) return 0;
  const cap = Math.max(production * HARBOR_MAX_SHARE_OF_PRODUCTION, 0.002);
  return Math.min(harbor, cap);
}

function portfolioSynergy(
  first: ProductionProfile,
  second: ProductionProfile,
  weights: ResourceWeights
): {
  portfolio: number;
  overlap: number;
} {
  let gapFill = 0;
  let resourceOverlap = 0;

  for (const resource of PROD_RESOURCES) {
    const v1 = first.byResource[resource] ?? 0;
    const v2 = second.byResource[resource] ?? 0;
    const resourceWeight = weights[resource];

    if (v1 === 0 && v2 > 0) {
      gapFill += v2 * resourceWeight * 0.5;
    } else if (v1 > 0 && v2 > 0) {
      resourceOverlap += Math.min(v1, v2) * resourceWeight * 0.35;
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

  const combinedResources = new Set([...first.resources, ...second.resources]);
  const portfolioCoverage = coverageBonus(combinedResources, weights, 0.2);
  const portfolio = gapFill + portfolioCoverage;
  const overlap = resourceOverlap + numberOverlap;

  return { portfolio, overlap };
}

export function scoreVertex(
  vertexId: string,
  board: Board,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): SettlementScore {
  const profile = buildProductionProfile(vertexId, board, weights);
  const diversity = coverageBonus(profile.resources, weights);
  const hasHarbor = getHarborsForVertex(vertexId, board.harbors).length > 0;
  const harbor = hasHarbor
    ? capHarborBonus(profile.total * 0.02, profile.total)
    : 0;

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

/** Vurdering av 2. landsby ut fra produksjon + utfylling mot 1. landsby */
export function scoreSecondSettlement(
  secondVertexId: string,
  firstVertexId: string,
  board: Board,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): SettlementScore {
  const first = buildProductionProfile(firstVertexId, board, weights);
  const second = buildProductionProfile(secondVertexId, board, weights);
  const { portfolio, overlap } = portfolioSynergy(first, second, weights);
  const diversity = coverageBonus(
    new Set([...first.resources, ...second.resources]),
    weights,
    0.2
  );
  const hasHarbor = getHarborsForVertex(secondVertexId, board.harbors).length > 0;
  const harbor = hasHarbor
    ? capHarborBonus(second.total * 0.02, second.total)
    : 0;

  const total = second.total + portfolio - overlap + diversity + harbor;

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

export interface HexContribution {
  resource: ResourceType;
  number: number;
  probability: number;
  resourceWeight: number;
  value: number;
}

export interface ScoreExplanation {
  kind: 'first' | 'second';
  hexContributions: HexContribution[];
  production: number;
  diversity: number;
  harbor: number;
  portfolio?: number;
  overlap?: number;
  netPortfolio?: number;
  total: number;
  coveredResources: string[];
}

function hexContributionsFor(
  vertexId: string,
  board: Board,
  weights: ResourceWeights
): HexContribution[] {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId);
  if (!vertex) return [];

  const rows: HexContribution[] = [];
  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (!tile || tile.kind !== 'land' || !tile.resource || tile.resource === 'desert' || !tile.number) {
      continue;
    }
    const probability = NUMBER_PROB[tile.number] ?? 0;
    const resourceWeight = weights[tile.resource as keyof ResourceWeights];
    rows.push({
      resource: tile.resource,
      number: tile.number,
      probability,
      resourceWeight,
      value: probability * resourceWeight,
    });
  }
  return rows;
}

/** Detaljert forklaring av poengberegning for UI og dokumentasjon */
export function explainPlacementScore(
  score: SettlementScore,
  board: Board,
  firstVertexId?: string,
  weights: ResourceWeights = DEFAULT_RESOURCE_WEIGHTS
): ScoreExplanation {
  const hexContributions = hexContributionsFor(score.vertexId, board, weights);
  const profile = buildProductionProfile(score.vertexId, board, weights);

  if (score.placementKind === 'second' && firstVertexId) {
    const first = buildProductionProfile(firstVertexId, board, weights);
    const combined = new Set([...first.resources, ...profile.resources]);
    return {
      kind: 'second',
      hexContributions,
      production: score.production,
      diversity: score.diversity,
      harbor: score.harbor,
      portfolio: score.portfolio,
      overlap: score.overlap,
      netPortfolio: (score.portfolio ?? 0) - (score.overlap ?? 0),
      total: score.total,
      coveredResources: [...combined],
    };
  }

  return {
    kind: 'first',
    hexContributions,
    production: score.production,
    diversity: score.diversity,
    harbor: score.harbor,
    total: score.total,
    coveredResources: [...profile.resources],
  };
}
