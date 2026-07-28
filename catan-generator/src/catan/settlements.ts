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
import { OPPONENT_RESOURCE_WEIGHTS } from './resourceWeights';
import { getHarborsForVertex } from './harbors';
import { coordKey, hexNeighbor } from './hex';
import { getBoardSet, getLandSet } from './boardLayout';
import {
  type BoardEconomics,
  type PlacementComponents,
  type ProductionProfile,
  type ProdResource,
  NUMBER_PROB,
  EXPANSION_CAP,
  EXPANSION_ROOM_SCALE,
  PORT_REACH_GENERIC,
  PORT_REACH_MATCH,
  PORT_REACH_OTHER,
  computeBoardEconomics,
  harborBonusForProfile,
  scoreFirstPlacement,
  scorePairPlacement,
} from './placementModel';
import {
  ownRoadContinuationBonus,
  roadContestPenalty,
} from './roadPlan';

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

/** Korteste veiavstand mellom to hjørner (ubegrenset BFS; null hvis frakoblet). */
export function vertexRoadDistance(fromId: string, toId: string): number | null {
  if (fromId === toId) return 0;
  const vertices = getVertices();
  if (!vertices.has(fromId) || !vertices.has(toId)) return null;

  const queue: string[] = [fromId];
  const dist = new Map<string, number>([[fromId, 0]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = dist.get(current)!;
    const vertex = vertices.get(current);
    if (!vertex) continue;
    for (const neighbor of vertex.neighbors) {
      if (dist.has(neighbor)) continue;
      const next = d + 1;
      if (neighbor === toId) return next;
      dist.set(neighbor, next);
      queue.push(neighbor);
    }
  }
  return null;
}

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
  let redPipTotal = 0;

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
    if (tile.number === 6 || tile.number === 8) {
      hasRedNumber = true;
      redPipTotal += probability;
    }

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
    redPipTotal,
    resources,
    breakdown,
  };
}

/**
 * Soft expansion / port-reach bonus:
 * - open land vertices two roads away (room to grow / place #2)
 * - harbors exactly two roads away (0 is already in harbor bonus; 1 is illegal)
 * - reduced when opponent opening roads claim nearby corridors
 * - boosted when continuing your own opening-road direction
 */
export function expansionPotential(
  vertexId: string,
  board: Board,
  profile: ProductionProfile,
  placed: PlacedSettlement[] = [],
  selfPlayer?: number
): number {
  const vertices = getVertices();
  const origin = vertices.get(vertexId);
  if (!origin) return 0;

  const dist = new Map<string, number>([[vertexId, 0]]);
  const queue = [vertexId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = dist.get(current)!;
    if (d >= 2) continue;
    const vertex = vertices.get(current);
    if (!vertex) continue;
    for (const neighbor of vertex.neighbors) {
      if (dist.has(neighbor)) continue;
      dist.set(neighbor, d + 1);
      queue.push(neighbor);
    }
  }

  const landSet = getLandSet();
  let roomCount = 0;
  for (const [id, d] of dist) {
    if (d !== 2) continue;
    const v = vertices.get(id);
    if (v && v.hexes.some((h) => landSet.has(coordKey(h)))) roomCount++;
  }
  const room = (Math.min(roomCount, 8) / 8) * EXPANSION_ROOM_SCALE;

  let port = 0;
  for (const placedHarbor of board.harbors) {
    let best: number | null = null;
    for (const node of placedHarbor.nodeVertexIds) {
      const d = vertexRoadDistance(vertexId, node);
      if (d === null) continue;
      if (best === null || d < best) best = d;
    }
    if (best !== 2) continue;
    const harbor = placedHarbor.definition.harbor;
    let value = PORT_REACH_OTHER;
    if (harbor.kind === 'generic') {
      value = PORT_REACH_GENERIC;
    } else if (
      profile.resources.has(harbor.resource) &&
      (profile.rawByResource[harbor.resource] ?? 0) > 0
    ) {
      value = PORT_REACH_MATCH;
    }
    port = Math.max(port, value);
  }

  const contest = roadContestPenalty(vertexId, placed, selfPlayer);
  const continuation =
    selfPlayer === undefined
      ? 0
      : ownRoadContinuationBonus(vertexId, placed, selfPlayer);

  return Math.min(
    Math.max(0, room + port + continuation - contest),
    EXPANSION_CAP + 0.02
  );
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
    expansion: c.expansion,
    robberExposure: c.robberExposure,
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
  economics?: BoardEconomics,
  placed: PlacedSettlement[] = [],
  selfPlayer?: number
): SettlementScore {
  const econ = economics ?? computeBoardEconomics(board);
  const profile = buildProductionProfile(vertexId, board, econ.dynamicWeights);
  const harbors = getHarborsForVertex(vertexId, board.harbors);
  const harbor = harborBonusForProfile(profile, harbors);
  const expansion = expansionPotential(
    vertexId,
    board,
    profile,
    placed,
    selfPlayer
  );
  const scored = scoreFirstPlacement(profile, econ.strategyWeights, harbor, { expansion });
  return scoreToResult(vertexId, 'first', profile, scored);
}

