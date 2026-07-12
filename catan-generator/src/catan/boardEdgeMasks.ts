import type { BoardSize } from './boardLayout';
import type { ExtensionEdgeOrder } from './extensionLayout';
import { EXTENSION_IDENTITY_ORDER } from './extensionLayout';
import { getBoardMapping } from './mapping';
import type { NumberedEdgeHex } from './mapping';
import { getEdgePieces } from './edgePieces';
import { hexCorner, hexToPixel } from './hex';

export interface Point {
  x: number;
  y: number;
}

export interface EdgeMaskRect {
  /** Brikke-etikett, f.eks. B6 */
  label: string;
  /** Fire hjørner, med klokken fra inner-start */
  corners: [Point, Point, Point, Point];
}

const OCEAN_FILL = '#1a5276';
const POINT_EPS = 0.75;

export { OCEAN_FILL };

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointsEqual(a: Point, b: Point): boolean {
  return dist(a, b) < POINT_EPS;
}

function boardCenter(size: BoardSize, hexSize: number): Point {
  const mapping = getBoardMapping(size);
  const sum = mapping.edgeHexes.reduce(
    (acc, edge) => {
      const p = hexToPixel(edge.coord, hexSize);
      return { x: acc.x + p.x, y: acc.y + p.y };
    },
    { x: 0, y: 0 }
  );
  return { x: sum.x / mapping.edgeHexes.length, y: sum.y / mapping.edgeHexes.length };
}

/** Vann-hjørne på hexA som deles med hexB */
function sharedWaterCorner(
  hexA: NumberedEdgeHex,
  hexB: NumberedEdgeHex,
  hexSize: number
): number | null {
  for (const corner of hexA.waterCorners) {
    const pA = hexCorner(hexA.coord, corner, hexSize);
    for (const other of hexB.waterCorners) {
      const pB = hexCorner(hexB.coord, other, hexSize);
      if (pointsEqual(pA, pB)) return corner;
    }
  }
  return null;
}

function nextRingHex(
  label: string,
  mapping: ReturnType<typeof getBoardMapping>
): NumberedEdgeHex {
  const ring = mapping.edgeHexes;
  const index = ring.findIndex((e) => e.label === label);
  return ring[(index + 1) % ring.length];
}

/**
 * Innerkant for kantmaske – to noder langs ytterkanten på sidehexene.
 * Normalt: join mot endehjørnehex + join mot forrige sidehex (f.eks. K16/K17 c2).
 * Når disse faller sammen (B1: K1 c5 = K2 c3): fra endehjørnehex til neste K i ringen.
 */
function maskLineEndpoints(
  endHex: NumberedEdgeHex,
  sideA: NumberedEdgeHex,
  sideB: NumberedEdgeHex,
  mapping: ReturnType<typeof getBoardMapping>,
  hexSize: number
): [Point, Point] {
  const joinToEnd = sharedWaterCorner(sideA, endHex, hexSize);
  const joinBToA = sharedWaterCorner(sideB, sideA, hexSize);
  const joinBToNext = sharedWaterCorner(sideB, nextRingHex(sideB.label, mapping), hexSize);

  if (joinToEnd != null && joinBToA != null) {
    const pEnd = hexCorner(sideA.coord, joinToEnd, hexSize);
    const pMid = hexCorner(sideB.coord, joinBToA, hexSize);
    if (!pointsEqual(pEnd, pMid)) {
      return [pEnd, pMid];
    }
  }

  // B1: K1 node 5 = K2 node 3 – bruk endehjørnehex → neste i ringen (K1 c3 → K2 c5)
  if (joinToEnd != null && joinBToNext != null) {
    return [
      hexCorner(sideA.coord, joinToEnd, hexSize),
      hexCorner(sideB.coord, joinBToNext, hexSize),
    ];
  }

  return [
    hexCorner(sideA.coord, 2, hexSize),
    hexCorner(sideB.coord, 2, hexSize),
  ];
}

function outwardNormal(start: Point, end: Point, center: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  if (nx * (mx - center.x) + ny * (my - center.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function buildMaskForSideHexes(
  label: string,
  endHex: NumberedEdgeHex,
  sideA: NumberedEdgeHex,
  sideB: NumberedEdgeHex,
  mapping: ReturnType<typeof getBoardMapping>,
  hexSize: number,
  center: Point
): EdgeMaskRect {
  const [p1, p2] = maskLineEndpoints(endHex, sideA, sideB, mapping, hexSize);

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  const extend = hexSize * 2.8;
  const innerStart = { x: p1.x - ux * extend, y: p1.y - uy * extend };
  const innerEnd = { x: p2.x + ux * extend, y: p2.y + uy * extend };

  const normal = outwardNormal(innerStart, innerEnd, center);
  const width = hexSize * 1.65;
  const ox = normal.x * width;
  const oy = normal.y * width;

  return {
    label,
    corners: [
      innerStart,
      innerEnd,
      { x: innerEnd.x + ox, y: innerEnd.y + oy },
      { x: innerStart.x + ox, y: innerStart.y + oy },
    ],
  };
}

/** 6 rektangler som retter ut ytterkantene – én per kantbrikke (B1–B6) */
export function buildBoardEdgeMasks(
  rotation: number,
  boardSize: BoardSize,
  hexSize: number,
  extensionEdgeOrder: ExtensionEdgeOrder = EXTENSION_IDENTITY_ORDER
): EdgeMaskRect[] {
  const mapping = getBoardMapping(boardSize);
  const center = boardCenter(boardSize, hexSize);

  return getEdgePieces(rotation, boardSize, extensionEdgeOrder).map((piece) => {
    const [endLabel, sideALabel, sideBLabel] = piece.kLabels;
    const endHex = mapping.edgeByLabel.get(endLabel)!;
    const sideA = mapping.edgeByLabel.get(sideALabel)!;
    const sideB = mapping.edgeByLabel.get(sideBLabel)!;
    return buildMaskForSideHexes(
      piece.label,
      endHex,
      sideA,
      sideB,
      mapping,
      hexSize,
      center
    );
  });
}

export function edgeMaskToPolygonPoints(rect: EdgeMaskRect): string {
  return rect.corners.map((p) => `${p.x},${p.y}`).join(' ');
}
