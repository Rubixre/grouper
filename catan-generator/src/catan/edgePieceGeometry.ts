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

const POINT_EPS = 0.75;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointsEqual(a: Point, b: Point): boolean {
  return dist(a, b) < POINT_EPS;
}

function waterCornersForHex(coord: HexCoord, landSet: Set<string>): Set<number> {
  const water = new Set<number>();
  for (let corner = 0; corner < 6; corner++) {
    const touchesLand = [coord, hexNeighbor(coord, (corner + 5) % 6), hexNeighbor(coord, corner)]
      .some((h) => landSet.has(coordKey(h)));
    if (!touchesLand) water.add(corner);
  }
  return water;
}

/** Hjørnehex – 2 hjørner mot land (typisk ytterste hex på en 3-hex brikke) */
function isEndCornerHex(coord: HexCoord, landSet: Set<string>): boolean {
  let landCornerCount = 0;
  for (let corner = 0; corner < 6; corner++) {
    const touchesLand = [coord, hexNeighbor(coord, (corner + 5) % 6), hexNeighbor(coord, corner)]
      .some((h) => landSet.has(coordKey(h)));
    if (touchesLand) landCornerCount++;
  }
  return landCornerCount === 2;
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

function chainSegmentsBetween(
  segments: BoundarySegment[],
  from: Point,
  to: Point
): Point[] {
  const remaining = [...segments];
  const path: Point[] = [from];
  let tip = from;

  while (remaining.length > 0 && !pointsEqual(tip, to)) {
    const index = remaining.findIndex(
      (seg) => pointsEqual(seg.a, tip) || pointsEqual(seg.b, tip)
    );
    if (index < 0) break;

    const seg = remaining.splice(index, 1)[0];
    tip = pointsEqual(seg.a, tip) ? seg.b : seg.a;
    path.push(tip);
  }

  return path;
}

/** Knutepunkter der land- og sjø-side møtes på brikkens ytterkant */
function landWaterJunctions(segments: BoundarySegment[]): Point[] {
  const byPoint = new Map<string, { land: boolean; water: boolean; p: Point }>();

  const key = (p: Point) => `${Math.round(p.x * 10)}:${Math.round(p.y * 10)}`;

  for (const seg of segments) {
    for (const p of [seg.a, seg.b]) {
      const k = key(p);
      const entry = byPoint.get(k) ?? { land: false, water: false, p };
      if (seg.water) entry.water = true;
      else entry.land = true;
      byPoint.set(k, entry);
    }
  }

  return [...byPoint.values()]
    .filter((e) => e.land && e.water)
    .map((e) => e.p);
}

/** Spisser på hjørnehex som skal klippes bort (kun sjø, ikke delt med nabohex i brikken) */
function apexPointsOnEndCorner(
  coord: HexCoord,
  coords: HexCoord[],
  segments: BoundarySegment[],
  size: number,
  landSet: Set<string>
): Point[] {
  const groupSet = new Set(coords.map(coordKey));
  const waterCorners = waterCornersForHex(coord, landSet);
  const tips: Point[] = [];

  for (let edge = 0; edge < 6; edge++) {
    if (groupSet.has(coordKey(hexNeighbor(coord, edge)))) continue;
    if (!waterCorners.has(edge) || !waterCorners.has((edge + 1) % 6)) continue;

    const a = hexCorner(coord, edge, size);
    const b = hexCorner(coord, (edge + 1) % 6, size);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const junctions = landWaterJunctions(segments);
    const isApex = !junctions.some((j) => pointsEqual(j, a) || pointsEqual(j, b));
    if (isApex) {
      tips.push(a, b, mid);
    }
  }

  return tips;
}

function buildWaterPath(
  coords: HexCoord[],
  segments: BoundarySegment[],
  size: number,
  landSet: Set<string>
): Point[] {
  const junctions = landWaterJunctions(segments);
  if (junctions.length < 2) return [];

  const endCorner = coords.find((c) => isEndCornerHex(c, landSet));
  const apexPoints =
    endCorner && coords.length > 1
      ? apexPointsOnEndCorner(endCorner, coords, segments, size, landSet)
      : [];

  const isApex = (p: Point) => apexPoints.some((a) => pointsEqual(a, p));

  // Enkelt-hex hjørnebrikke (2 land/sjø-knutepunkter): klipp vannkile til korde
  if (coords.length === 1 && junctions.length >= 2) {
    const [a, b] = junctions;
    return [a, b];
  }

  // 3-hex sidebrikke: rett linje mellom hjørnehex og motsatt land/sjø-knutepunkt
  const boardCorner = endCorner
    ? junctions.find((j) =>
        boardCornerPointsOnHex(endCorner, coords, size, landSet).some((b) =>
          pointsEqual(b, j)
        )
      ) ?? junctions[0]
    : junctions[0];

  const farCandidates = junctions.filter((j) => !pointsEqual(j, boardCorner) && !isApex(j));
  const far =
    farCandidates.length > 0
      ? farCandidates.reduce((best, j) =>
          dist(j, boardCorner) > dist(best, boardCorner) ? j : best
        )
      : junctions.find((j) => !pointsEqual(j, boardCorner));

  if (!far) return [];
  return [boardCorner, far];
}

/** Land/vann-knutepunkt på hjørnehex der brikken møter nabo-brikke */
function boardCornerPointsOnHex(
  coord: HexCoord,
  coords: HexCoord[],
  size: number,
  landSet: Set<string>
): Point[] {
  const groupSet = new Set(coords.map(coordKey));
  const waterCorners = waterCornersForHex(coord, landSet);
  const corners: Point[] = [];

  for (let corner = 0; corner < 6; corner++) {
    if (waterCorners.has(corner)) continue;

    const edgeBefore = (corner + 5) % 6;
    const edgeAfter = corner;
    const beforeOut = !groupSet.has(coordKey(hexNeighbor(coord, edgeBefore)));
    const afterOut = !groupSet.has(coordKey(hexNeighbor(coord, edgeAfter)));
    if (!beforeOut || !afterOut) continue;

    const beforeWater =
      waterCorners.has(edgeBefore) || waterCorners.has((edgeBefore + 1) % 6);
    const afterWater =
      waterCorners.has(edgeAfter) || waterCorners.has((edgeAfter + 1) % 6);

    if (beforeWater !== afterWater) {
      corners.push(hexCorner(coord, corner, size));
    }
  }

  return corners;
}

function combineOutline(waterPath: Point[], landChain: Point[]): Point[] {
  const outline = [...waterPath];
  for (let i = 1; i < landChain.length; i++) {
    const next = landChain[i];
    const prev = outline[outline.length - 1];
    if (!pointsEqual(next, prev)) outline.push(next);
  }
  return outline;
}

/** Ytre omriss – rette kanter, egne regler for hjørnehex (2 landhjørner) */
export function buildEdgePieceOutline(coords: HexCoord[], size: number): Point[] {
  const landSet = getLandSet();
  const segments = collectBoundarySegments(coords, size, landSet);
  const landSegments = segments.filter((s) => !s.water);
  const waterPath = buildWaterPath(coords, segments, size, landSet);

  if (waterPath.length >= 2) {
    const endCorner = coords.find((c) => isEndCornerHex(c, landSet));
    const endKey = endCorner ? coordKey(endCorner) : null;

    let filteredLand = endKey
      ? landSegments.filter((s) => !s.key.startsWith(`${endKey}-`))
      : landSegments;

    if (coords.length === 1) {
      filteredLand = landSegments;
    }

    let landChain = chainSegmentsBetween(
      filteredLand,
      waterPath[waterPath.length - 1],
      waterPath[0]
    );

    if (
      landChain.length >= 2 &&
      !pointsEqual(landChain[landChain.length - 1], waterPath[0])
    ) {
      landChain.push(waterPath[0]);
    }

    if (landChain.length >= 2) {
      const outline = combineOutline(waterPath, landChain);
      if (outline.length >= 3) return outline;
    }
  }

  return orderBoundaryLoop(segments);
}

export function outlineToPolygonPoints(outline: Point[]): string {
  return outline.map((p) => `${p.x},${p.y}`).join(' ');
}

export function outlineToPath(outline: Point[]): string {
  if (outline.length === 0) return '';
  const [first, ...rest] = outline;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`;
}
