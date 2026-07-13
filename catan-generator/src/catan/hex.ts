import type { HexCoord } from './types';

export function coordKey(c: HexCoord): string {
  return `${c.q},${c.r}`;
}

export function parseCoord(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function hexEqual(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

/** Axial neighbor directions (pointy-top) */
const DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

export function hexNeighbor(coord: HexCoord, direction: number): HexCoord {
  const d = DIRECTIONS[direction % 6];
  return { q: coord.q + d.q, r: coord.r + d.r };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - b.q - b.r) +
      Math.abs(a.r - b.r)) /
    2
  );
}

export function getNeighbors(coord: HexCoord): HexCoord[] {
  return DIRECTIONS.map((d) => ({ q: coord.q + d.q, r: coord.r + d.r }));
}

/** Hexes sharing an edge with `coord` that are in `boardSet` */
export function getBoardNeighbors(
  coord: HexCoord,
  boardSet: Set<string>
): HexCoord[] {
  return getNeighbors(coord).filter((n) => boardSet.has(coordKey(n)));
}

/** Pointy-top hex center in pixel space */
export function hexToPixel(coord: HexCoord, size: number): { x: number; y: number } {
  const x = size * Math.sqrt(3) * (coord.q + coord.r / 2);
  const y = size * (3 / 2) * coord.r;
  return { x, y };
}

/** Corner position for pointy-top hex, corner index 0..5 clockwise from top */
export function hexCorner(
  coord: HexCoord,
  corner: number,
  size: number
): { x: number; y: number } {
  const center = hexToPixel(coord, size);
  const angle = ((60 * corner - 30) * Math.PI) / 180;
  return {
    x: center.x + size * Math.cos(angle),
    y: center.y + size * Math.sin(angle),
  };
}

/** Midpoint of outward edge `edge` on hex */
export function hexEdgeMidpoint(
  coord: HexCoord,
  edge: number,
  size: number
): { x: number; y: number } {
  const c1 = hexCorner(coord, edge, size);
  const c2 = hexCorner(coord, (edge + 1) % 6, size);
  return { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
}

/** Angle from point toward board center (0,0) */
export function angleTowardCenter(x: number, y: number): number {
  return Math.atan2(y, x) + Math.PI;
}
