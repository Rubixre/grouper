import type { BoardSize } from './boardLayout';
import { getBoardHexCoords, getEdgeHexSet } from './boardLayout';
import { coordKey, hexCorner, hexNeighbor, hexToPixel } from './hex';

export const BOARD_WATER_COLOR = '#1a5276';

interface Point {
  x: number;
  y: number;
}

interface Segment {
  a: Point;
  b: Point;
}

const POINT_EPS = 0.5;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointsEqual(a: Point, b: Point): boolean {
  return dist(a, b) < POINT_EPS;
}

function collectEdgeRingOuterSegments(
  edgeCoords: { q: number; r: number }[],
  edgeSet: Set<string>,
  hexSize: number
): Segment[] {
  const segments: Segment[] = [];

  for (const coord of edgeCoords) {
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = hexNeighbor(coord, edge);
      if (edgeSet.has(coordKey(neighbor))) continue;
      segments.push({
        a: hexCorner(coord, edge, hexSize),
        b: hexCorner(coord, (edge + 1) % 6, hexSize),
      });
    }
  }

  return segments;
}

function orderBoundaryLoop(segments: Segment[]): Point[] {
  if (segments.length === 0) return [];

  const remaining = segments.map((seg) => ({ ...seg }));
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

function boardCenter(edgeCoords: { q: number; r: number }[], hexSize: number): Point {
  const sum = edgeCoords.reduce(
    (acc, coord) => {
      const p = hexToPixel(coord, hexSize);
      return { x: acc.x + p.x, y: acc.y + p.y };
    },
    { x: 0, y: 0 }
  );
  return { x: sum.x / edgeCoords.length, y: sum.y / edgeCoords.length };
}

/** Del ytterløkke i kanter etter sektor rundt brettets sentrum */
function splitLoopBySectors(
  loop: Point[],
  center: Point,
  sectorCount = 6
): Point[][] {
  if (loop.length < 2) return [loop];

  const sectorFor = (p: Point) => {
    const angle = Math.atan2(p.y - center.y, p.x - center.x);
    return Math.floor(((angle + Math.PI) / (2 * Math.PI)) * sectorCount) % sectorCount;
  };

  const chains: Point[][] = [];
  let chain: Point[] = [loop[0]];
  let current = sectorFor(loop[0]);

  for (let i = 1; i < loop.length; i++) {
    const p = loop[i];
    const sector = sectorFor(p);
    if (sector !== current) {
      chains.push(chain);
      chain = [chain[chain.length - 1], p];
      current = sector;
    } else {
      chain.push(p);
    }
  }

  if (chain.length > 1) {
    if (chains.length > 0) {
      const last = chain.slice(0, -1);
      chains[0] = [...last, ...chains[0]];
    } else {
      chains.push(chain);
    }
  }

  return chains.filter((c) => c.length >= 2);
}

function buildChains(hexSize: number, boardSize: BoardSize): Point[][] {
  const edgeSet = getEdgeHexSet(boardSize);
  const edgeCoords = getBoardHexCoords(boardSize).filter((c) =>
    edgeSet.has(coordKey(c))
  );
  const loop = orderBoundaryLoop(
    collectEdgeRingOuterSegments(edgeCoords, edgeSet, hexSize)
  );
  const center = boardCenter(edgeCoords, hexSize);
  const sectors = boardSize === 'base' ? 6 : 8;
  return splitLoopBySectors(loop, center, sectors);
}

function extendPointOutward(p: Point, center: Point, amount: number): Point {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * amount, y: p.y + (dy / len) * amount };
}

/** Fyll mellom tagget ytterkant og rette linjer langs brettets kant */
export function buildOuterFrameWedges(hexSize: number, boardSize: BoardSize): string[] {
  const edgeSet = getEdgeHexSet(boardSize);
  const edgeCoords = getBoardHexCoords(boardSize).filter((c) =>
    edgeSet.has(coordKey(c))
  );
  const center = boardCenter(edgeCoords, hexSize);
  const pad = hexSize * 0.2;

  return buildChains(hexSize, boardSize)
    .filter((chain) => chain.length >= 2)
    .map((chain) =>
      chain
        .map((p) => extendPointOutward(p, center, pad))
        .map((p) => `${p.x},${p.y}`)
        .join(' ')
    );
}

export function buildOuterFrameStraightPath(
  hexSize: number,
  boardSize: BoardSize
): string {
  const chains = buildChains(hexSize, boardSize);
  if (chains.length === 0) return '';

  const parts: string[] = [];
  chains.forEach((chain, i) => {
    const start = chain[0];
    const end = chain[chain.length - 1];
    parts.push(`${i === 0 ? 'M' : 'L'} ${start.x} ${start.y} L ${end.x} ${end.y}`);
  });
  parts.push('Z');
  return parts.join(' ');
}
