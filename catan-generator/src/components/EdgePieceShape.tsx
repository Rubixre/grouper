import type { HexCoord } from '../catan/types';
import { coordKey, hexCorner, hexNeighbor } from '../catan/hex';

const EDGE_FILL = '#3498db';
const EDGE_STROKE = '#2471a3';

interface EdgePieceShapeProps {
  coords: HexCoord[];
  size: number;
  pieceLabel?: string;
}

/** Render 3 linked edge hexes as one piece (no internal borders) */
export function EdgePieceShape({ coords, size, pieceLabel }: EdgePieceShapeProps) {
  const groupSet = new Set(coords.map(coordKey));

  const outerSegments: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];

  for (const coord of coords) {
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = hexNeighbor(coord, edge);
      if (groupSet.has(coordKey(neighbor))) continue;
      const p1 = hexCorner(coord, edge, size);
      const p2 = hexCorner(coord, (edge + 1) % 6, size);
      outerSegments.push({
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        key: `${coordKey(coord)}-${edge}`,
      });
    }
  }

  const cx =
    coords.reduce((s, c) => s + hexCorner(c, 0, size).x, 0) / coords.length;
  const cy =
    coords.reduce((s, c) => s + hexCorner(c, 0, size).y, 0) / coords.length;

  return (
    <g className="edge-piece">
      {coords.map((coord) => {
        const points = Array.from({ length: 6 }, (_, i) => {
          const { x, y } = hexCorner(coord, i, size);
          return `${x},${y}`;
        }).join(' ');
        return (
          <polygon
            key={coordKey(coord)}
            points={points}
            fill={EDGE_FILL}
            stroke="none"
          />
        );
      })}
      {outerSegments.map((seg) => (
        <line
          key={seg.key}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke={EDGE_STROKE}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      ))}
      {pieceLabel && (
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fill="rgba(255,255,255,0.55)"
          fontSize={size * 0.28}
          fontWeight={700}
        >
          {pieceLabel}
        </text>
      )}
    </g>
  );
}
