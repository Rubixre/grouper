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
import { getHarborsForVertex } from './harbors';
import { coordKey, hexNeighbor } from './hex';
import { getBoardSet, getLandSet } from './boardLayout';
import {
  type BoardEconomics,
  type PlacementComponents,
  type ProductionProfile,
  type ProdResource,
  NUMBER_PROB,
  computeBoardEconomics,
  harborBonusForProfile,
  scoreFirstPlacement,
  scorePairPlacement,
} from './placementModel';

export { NUMBER_PROB } from './placementModel';

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
  const rawByResource: Partial<Record<ProdResource, number>> = {};
  const rawByNumber: Partial<Record<number, number>> = {};
  const rawByResourceNumber: ProductionProfile['rawByResourceNumber'] = {};
  const resources = new Set<ProdResource>();
  let total = 0;
  let pipTotal = 0;
  let producingHexCount = 0;
  let desertNeighbors = 0;
  let hasRedNumber = false;

  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (!tile || tile.kind !== 'land') continue;

    if (tile.resource === 'desert') {
      desertNeighbors++;
      continue;
    }

    if (!tile.resource || !tile.number) continue;

    const resource = tile.resource;
    const probability = NUMBER_PROB[tile.number] ?? 0;
    const value = probability * weights[resource as keyof ResourceWeights];

    resources.add(resource);
    producingHexCount++;
    pipTotal += probability;
    if (tile.number === 6 || tile.number === 8) hasRedNumber = true;

    byResource[resource] = (byResource[resource] ?? 0) + value;
    byNumber[tile.number] = (byNumber[tile.number] ?? 0) + value;
    rawByResource[resource] = (rawByResource[resource] ?? 0) + probability;
    rawByNumber[tile.number] = (rawByNumber[tile.number] ?? 0) + probability;

    if (!rawByResourceNumber[resource]) rawByResourceNumber[resource] = {};
    rawByResourceNumber[resource]![tile.number] =
      (rawByResourceNumber[resource]![tile.number] ?? 0) + probability;

    total += value;
    breakdown.push({ resource, value });
  }

  return {
    byResource,
    byNumber,
    rawByResource,
    rawByNumber,
    rawByResourceNumber,
    total,
    pipTotal,
    producingHexCount,
    desertNeighbors,
    hasRedNumber,
    resources,
    breakdown,
  };
}

function scoreToResult(
  vertexId: string,
  placementKind: 'first' | 'second',
  profile: ProductionProfile,
  scored: { total: number; components: PlacementComponents },
  extras?: { firstProduction?: number; secondProduction?: number }
): SettlementScore {
  const c = scored.components;
  return {
    vertexId,
    total: scored.total,
    production: c.production,
    firstProduction: extras?.firstProduction,
    secondProduction: extras?.secondProduction,
    diversity: c.diversity,
    harbor: c.harbor,
    portfolio: c.portfolio,
    overlap: c.overlap,
    pipBonus: c.pipBonus,
    redAnchorBonus: c.redAnchorBonus,
    desertPenalty: c.desertPenalty,
    lowHexPenalty: c.lowHexPenalty,
    monoResourcePenalty: c.monoResourcePenalty,
    buildingSynergy: c.buildingSynergy,
    pairPipBonus: c.pairPipBonus,
    complementScore: c.complementScore,
    coordination: c.coordination,
    placementKind,
    breakdown: profile.breakdown,
  };
}

export function scoreVertex(
  vertexId: string,
  board: Board,
  economics?: BoardEconomics
): SettlementScore {
  const econ = economics ?? computeBoardEconomics(board);
  const profile = buildProductionProfile(vertexId, board, econ.dynamicWeights);
  const harbors = getHarborsForVertex(vertexId, board.harbors);
  const harbor = harborBonusForProfile(profile, harbors);
  const scored = scoreFirstPlacement(profile, econ.strategyWeights, harbor);
  return scoreToResult(vertexId, 'first', profile, scored);
}

/** Vurdering av 2. landsby ut fra hele paret (1.+2. landsby) */
export function scoreSecondSettlement(
  secondVertexId: string,
  firstVertexId: string,
  board: Board,
  economics?: BoardEconomics
): SettlementScore {
  const econ = economics ?? computeBoardEconomics(board);
  const first = buildProductionProfile(firstVertexId, board, econ.dynamicWeights);
  const second = buildProductionProfile(secondVertexId, board, econ.dynamicWeights);
  const combinedResources = new Set([...first.resources, ...second.resources]);

  const harbor =
    harborBonusForProfile(first, getHarborsForVertex(firstVertexId, board.harbors)) +
    harborBonusForProfile(
      second,
      getHarborsForVertex(secondVertexId, board.harbors),
      combinedResources.size
    );

  const scored = scorePairPlacement(first, second, econ.strategyWeights, harbor);
  return scoreToResult(secondVertexId, 'second', second, scored, {
    firstProduction: first.total,
    secondProduction: second.total,
  });
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
  const econ = computeBoardEconomics(board, weights ?? DEFAULT_RESOURCE_WEIGHTS);

  if (currentPlayer !== undefined) {
    const playerSettlements = placed.filter((p) => p.player === currentPlayer);
    if (playerSettlements.length === 1) {
      const firstVertexId = playerSettlements[0].vertexId;
      return getValidVertices(placed)
        .map((id) => scoreSecondSettlement(id, firstVertexId, board, econ))
        .sort((a, b) => b.total - a.total);
    }
  }

  return getValidVertices(placed)
    .map((id) => scoreVertex(id, board, econ))
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
  firstProduction?: number;
  secondProduction?: number;
  diversity: number;
  harbor: number;
  pipBonus?: number;
  redAnchorBonus?: number;
  desertPenalty?: number;
  lowHexPenalty?: number;
  monoResourcePenalty?: number;
  buildingSynergy?: number;
  pairPipBonus?: number;
  complementScore?: number;
  coordination?: number;
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
  const econ = computeBoardEconomics(board, weights);
  const hexContributions = hexContributionsFor(score.vertexId, board, econ.dynamicWeights);
  const profile = buildProductionProfile(score.vertexId, board, econ.dynamicWeights);

  const base = {
    hexContributions,
    production: score.production,
    diversity: score.diversity,
    harbor: score.harbor,
    pipBonus: score.pipBonus,
    redAnchorBonus: score.redAnchorBonus,
    desertPenalty: score.desertPenalty,
    lowHexPenalty: score.lowHexPenalty,
    monoResourcePenalty: score.monoResourcePenalty,
    buildingSynergy: score.buildingSynergy,
    pairPipBonus: score.pairPipBonus,
    complementScore: score.complementScore,
    coordination: score.coordination,
    total: score.total,
  };

  if (score.placementKind === 'second' && firstVertexId) {
    const first = buildProductionProfile(firstVertexId, board, econ.dynamicWeights);
    const combined = new Set([...first.resources, ...profile.resources]);
    return {
      kind: 'second',
      ...base,
      firstProduction: score.firstProduction ?? first.total,
      secondProduction: score.secondProduction ?? profile.total,
      portfolio: score.portfolio,
      overlap: score.overlap,
      netPortfolio: (score.portfolio ?? 0) - (score.overlap ?? 0),
      coveredResources: [...combined],
    };
  }

  return {
    kind: 'first',
    ...base,
    coveredResources: [...profile.resources],
  };
}

export { computeBoardEconomics } from './placementModel';