/** Vurdering av 2. landsby ut fra hele paret (1.+2. landsby) */
export function scoreSecondSettlement(
  secondVertexId: string,
  firstVertexId: string,
  board: Board,
  economics?: BoardEconomics,
  placed: PlacedSettlement[] = [],
  selfPlayer?: number
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
      combinedResources.size,
      {
        wood: (first.rawByResource.wood ?? 0) + (second.rawByResource.wood ?? 0),
        brick: (first.rawByResource.brick ?? 0) + (second.rawByResource.brick ?? 0),
        sheep: (first.rawByResource.sheep ?? 0) + (second.rawByResource.sheep ?? 0),
        wheat: (first.rawByResource.wheat ?? 0) + (second.rawByResource.wheat ?? 0),
        ore: (first.rawByResource.ore ?? 0) + (second.rawByResource.ore ?? 0),
      }
    );

  const expansion =
    expansionPotential(firstVertexId, board, first, placed, selfPlayer) +
    expansionPotential(secondVertexId, board, second, placed, selfPlayer);

  const scored = scorePairPlacement(first, second, econ.strategyWeights, harbor, {
    expansion,
  });
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

/** Sum av terningssannsynligheter på tilstøtende landhex (enkel produksjonsmodell) */
export function vertexPipTotal(vertexId: string, board: Board): number {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId);
  if (!vertex) return 0;

  let pip = 0;
  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (!tile || tile.kind !== 'land' || !tile.number) continue;
    pip += NUMBER_PROB[tile.number] ?? 0;
  }
  return pip;
}

/** Rå forventet produksjon (pip) per ressurs på et hjørne */
export function vertexRawByResource(
  vertexId: string,
  board: Board
): Partial<Record<ProdResource, number>> {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId);
  const raw: Partial<Record<ProdResource, number>> = {};
  if (!vertex) return raw;

  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (
      !tile ||
      tile.kind !== 'land' ||
      !tile.resource ||
      tile.resource === 'desert' ||
      !tile.number
    ) {
      continue;
    }
    const resource = tile.resource as ProdResource;
    raw[resource] = (raw[resource] ?? 0) + (NUMBER_PROB[tile.number] ?? 0);
  }
  return raw;
}

/** Antall produktive landhex (ikke ørken) på et hjørne */
export function vertexProducingHexCount(vertexId: string, board: Board): number {
  const vertices = getVertices();
  const vertex = vertices.get(vertexId);
  if (!vertex) return 0;
  let count = 0;
  for (const hex of vertex.hexes) {
    const tile = board.hexes.find((h) => h.coord.q === hex.q && h.coord.r === hex.r);
    if (
      !tile ||
      tile.kind !== 'land' ||
      !tile.resource ||
      tile.resource === 'desert' ||
      !tile.number
    ) {
      continue;
    }
    count += 1;
  }
  return count;
}

/**
 * Hvor klar er toppvalget blant rangerte alternativer?
 * Stor relativ avstand til #2 → høy tillit; jevne toppvalg → lav.
 *
 * Gulvet er bevisst lavt: jevne motstandervalg skal gi lav sti-sikkerhet,
 * slik at spot dominerer i blendLookaheadScore (via c²).
 */
