import type { HexCoord } from '../catan/types';
import { hexToPixel } from '../catan/hex';
import {
  buildEdgePieceOutline,
  outlineToPath,
  outlineToPolygonPoints,
} from '../catan/edgePieceGeometry';

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
  return coords.map((c) => `${c.q},${c.r}`).join('-');
}

/** Render kanthexer som én fysisk brikke med rette ytterkanter mot sjø */
export function EdgePieceShape({ coords, size, pieceLabel }: EdgePieceShapeProps) {
  const id = pieceId(coords, pieceLabel);
  const outline = buildEdgePieceOutline(coords, size);
  const polygonPoints = outlineToPolygonPoints(outline);
  const pathD = outlineToPath(outline);

  const center = coords.reduce(
    (acc, coord) => {
      const p = hexToPixel(coord, size);
      return { x: acc.x + p.x, y: acc.y + p.y };
    },
    { x: 0, y: 0 }
  );
  const cx = center.x / coords.length;
  const cy = center.y / coords.length;

  const isSingle = coords.length === 1;
  const badgeW = size * (isSingle ? 0.55 : 0.72);
  const badgeH = size * 0.34;
  const fontSize = size * (isSingle ? 0.22 : 0.26);

  if (!polygonPoints) return null;

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
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="2.5"
            floodColor="#0a2a40"
            floodOpacity="0.55"
          />
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

      <polygon
        points={polygonPoints}
        fill={`url(#edge-piece-grad-${id})`}
        stroke="none"
      />

      <path
        d={pathD}
        fill="none"
        stroke={PIECE_RIM}
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={pathD}
        fill="none"
        stroke={EDGE_STROKE}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

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
