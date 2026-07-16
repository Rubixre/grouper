import type { PlacedSettlement, Vertex } from './types';

/** Maks veiavstand (vertex-kanter) som teller som ekspansjonssone */
export const EXPANSION_MAX_DIST = 3;

/** Decay per steg utover dist=2 */
export const EXPANSION_DECAY = 0.55;

/** Skalerer summert hotspot-verdi inn i PSM-skalaen */
export const EXPANSION_SCALE = 0.16;

/** Straff når #1 og #2 ligger for nærme (overlappende sone) */
export const SPACING_CLOSE_PENALTY = 0.07;
/** Mild straff når #1 og #2 er svært langt fra hverandre uten midtsone-nytte */
export const SPACING_FAR_PENALTY = 0.03;
export const SPACING_CLOSE_DIST = 2;
export const SPACING_FAR_DIST = 6;

/**
 * Korteste avstand langs settlement-grafen (ubegrenset BFS).
 * null hvis frakoblet.
 */
export function vertexGraphDistance(
  fromId: string,
  toId: string,
  vertices: Map<string, Vertex>
): number | null {
  if (fromId === toId) return 0;
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

/** Vertices blokkert av distance rule (opptatt + naboer). */
export function blockedSettlementVertices(
  placed: PlacedSettlement[],
  vertices: Map<string, Vertex>
): Set<string> {
  const blocked = new Set<string>();
  for (const p of placed) {
    blocked.add(p.vertexId);
    const v = vertices.get(p.vertexId);
    if (!v) continue;
    for (const n of v.neighbors) blocked.add(n);
  }
  return blocked;
}

/**
 * Fremtidige landsbyplasser innen maxDist kanter fra `fromId`.
 * Hopper over dist 0–1 (ulovlig nærhet) og allerede blokkerte hjørner.
 */
export function expansionTargets(
  fromId: string,
  placed: PlacedSettlement[],
  vertices: Map<string, Vertex>,
  maxDist = EXPANSION_MAX_DIST
): Map<string, number> {
  const blocked = blockedSettlementVertices(placed, vertices);
  const dist = new Map<string, number>();
  const queue: string[] = [fromId];
  dist.set(fromId, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = dist.get(current)!;
    if (d >= maxDist) continue;
    const vertex = vertices.get(current);
    if (!vertex) continue;
    for (const neighbor of vertex.neighbors) {
      if (dist.has(neighbor)) continue;
      dist.set(neighbor, d + 1);
      queue.push(neighbor);
    }
  }

  const targets = new Map<string, number>();
  for (const [id, d] of dist) {
    if (d < 2 || d > maxDist) continue;
    if (blocked.has(id)) continue;
    if (!vertices.has(id)) continue;
    targets.set(id, d);
  }
  return targets;
}

/**
 * Ekspansjonspotensial: sum hotspot(target) × decay^(dist−2) × scale.
 * `hotspot` bør være en billig produksjons-/pip-proxy (ikke full PSM).
 */
export function expansionPotentialScore(
  fromId: string,
  placed: PlacedSettlement[],
  vertices: Map<string, Vertex>,
  hotspot: (vertexId: string) => number,
  maxDist = EXPANSION_MAX_DIST
): number {
  if (!vertices.has(fromId)) return 0;
  const targets = expansionTargets(fromId, placed, vertices, maxDist);
  let score = 0;
  for (const [id, d] of targets) {
    const value = hotspot(id);
    if (value <= 0) continue;
    const weight = EXPANSION_DECAY ** (d - 2);
    score += value * weight;
  }
  return score * EXPANSION_SCALE;
}

/**
 * Par-avstand: straff for for tett (samme ekspansjonssone) eller ekstremt langt.
 */
export function pairSpacingPenalty(
  firstId: string,
  secondId: string,
  vertices: Map<string, Vertex>
): number {
  const d = vertexGraphDistance(firstId, secondId, vertices);
  if (d === null) return SPACING_FAR_PENALTY;
  if (d <= SPACING_CLOSE_DIST) return SPACING_CLOSE_PENALTY;
  if (d >= SPACING_FAR_DIST) return SPACING_FAR_PENALTY;
  return 0;
}

/**
 * Kombinert ekspansjon for et par: sone fra begge landsbyer,
 * uten å dobbelttelle samme target (bruk beste decay).
 */
export function pairExpansionPotentialScore(
  firstId: string,
  secondId: string,
  placed: PlacedSettlement[],
  vertices: Map<string, Vertex>,
  hotspot: (vertexId: string) => number,
  maxDist = EXPANSION_MAX_DIST
): number {
  // Inkluder begge egne landsbyer som «placed» for blokkering av naboer
  const withPair: PlacedSettlement[] = [
    ...placed,
    { vertexId: firstId, player: -1, isCity: false },
    { vertexId: secondId, player: -1, isCity: false },
  ];
  // Unngå duplikat hvis allerede i placed
  const seen = new Set<string>();
  const uniquePlaced = withPair.filter((p) => {
    if (seen.has(p.vertexId)) return false;
    seen.add(p.vertexId);
    return true;
  });

  const fromFirst = expansionTargets(firstId, uniquePlaced, vertices, maxDist);
  const fromSecond = expansionTargets(secondId, uniquePlaced, vertices, maxDist);
  const bestDist = new Map<string, number>();

  for (const [id, d] of fromFirst) bestDist.set(id, d);
  for (const [id, d] of fromSecond) {
    const prev = bestDist.get(id);
    if (prev === undefined || d < prev) bestDist.set(id, d);
  }

  let score = 0;
  for (const [id, d] of bestDist) {
    const value = hotspot(id);
    if (value <= 0) continue;
    score += value * EXPANSION_DECAY ** (d - 2);
  }
  return score * EXPANSION_SCALE;
}
