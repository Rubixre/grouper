import type { HexCoord } from './types';
import { getLandSet } from './boardLayout';
import { coordKey, hexCorner, hexNeighbor } from './hex';

interface Point {
  x: number;
  y: number;
}

interface BoundarySegment {
  a: Point;
  b: Point;
  water: boolean;
  key: string;
}

const POINT_EPS = 0.5;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointsEqual(a: Point, b: Point): boolean {
  return dist(a, b) < POINT_EPS;
}

/** Hjørner som kun grenser til sjø (ikke land) */
function waterCornersForHex(coord: HexCoord, landSet: Set<string>): Set<number> {
  const water = new Set<number>();
  for (let corner = 0; corner < 6; corner++) {
    const touchesLand = [coord, hexNeighbor(coord, (corner + 5) % 6), hexNeighbor(coord, corner)]
      .some((h) => landSet.has(coordKey(h)));
    if (!touchesLand) water.add(corner);
  }
  return water;
}

function collectBoundarySegments(
  coords: HexCoord[],
  size: number,
  landSet: Set<string>
): BoundarySegment[] {
  const groupSet = new Set(coords.map(coordKey));
  const segments: BoundarySegment[] = [];

  for (const coord of coords) {
    const waterCorners = waterCornersForHex(coord, landSet);
    for (let edge = 0; edge < 6; edge++) {
      if (groupSet.has(coordKey(hexNeighbor(coord, edge)))) continue;
      const a = hexCorner(coord, edge, size);
      const b = hexCorner(coord, (edge + 1) % 6, size);
      const water = waterCorners.has(edge) && waterCorners.has((edge + 1) % 6);
      segments.push({ a, b, water, key: `${coordKey(coord)}-${edge}` });
    }
  }

  return segments;
}

/** Slå sammen sjøsegmenter til én rett linje – skjuler taggete ytterhjørner */
function mergeWaterChains(segments: BoundarySegment[]): BoundarySegment[] {
  const land = segments.filter((s) => !s.water);
  const water = segments.filter((s) => s.water);
  const used = new Set<number>();
  const merged: BoundarySegment[] = [...land];

  for (let i = 0; i < water.length; i++) {
    if (used.has(i)) continue;

    let chainA = water[i].a;
    let chainB = water[i].b;
    used.add(i);

    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < water.length; j++) {
        if (used.has(j)) continue;
        const seg = water[j];
        if (pointsEqual(seg.a, chainB)) {
          chainB = seg.b;
          used.add(j);
          extended = true;
        } else if (pointsEqual(seg.b, chainB)) {
          chainB = seg.a;
          used.add(j);
          extended = true;
        } else if (pointsEqual(seg.b, chainA)) {
          chainA = seg.a;
          used.add(j);
          extended = true;
        } else if (pointsEqual(seg.a, chainA)) {
          chainA = seg.b;
          used.add(j);
          extended = true;
        }
      }
    }

    merged.push({
      a: chainA,
      b: chainB,
      water: true,
      key: `water-${i}`,
    });
  }

  return merged;
}

function orderBoundaryLoop(segments: BoundarySegment[]): Point[] {
  if (segments.length === 0) return [];

  const remaining = [...segments];
  const first = remaining.shift()!;
  const loop: Point[] = [first.a];
  let tip = first.b;

  while (remaining.length > 0) {
    const index = remaining.findIndex(
      (seg) => pointsEqual(seg.a, tip) || pointsEqual(seg.b, tip)
    );
    if (index < 0) break;

    const seg = remaining.splice(index, 1)[0];
    tip = pointsEqual(seg.a, tip) ? seg.b : seg.a;
    if (!pointsEqual(tip, loop[0])) loop.push(tip);
  }

  if (loop.length > 1 && pointsEqual(loop[loop.length - 1], loop[0])) {
    loop.pop();
  }

  return loop;
}

/** Ytre omriss for kantbrikke – sjøsiden forenkles til rette linjer */
export function buildEdgePieceOutline(coords: HexCoord[], size: number): Point[] {
  const landSet = getLandSet();
  const raw = collectBoundarySegments(coords, size, landSet);
  const simplified = mergeWaterChains(raw);
  return orderBoundaryLoop(simplified);
}

export function outlineToPolygonPoints(outline: Point[]): string {
  return outline.map((p) => `${p.x},${p.y}`).join(' ');
}

export function outlineToPath(outline: Point[]): string {
  if (outline.length === 0) return '';
  const [first, ...rest] = outline;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`;
}
