import type { Board, PlacedSettlement, SettlementScore } from '../catan/types';
import { harborSlotsForPiece } from '../catan/boardLayout';
import { hexCorner, hexEdgeMidpoint, hexToPixel } from '../catan/hex';
import { getVertices } from '../catan/settlements';
import { PLAYER_COLORS } from '../catan/simulator';
import { BoardHex } from './BoardHex';

const HARBOR_COLORS: Record<string, string> = {
  generic: '#1a5276',
  wood: '#2d6a4f',
  brick: '#c1440e',
  sheep: '#52b788',
  wheat: '#f4a261',
};

interface BoardViewProps {
  board: Board;
  placements?: PlacedSettlement[];
  highlightedVertices?: SettlementScore[];
  selectedVertex?: string | null;
  onVertexClick?: (vertexId: string) => void;
  interactive?: boolean;
}

const HEX_SIZE = 42;

function getVertexPixel(vertexId: string, size: number): { x: number; y: number } | null {
  const vertices = getVertices();
  const v = vertices.get(vertexId);
  if (!v) return null;
  return hexCorner(v.anchor, v.corner, size);
}

export function BoardView({
  board,
  placements = [],
  highlightedVertices = [],
  selectedVertex,
  onVertexClick,
  interactive = false,
}: BoardViewProps) {
  const maxScore = highlightedVertices[0]?.total ?? 1;

  const bounds = board.hexes.map((h) => hexToPixel(h.coord, HEX_SIZE));
  const minX = Math.min(...bounds.map((b) => b.x)) - HEX_SIZE * 2;
  const maxX = Math.max(...bounds.map((b) => b.x)) + HEX_SIZE * 2;
  const minY = Math.min(...bounds.map((b) => b.y)) - HEX_SIZE * 2;
  const maxY = Math.max(...bounds.map((b) => b.y)) + HEX_SIZE * 2;

  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      className="board-svg"
      role="img"
      aria-label="Catan-brett"
    >
      <rect x={minX} y={minY} width={width} height={height} fill="#4a90c2" />

      {board.hexes.map((tile) => (
        <BoardHex
          key={`${tile.coord.q},${tile.coord.r}`}
          coord={tile.coord}
          resource={tile.resource}
          number={tile.number}
          size={HEX_SIZE}
        />
      ))}

      {/* Harbor pieces */}
      {board.harbors.map((h) => {
        const slots = harborSlotsForPiece(h.startSlot).map(
          (i) => board.coastSlots[i]
        );
        const midpoints = slots.map((s) => hexEdgeMidpoint(s.hex, s.edge, HEX_SIZE));
        const hx = midpoints.reduce((s, p) => s + p.x, 0) / midpoints.length;
        const hy = midpoints.reduce((s, p) => s + p.y, 0) / midpoints.length;
        const angle = Math.atan2(hy, hx);

        const harbor = h.piece.harbor;
        const color =
          harbor.kind === 'generic'
            ? HARBOR_COLORS.generic
            : HARBOR_COLORS[harbor.resource] ?? '#1a5276';

        const label =
          harbor.kind === 'generic'
            ? '3:1'
            : `2:1 ${harbor.resource === 'wood' ? 'T' : harbor.resource === 'brick' ? 'Te' : harbor.resource === 'sheep' ? 'U' : 'K'}`;

        return (
          <g
            key={h.piece.id}
            transform={`translate(${hx}, ${hy}) rotate(${(angle * 180) / Math.PI})`}
          >
            <rect
              x={-HEX_SIZE * 0.9}
              y={-HEX_SIZE * 0.35}
              width={HEX_SIZE * 1.8}
              height={HEX_SIZE * 0.7}
              rx={6}
              fill={color}
              stroke="#fff"
              strokeWidth={2}
              opacity={0.92}
            />
            <text
              x={0}
              y={5}
              textAnchor="middle"
              fill="#fff"
              fontSize={11}
              fontWeight={700}
              transform={`rotate(${(-angle * 180) / Math.PI})`}
            >
              ⚓ {label}
            </text>
          </g>
        );
      })}

      {/* Settlement markers */}
      {placements.map((p, i) => {
        const pos = getVertexPixel(p.vertexId, HEX_SIZE);
        if (!pos) return null;
        return (
          <g key={`${p.vertexId}-${i}`}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={10}
              fill={PLAYER_COLORS[p.player]}
              stroke="#fff"
              strokeWidth={2}
            />
            <text
              x={pos.x}
              y={pos.y + 4}
              textAnchor="middle"
              fill="#fff"
              fontSize={10}
              fontWeight={700}
            >
              {p.player + 1}
            </text>
          </g>
        );
      })}

      {/* Interactive vertex highlights */}
      {interactive &&
        highlightedVertices.map((score) => {
          const pos = getVertexPixel(score.vertexId, HEX_SIZE);
          if (!pos) return null;
          const intensity = 0.3 + 0.7 * (score.total / maxScore);
          const isSelected = selectedVertex === score.vertexId;
          return (
            <circle
              key={score.vertexId}
              cx={pos.x}
              cy={pos.y}
              r={isSelected ? 14 : 11}
              fill={`rgba(46, 204, 113, ${intensity * 0.6})`}
              stroke={isSelected ? '#fff' : `rgba(46, 204, 113, ${intensity})`}
              strokeWidth={isSelected ? 3 : 2}
              style={{ cursor: 'pointer' }}
              onClick={() => onVertexClick?.(score.vertexId)}
            >
              <title>
                Score: {score.total.toFixed(3)} (prod: {score.production.toFixed(3)},
                variasjon: {score.diversity.toFixed(3)}, havn: {score.harbor.toFixed(3)})
              </title>
            </circle>
          );
        })}
    </svg>
  );
}
