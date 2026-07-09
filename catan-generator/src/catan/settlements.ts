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
import { coverageBonus } from './resourceWeights';
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

function countProductiveLandHexes(vertex: Vertex, board: Board): number {
  let count = 0;
  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (tile?.kind === 'land' && tile.resource && tile.resource !== 'desert' && tile.number) {
      count++;
    }
  }
  return count;
}

/** Havneverdier kalibrert for startfasen – handel gir lite før overskudd bygges opp */
const HARBOR_EARLY_GAME_FACTOR = 0.45;
const HARBOR_GENERIC_SURPLUS_SHARE = 0.2;
const HARBOR_GENERIC_TRADE_EFFICIENCY = 0.33;
const HARBOR_MATCH_EFFICIENCY = 0.4;
const HARBOR_CROSS_SETTLEMENT_FACTOR = 0.15;
const MISSING_LAND_HEX_PENALTY = 0.07;

function estimateTradeableSurplus(profile: ProductionProfile): number {
  return profile.total * HARBOR_GENERIC_SURPLUS_SHARE;
}

function harborValueForProfile(
  harbor: HarborType,
  profile: ProductionProfile,
  earlyGame = true
): number {
  const phase = earlyGame ? HARBOR_EARLY_GAME_FACTOR : 1;

  if (harbor.kind === 'generic') {
    return estimateTradeableSurplus(profile) * HARBOR_GENERIC_TRADE_EFFICIENCY * phase;
  }

  const production = profile.byResource[harbor.resource] ?? 0;
  if (production <= 0) return 0;
  return production * HARBOR_MATCH_EFFICIENCY * phase;
}

function harborLandHexPenalty(vertex: Vertex, board: Board): number {
  const missing = Math.max(0, 3 - countProductiveLandHexes(vertex, board));
  return missing * MISSING_LAND_HEX_PENALTY;
}

function harborBonusForVertex(
  vertexId: string,
  vertex: Vertex,
  board: Board,
  weights: ResourceWeights
): number {
  const affecting = getHarborsForVertex(vertexId, board.harbors);
  if (affecting.length === 0) return 0;

  const profile = buildProductionProfile(vertexId, board, weights);
  let bonus = 0;
  for (const placed of affecting) {
    bonus += harborValueForProfile(placed.definition.harbor, profile, true);
  }
  return Math.max(0, bonus - harborLandHexPenalty(vertex, board));
}

/** Havn ved 2. landsby: hovedsakelig fra ny produksjon, liten 2:1-kryss fra landsby 1 */
function harborBonusForSecondSettlement(
  first: ProductionProfile,
  second: ProductionProfile,
  secondVertexId: string,
  board: Board
): number {
  const harbors = getHarborsForVertex(secondVertexId, board.harbors);
  if (harbors.length === 0) return 0;

  const vertices = getVertices();
  const vertex = vertices.get(secondVertexId)!;

  let bonus = 0;
  for (const placed of harbors) {
    const harbor = placed.definition.harbor;
    bonus += harborValueForProfile(harbor, second, true);

    if (harbor.kind === 'resource') {
      const fromFirst = first.byResource[harbor.resource] ?? 0;
      bonus += fromFirst * HARBOR_MATCH_EFFICIENCY * HARBOR_CROSS_SETTLEMENT_FACTOR;
    }
  }

  return Math.max(0, bonus - harborLandHexPenalty(vertex, board));
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
  const vertices = getVertices();
  const vertex = vertices.get(vertexId)!;
  const profile = buildProductionProfile(vertexId, board, weights);
  const diversity = coverageBonus(profile.resources, weights);
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
  const { portfolio, overlap } = portfolioSynergy(first, second, weights);
  const harbor = harborBonusForSecondSettlement(
    first,
    second,
    secondVertexId,
    board
  );
  const diversity = coverageBonus(
    new Set([...first.resources, ...second.resources]),
    weights
  );

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
