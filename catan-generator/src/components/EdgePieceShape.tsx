import type { HexCoord } from '../catan/types';
import { coordKey, hexCorner, hexNeighbor, hexToPixel } from '../catan/hex';

const EDGE_FILL = '#2e86c1';
const EDGE_FILL_LIGHT = '#5dade2';
const EDGE_STROKE = '#154360';
const PIECE_RIM = '#eaf2f8';

interface EdgePieceShapeProps {
  coords: HexCoord[];
  size: number;
  pieceLabel?: string;
}

function pieceId(coords: HexCoord[], pieceLabel?: string): string {
  if (pieceLabel) return pieceLabel.replace(/[^a-zA-Z0-9]/g, '');
  return coords.map(coordKey).join('-');
}

/** Render kanthexer som én fysisk brikke (B1–B10) */
export function EdgePieceShape({ coords, size, pieceLabel }: EdgePieceShapeProps) {
  const groupSet = new Set(coords.map(coordKey));
  const id = pieceId(coords, pieceLabel);
  const isSingle = coords.length === 1;

  const outerSegments: { x1: number; y1: number; x2: number; y2: number; key: string }[] =
    [];

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

  const center = coords.reduce(
    (acc, coord) => {
      const p = hexToPixel(coord, size);
      return { x: acc.x + p.x, y: acc.y + p.y };
    },
    { x: 0, y: 0 }
  );
  const cx = center.x / coords.length;
  const cy = center.y / coords.length;

  const badgeW = size * (isSingle ? 0.55 : 0.72);
  const badgeH = size * 0.34;
  const fontSize = size * (isSingle ? 0.22 : 0.26);

  return (
    <g className="edge-piece" filter={`url(#edge-piece-shadow-${id})`}>
      <defs>
        <filter
          id={`edge-piece-shadow-${id}`}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0a2a40" floodOpacity="0.55" />
        </filter>
        <linearGradient
          id={`edge-piece-grad-${id}`}
          x1={cx - size}
          y1={cy - size}
          x2={cx + size}
          y2={cy + size}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={EDGE_FILL_LIGHT} />
          <stop offset="100%" stopColor={EDGE_FILL} />
        </linearGradient>
      </defs>

      {coords.map((coord) => {
        const points = Array.from({ length: 6 }, (_, i) => {
          const { x, y } = hexCorner(coord, i, size);
          return `${x},${y}`;
        }).join(' ');
        return (
          <polygon
            key={coordKey(coord)}
            points={points}
            fill={`url(#edge-piece-grad-${id})`}
            stroke="none"
          />
        );
      })}

      {outerSegments.map((seg) => (
        <line
          key={`rim-${seg.key}`}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke={PIECE_RIM}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {outerSegments.map((seg) => (
        <line
          key={seg.key}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke={EDGE_STROKE}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {pieceLabel && (
        <g className="edge-piece-badge" pointerEvents="none">
          <rect
            x={cx - badgeW / 2}
            y={cy - badgeH / 2}
            width={badgeW}
            height={badgeH}
            rx={badgeH * 0.28}
            fill="rgba(10, 42, 64, 0.72)"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={1.2}
          />
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#fff"
            fontSize={fontSize}
            fontWeight={800}
            letterSpacing="0.04em"
          >
            {pieceLabel}
          </text>
        </g>
      )}
    </g>
  );
}
