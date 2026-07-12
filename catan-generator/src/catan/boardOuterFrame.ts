import type { HexCoord } from './types';
import { getBoardSize, getEdgeHexSet, getLandSet } from './boardLayout';
import { getBoardHexCoords } from './boardLayout';
import { coordKey, hexCorner, hexNeighbor, hexToPixel } from './hex';

export interface Point {
  x: number;
  y: number;
}

export interface SideLine {
  start: Point;
  end: Point;
}

const POINT_EPS = 0.75;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointsEqual(a: Point, b: Point): boolean {
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

export function isEndCornerHex(coord: HexCoord, landSet: Set<string>): boolean {
  let landCornerCount = 0;
  for (let corner = 0; corner < 6; corner++) {
    const touchesLand = [coord, hexNeighbor(coord, (corner + 5) % 6), hexNeighbor(coord, corner)]
      .some((h) => landSet.has(coordKey(h)));
    if (touchesLand) landCornerCount++;
  }
  return landCornerCount === 2;
}

/** Brett-hjørne på endCornerHex – vann-hjørne ved landkanten mot nabo-brikke */
export function boardCornerPointOnHex(coord: HexCoord, hexSize: number): Point | null {
  const landSet = getLandSet();
  if (!isEndCornerHex(coord, landSet)) return null;

  const waterCorners = waterCornersForHex(coord, landSet);
  for (const wc of [...waterCorners].sort((a, b) => a - b)) {
    const prev = (wc + 5) % 6;
    const next = (wc + 1) % 6;
    const touchesLand = !waterCorners.has(prev) || !waterCorners.has(next);
    if (touchesLand) return hexCorner(coord, wc, hexSize);
  }

  return null;
}

/** Hjørne 2 langs siden – der to K-hexer møtes på ytterkanten */
export function sideJoinCornerOnHex(coord: HexCoord, hexSize: number): Point | null {
  const waterCorners = waterCornersForHex(coord, getLandSet());
  if (waterCorners.has(2)) return hexCorner(coord, 2, hexSize);
  return null;
}

function boardCenter(hexSize: number): Point {
  const boardSize = getBoardSize();
  const edgeSet = getEdgeHexSet(boardSize);
  const edgeCoords = getBoardHexCoords(boardSize).filter((c) =>
    edgeSet.has(coordKey(c))
  );
  const sum = edgeCoords.reduce(
    (acc, coord) => {
      const p = hexToPixel(coord, hexSize);
      return { x: acc.x + p.x, y: acc.y + p.y };
    },
    { x: 0, y: 0 }
  );
  return { x: sum.x / edgeCoords.length, y: sum.y / edgeCoords.length };
}

function offsetLineOutward(
  start: Point,
  end: Point,
  center: Point,
  distance: number
): SideLine {
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const toMid = { x: mx - center.x, y: my - center.y };
  const dot = nx * toMid.x + ny * toMid.y;
  const sign = dot > 0 ? 1 : -1;
  const ox = nx * distance * sign;
  const oy = ny * distance * sign;
  return {
    start: { x: start.x + ox, y: start.y + oy },
    end: { x: end.x + ox, y: end.y + oy },
  };
}

function distToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function outwardSide(a: Point, b: Point, p: Point, center: Point): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const toP = { x: p.x - center.x, y: p.y - center.y };
  const toMid = { x: (a.x + b.x) / 2 - center.x, y: (a.y + b.y) / 2 - center.y };
  const sideP = nx * toP.x + ny * toP.y;
  const sideMid = nx * toMid.x + ny * toMid.y;
  return sideP > 0 === sideMid > 0;
}

/** Apex-spisser på endCornerHex som skal dekkes av hjørne-kile */
export function apexPointsOnEndCorner(coord: HexCoord, hexSize: number): Point[] {
  const landSet = getLandSet();
  const waterCorners = waterCornersForHex(coord, landSet);
  const boardCorner = boardCornerPointOnHex(coord, hexSize);
  if (!boardCorner) return [];

  const tips: Point[] = [];
  for (const c of waterCorners) {
    const p = hexCorner(coord, c, hexSize);
    if (boardCorner && pointsEqual(p, boardCorner)) continue;
    tips.push(p);
  }
  return tips;
}

/** Offset vann-linje utover slik den passerer utenfor hjørne 2 og apex-spisser */
export function offsetWaterLine(
  start: Point,
  end: Point,
  coords: HexCoord[],
  hexSize: number
): SideLine {
  const landSet = getLandSet();
  const center = boardCenter(hexSize);
  const base = { start, end };

  let maxOut = 0;
  for (const coord of coords) {
    const c2 = sideJoinCornerOnHex(coord, hexSize);
    if (!c2) continue;
    const d = distToLine(c2, base.start, base.end);
    if (outwardSide(base.start, base.end, c2, center)) {
      maxOut = Math.max(maxOut, d);
    }
  }

  for (const coord of coords) {
    if (!isEndCornerHex(coord, landSet)) continue;
    for (const tip of apexPointsOnEndCorner(coord, hexSize)) {
      const d = distToLine(tip, base.start, base.end);
      if (outwardSide(base.start, base.end, tip, center)) {
        maxOut = Math.max(maxOut, d);
      }
    }
  }

  const pad = hexSize * 0.06;
  return offsetLineOutward(start, end, center, maxOut + pad);
}

/** Trekanter ved brett-hjørner – fyller gap mellom offset sjø-linje og hex-apex */
export function buildCornerCapPolygons(
  pieceData: { coords: HexCoord[]; waterLine: [Point, Point] | null }[],
  hexSize: number
): string[] {
  const caps: string[] = [];

  for (const { coords, waterLine } of pieceData) {
    const endCorner = coords.find((c) => isEndCornerHex(c, getLandSet()));
    if (!endCorner) continue;

    const corner = boardCornerPointOnHex(endCorner, hexSize);
    if (!corner) continue;

    const apex = apexPointsOnEndCorner(endCorner, hexSize);
    if (apex.length < 2) continue;

    const sortedApex = [...apex].sort((a, b) => {
      const aa = Math.atan2(a.y - corner.y, a.x - corner.x);
      const ab = Math.atan2(b.y - corner.y, b.x - corner.x);
      return aa - ab;
    });

    let waterNearCorner = corner;
    if (waterLine) {
      const [a, b] = waterLine;
      waterNearCorner = dist(a, corner) <= dist(b, corner) ? a : b;
    }

    const ring = [waterNearCorner, corner, ...sortedApex];
    const deduped: Point[] = [];
    for (const p of ring) {
      if (deduped.length === 0 || !pointsEqual(p, deduped[deduped.length - 1])) {
        deduped.push(p);
      }
    }
    if (deduped.length >= 3) {
      caps.push(deduped.map((p) => `${p.x},${p.y}`).join(' '));
    }
  }

  return caps;
}
