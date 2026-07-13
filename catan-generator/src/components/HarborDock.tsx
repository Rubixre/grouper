import type { PlacedHarbor } from '../catan/types';
import { hexCorner, hexToPixel } from '../catan/hex';
import { getVertices } from '../catan/settlements';
import { getHarborTheme } from './HarborIcon';

const DOCK_WOOD = '#8b5a2b';
const DOCK_WOOD_DARK = '#5c3d1e';
const DOCK_WOOD_LIGHT = '#a0714f';
const PILING = '#4a3220';

interface Point {
  x: number;
  y: number;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function unitVector(from: Point, to: Point): { ux: number; uy: number; len: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len, len };
}

function offsetPoint(p: Point, ux: number, uy: number, dist: number): Point {
  return { x: p.x + ux * dist, y: p.y + uy * dist };
}

function perp(ux: number, uy: number): { px: number; py: number } {
  return { px: -uy, py: ux };
}

/** Plank polygon: center line from a→b with given half-width */
function plankPolygon(a: Point, b: Point, halfWidth: number): string {
  const { ux, uy } = unitVector(a, b);
  const { px, py } = perp(ux, uy);
  return [
    `${a.x + px * halfWidth},${a.y + py * halfWidth}`,
    `${b.x + px * halfWidth},${b.y + py * halfWidth}`,
    `${b.x - px * halfWidth},${b.y - py * halfWidth}`,
    `${a.x - px * halfWidth},${a.y - py * halfWidth}`,
  ].join(' ');
}

function DockPiling({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r + 1.2} fill="rgba(0,0,0,0.2)" />
      <circle cx={x} cy={y} r={r} fill={PILING} stroke={DOCK_WOOD_DARK} strokeWidth={0.6} />
      <circle cx={x - r * 0.25} cy={y - r * 0.25} r={r * 0.35} fill={DOCK_WOOD_LIGHT} opacity={0.45} />
    </>
  );
}

export function harborPosition(
  h: PlacedHarbor,
  hexSize: number
): { x: number; y: number } {
  const center = hexToPixel(h.edgeCoord, hexSize);
  const vertices = getVertices();
  const vA = vertices.get(h.nodeVertexIds[0]);
  const vB = vertices.get(h.nodeVertexIds[1]);
  if (!vA || !vB) return center;

  const pA = hexCorner(vA.anchor, vA.corner, hexSize);
  const pB = hexCorner(vB.anchor, vB.corner, hexSize);
  const coastX = (pA.x + pB.x) / 2;
  const coastY = (pA.y + pB.y) / 2;
  const t = 0.35;
  return {
    x: center.x + (coastX - center.x) * t,
    y: center.y + (coastY - center.y) * t,
  };
}

function getVertexPixel(vertexId: string, size: number): Point | null {
  const vertices = getVertices();
  const v = vertices.get(vertexId);
  if (!v) return null;
  return hexCorner(v.anchor, v.corner, size);
}

interface HarborDockProps {
  harbor: PlacedHarbor;
  hexSize: number;
  harborPos: Point;
}