export function confidenceFromRankedOptions(ranked: SettlementScore[]): number {
  if (ranked.length <= 1) return 1;
  const best = ranked[0]!.total;
  const second = ranked[1]!.total;
  if (best <= 1e-9) return 0.35;
  const relativeGap = Math.max(0, (best - second) / best);
  const MIN = 0.25;
  const MAX = 0.98;
  /** ~15 % gap mot #2 regnes som «klart favorittvalg» */
  const CLEAR_GAP = 0.15;
  return Math.min(MAX, Math.max(MIN, MIN + (relativeGap / CLEAR_GAP) * (MAX - MIN)));
}

/**
 * Motspillervalg med samme modell som live auto-advance:
 * #1 → myopisk PSM (beste plass her og nå)
 * #2 → par-PSM med egen #1
 */
export function pickOpponentChoice(
  board: Board,
  placed: PlacedSettlement[],
  player: number,
  weights: ResourceWeights = OPPONENT_RESOURCE_WEIGHTS
): { vertexId: string; confidence: number } | null {
  const ranked = rankVertices(board, placed, weights, player);
  const top = ranked[0];
  if (!top) return null;
  return {
    vertexId: top.vertexId,
    confidence: confidenceFromRankedOptions(ranked),
  };
}

export function pickOpponentVertex(
  board: Board,
  placed: PlacedSettlement[],
  player: number,
  weights: ResourceWeights = OPPONENT_RESOURCE_WEIGHTS
): string | null {
  return pickOpponentChoice(board, placed, player, weights)?.vertexId ?? null;
}

/**
 * Enkel pip-greedy modell (tester / fallback).
 * Foretrekker 3-hex når det finnes, deretter høyest pip.
 */
export function pickGreedyOpponentVertex(
  board: Board,
  placed: PlacedSettlement[],
  player: number
): string | null {
  const valid = getValidVertices(placed);
  if (valid.length === 0) return null;

  const existing = placed.find((p) => p.player === player);
  const firstPip = existing ? vertexPipTotal(existing.vertexId, board) : 0;

  type Cand = { id: string; pip: number; hexes: number };
  const candidates: Cand[] = valid.map((id) => {
    const pip = existing
      ? firstPip + vertexPipTotal(id, board)
      : vertexPipTotal(id, board);
    const hexes = vertexProducingHexCount(id, board);
    return { id, pip, hexes };
  });

  const maxHex = Math.max(...candidates.map((c) => c.hexes));
  const preferredHex = maxHex >= 3 ? 3 : maxHex >= 2 ? 2 : maxHex;
  const pool = candidates.filter((c) => c.hexes >= preferredHex);

  let bestId: string | null = null;
  let bestPip = -1;
  for (const c of pool) {
    if (c.pip > bestPip || (c.pip === bestPip && c.id < (bestId ?? ''))) {
      bestPip = c.pip;
      bestId = c.id;
    }
  }
  return bestId;
}

export function rankVertices(
  board: Board,
  placed: PlacedSettlement[],
  weights?: ResourceWeights,
  currentPlayer?: number,
  economics?: BoardEconomics
): SettlementScore[] {
  const econ = economics ?? computeBoardEconomics(board, weights ?? DEFAULT_RESOURCE_WEIGHTS);

  if (currentPlayer !== undefined) {
    const playerSettlements = placed.filter((p) => p.player === currentPlayer);
    if (playerSettlements.length === 1) {
      const firstVertexId = playerSettlements[0].vertexId;
      return getValidVertices(placed)
        .map((id) =>
          scoreSecondSettlement(id, firstVertexId, board, econ, placed, currentPlayer)
        )
        .sort((a, b) => b.total - a.total);
    }
  }

  return getValidVertices(placed)
    .map((id) => scoreVertex(id, board, econ, placed, currentPlayer))
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
  expansion?: number;
  robberExposure?: number;
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
    expansion: score.expansion,
    robberExposure: score.robberExposure,
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
