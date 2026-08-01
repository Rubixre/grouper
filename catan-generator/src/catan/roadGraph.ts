import type { PlacedSettlement, PlayerCount } from './types';
import { getVertices } from './settlements';
import { roadEdgeKey } from './roadPlan';

export interface OwnedRoad {
  fromVertexId: string;
  toVertexId: string;
  player: number;
}

export function ownedRoadKey(road: Pick<OwnedRoad, 'fromVertexId' | 'toVertexId'>): string {
  return roadEdgeKey(road.fromVertexId, road.toVertexId);
}

/** Setup-roads from placed settlements (one tip per settlement). */
export function roadsFromPlacements(placements: PlacedSettlement[]): OwnedRoad[] {
  const roads: OwnedRoad[] = [];
  const seen = new Set<string>();
  for (const p of placements) {
    if (!p.roadToVertexId) continue;
    const key = roadEdgeKey(p.vertexId, p.roadToVertexId);
    if (seen.has(key)) continue;
    seen.add(key);
    roads.push({
      fromVertexId: p.vertexId,
      toVertexId: p.roadToVertexId,
      player: p.player,
    });
  }
  return roads;
}

function adjacencyForPlayer(
  roads: OwnedRoad[],
  player: number
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const road of roads) {
    if (road.player !== player) continue;
    add(road.fromVertexId, road.toVertexId);
    add(road.toVertexId, road.fromVertexId);
  }
  return adj;
}

/**
 * Longest continuous road for a player.
 * Blocks at opponent settlements/cities (standard Catan rule simplification:
 * own settlements do not break the path).
 */
export function longestRoadLength(
  roads: OwnedRoad[],
  placements: PlacedSettlement[],
  player: number
): number {
  const adj = adjacencyForPlayer(roads, player);
  if (adj.size === 0) return 0;

  const blocker = new Set(
    placements.filter((p) => p.player !== player).map((p) => p.vertexId)
  );

  let best = 0;

  const dfs = (node: string, parent: string | null, depth: number, used: Set<string>) => {
    best = Math.max(best, depth);
    const neighbors = adj.get(node);
    if (!neighbors) return;
    for (const next of neighbors) {
      if (next === parent) continue;
      const edge = roadEdgeKey(node, next);
      if (used.has(edge)) continue;
      // Opponent building blocks continuing through that vertex (except arriving).
      if (blocker.has(next)) {
        best = Math.max(best, depth + 1);
        continue;
      }
      used.add(edge);
      dfs(next, node, depth + 1, used);
      used.delete(edge);
    }
  };

  for (const start of adj.keys()) {
    dfs(start, null, 0, new Set());
  }

  return best;
}

export interface LongestRoadStanding {
  player: number;
  length: number;
}

/** Players with road length ≥ 5, sorted longest first. */
export function rankLongestRoads(
  roads: OwnedRoad[],
  placements: PlacedSettlement[],
  playerCount: PlayerCount
): LongestRoadStanding[] {
  const standings: LongestRoadStanding[] = [];
  for (let player = 0; player < playerCount; player++) {
    const length = longestRoadLength(roads, placements, player);
    if (length > 0) standings.push({ player, length });
  }
  standings.sort((a, b) => b.length - a.length || a.player - b.player);
  return standings;
}

/**
 * Who currently holds Longest Road (needs ≥5 and strictly longest).
 * Ties: previous holder keeps it if still tied for longest; else null.
 */
export function longestRoadHolder(
  roads: OwnedRoad[],
  placements: PlacedSettlement[],
  playerCount: PlayerCount,
  previousHolder: number | null = null
): { holder: number | null; length: number } {
  const ranked = rankLongestRoads(roads, placements, playerCount);
  const top = ranked[0];
  if (!top || top.length < 5) return { holder: null, length: top?.length ?? 0 };

  const tied = ranked.filter((r) => r.length === top.length);
  if (tied.length === 1) return { holder: top.player, length: top.length };
  if (
    previousHolder != null &&
    tied.some((r) => r.player === previousHolder)
  ) {
    return { holder: previousHolder, length: top.length };
  }
  return { holder: null, length: top.length };
}

/** Legal midgame road tips from a vertex along the graph (neighbors). */
export function legalRoadExtensions(
  fromVertexId: string,
  roads: OwnedRoad[],
  player: number,
  placements: PlacedSettlement[] = []
): string[] {
  const vertices = getVertices();
  const origin = vertices.get(fromVertexId);
  if (!origin) return [];

  const anyKeys = new Set(roads.map(ownedRoadKey));

  // Must already touch the player's road network or own settlement/city.
  const playerNodes = new Set<string>();
  for (const r of roads) {
    if (r.player !== player) continue;
    playerNodes.add(r.fromVertexId);
    playerNodes.add(r.toVertexId);
  }
  for (const p of placements) {
    if (p.player === player) playerNodes.add(p.vertexId);
  }

  if (!playerNodes.has(fromVertexId)) return [];

  return origin.neighbors.filter((to) => {
    const key = roadEdgeKey(fromVertexId, to);
    return !anyKeys.has(key);
  });
}