export function HarborDock({ harbor, hexSize, harborPos }: HarborDockProps) {
  const nodeA = getVertexPixel(harbor.nodeVertexIds[0], hexSize);
  const nodeB = getVertexPixel(harbor.nodeVertexIds[1], hexSize);
  if (!nodeA || !nodeB) return null;

  const theme = getHarborTheme(harbor.definition.harbor);
  const coastMid = midpoint(nodeA, nodeB);
  const coastEdge = unitVector(nodeA, nodeB);
  const { px, py } = perp(coastEdge.ux, coastEdge.uy);
  const toSea = unitVector(coastMid, harborPos);

  const wharfHalf = hexSize * 0.11;
  const pierHalf = hexSize * 0.075;
  const pierEnd = offsetPoint(coastMid, toSea.ux, toSea.uy, toSea.len * 0.88);
  const pierStart = offsetPoint(coastMid, toSea.ux, toSea.uy, hexSize * 0.04);

  const wharfA = offsetPoint(nodeA, toSea.ux, toSea.uy, hexSize * 0.03);
  const wharfB = offsetPoint(nodeB, toSea.ux, toSea.uy, hexSize * 0.03);

  const sidePierAEnd = offsetPoint(
    offsetPoint(nodeA, toSea.ux, toSea.uy, hexSize * 0.05),
    toSea.ux,
    toSea.uy,
    toSea.len * 0.55
  );
  const sidePierBEnd = offsetPoint(
    offsetPoint(nodeB, toSea.ux, toSea.uy, hexSize * 0.05),
    toSea.ux,
    toSea.uy,
    toSea.len * 0.55
  );

  const plankCount = 5;
  const wharfPlanks = Array.from({ length: plankCount }, (_, i) => {
    const t = (i + 0.5) / plankCount;
    const cx = wharfA.x + (wharfB.x - wharfA.x) * t;
    const cy = wharfA.y + (wharfB.y - wharfA.y) * t;
    const half = wharfHalf * 0.35;
    return {
      points: [
        `${cx + px * half},${cy + py * half}`,
        `${cx + px * half + toSea.ux * hexSize * 0.08},${cy + py * half + toSea.uy * hexSize * 0.08}`,
        `${cx - px * half + toSea.ux * hexSize * 0.08},${cy - py * half + toSea.uy * hexSize * 0.08}`,
        `${cx - px * half},${cy - py * half}`,
      ].join(' '),
      shade: i % 2 === 0 ? DOCK_WOOD : DOCK_WOOD_LIGHT,
    };
  });

  const pierPlankCount = 4;
  const pierPlanks = Array.from({ length: pierPlankCount }, (_, i) => {
    const t0 = i / pierPlankCount;
    const t1 = (i + 1) / pierPlankCount;
    const a = {
      x: pierStart.x + (pierEnd.x - pierStart.x) * t0,
      y: pierStart.y + (pierEnd.y - pierStart.y) * t0,
    };
    const b = {
      x: pierStart.x + (pierEnd.x - pierStart.x) * t1,
      y: pierStart.y + (pierEnd.y - pierStart.y) * t1,
    };
    return {
      points: plankPolygon(a, b, pierHalf),
      shade: i % 2 === 0 ? DOCK_WOOD_LIGHT : DOCK_WOOD,
    };
  });

  const pilingR = hexSize * 0.045;
  const pilings: Point[] = [
    pierStart,
    midpoint(pierStart, pierEnd),
    pierEnd,
    sidePierAEnd,
    sidePierBEnd,
    offsetPoint(wharfA, toSea.ux, toSea.uy, hexSize * 0.06),
    offsetPoint(wharfB, toSea.ux, toSea.uy, hexSize * 0.06),
  ];

  return (
    <g className="harbor-dock" aria-hidden>
      <polygon
        points={plankPolygon(wharfA, wharfB, wharfHalf)}
        fill={DOCK_WOOD_DARK}
        stroke={DOCK_WOOD_DARK}
        strokeWidth={0.8}
        opacity={0.35}
      />
      {wharfPlanks.map((plank, i) => (
        <polygon
          key={`wharf-${i}`}
          points={plank.points}
          fill={plank.shade}
          stroke={DOCK_WOOD_DARK}
          strokeWidth={0.5}
        />
      ))}

      {pierPlanks.map((plank, i) => (
        <polygon
          key={`pier-${i}`}
          points={plank.points}
          fill={plank.shade}
          stroke={DOCK_WOOD_DARK}
          strokeWidth={0.5}
        />
      ))}

      <polygon
        points={plankPolygon(
          offsetPoint(nodeA, toSea.ux, toSea.uy, hexSize * 0.05),
          sidePierAEnd,
          pierHalf * 0.7
        )}
        fill={DOCK_WOOD}
        stroke={DOCK_WOOD_DARK}
        strokeWidth={0.45}
        opacity={0.92}
      />
      <polygon
        points={plankPolygon(
          offsetPoint(nodeB, toSea.ux, toSea.uy, hexSize * 0.05),
          sidePierBEnd,
          pierHalf * 0.7
        )}
        fill={DOCK_WOOD}
        stroke={DOCK_WOOD_DARK}
        strokeWidth={0.45}
        opacity={0.92}
      />

      {pilings.map((p, i) => (
        <DockPiling key={`piling-${i}`} x={p.x} y={p.y} r={pilingR} />
      ))}

      <circle
        cx={nodeA.x}
        cy={nodeA.y}
        r={hexSize * 0.07}
        fill={theme.accent}
        stroke="#fff"
        strokeWidth={1.2}
        opacity={0.85}
      />
      <circle
        cx={nodeB.x}
        cy={nodeB.y}
        r={hexSize * 0.07}
        fill={theme.accent}
        stroke="#fff"
        strokeWidth={1.2}
        opacity={0.85}
      />
    </g>
  );
}
