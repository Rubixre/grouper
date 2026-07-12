import type { BoardSize } from './boardLayout';
import type { ExtensionEdgeOrder } from './extensionLayout';
import { EXTENSION_IDENTITY_ORDER } from './extensionLayout';
import type { HexCoord } from './types';
import { getBoardMapping } from './mapping';
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

export { OCEAN_FILL };

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

/** Node 2 på sidehex – der K-hexer møtes langs ytterkanten */
function sideHexNodeTwo(coord: HexCoord, hexSize: number): Point {
  return hexCorner(coord, 2, hexSize);
}

function outwardNormal(
  start: Point,
  end: Point,
  center: Point
): Point {
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
  sideCoords: [HexCoord, HexCoord],
  hexSize: number,
  center: Point
): EdgeMaskRect {
  const [a, b] = sideCoords;
  const p1 = sideHexNodeTwo(a, hexSize);
  const p2 = sideHexNodeTwo(b, hexSize);

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
    const sideLabels = piece.kLabels.slice(1) as [string, string];
    const sideCoords = sideLabels.map((lbl) => mapping.edgeByLabel.get(lbl)!.coord) as [
      HexCoord,
      HexCoord,
    ];
    return buildMaskForSideHexes(piece.label, sideCoords, hexSize, center);
  });
}

export function edgeMaskToPolygonPoints(rect: EdgeMaskRect): string {
  return rect.corners.map((p) => `${p.x},${p.y}`).join(' ');
}
