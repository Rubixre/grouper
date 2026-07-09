import type { Board, PlacedSettlement, SettlementScore } from '../catan/types';
import type { BoardMapping } from '../catan/mapping';
import { harborShortLabel } from '../catan/harbors';
import { hexCorner, hexToPixel } from '../catan/hex';
import { getVertices } from '../catan/settlements';
import { PLAYER_COLORS } from '../catan/simulator';
import { BoardHex } from './BoardHex';
import { MappingOverlay } from './MappingOverlay';

export const BOARD_HEX_SIZE = 34;

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
  mappingMode?: boolean;
  mapping?: BoardMapping | null;
  highlightEdge?: string | null;
  highlightCorner?: string | null;
}

const HEX_SIZE = BOARD_HEX_SIZE;

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
  mappingMode = false,
  mapping = null,
  highlightEdge = null,
  highlightCorner = null,
}: BoardViewProps) {
  const maxScore = highlightedVertices[0]?.total ?? 1;

  const sortedHexes = [...board.hexes].sort((a, b) => {
    if (a.kind === b.kind) return 0;
    return a.kind === 'edge' ? -1 : 1;
  });

  const bounds = sortedHexes.map((h) => hexToPixel(h.coord, HEX_SIZE));
  const pad = HEX_SIZE * 1.8;
  const minX = Math.min(...bounds.map((b) => b.x)) - pad;
  const maxX = Math.max(...bounds.map((b) => b.x)) + pad;
  const minY = Math.min(...bounds.map((b) => b.y)) - pad;
  const maxY = Math.max(...bounds.map((b) => b.y)) + pad;

  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      className="board-svg"
      role="img"
      aria-label="Catan-brett"
    >
      <rect x={minX} y={minY} width={width} height={height} fill="#1a5276" />

      {sortedHexes.map((tile) => (
        <BoardHex
          key={`${tile.coord.q},${tile.coord.r}`}
          coord={tile.coord}
          kind={tile.kind}
          resource={tile.resource}
          number={tile.number}
          size={HEX_SIZE}
        />
      ))}

      {/* Fixed harbors on K-hexes, mellom to H-noder */}
      {!mappingMode &&
        board.harbors.map((h) => {
          const vertices = getVertices();
          const vA = vertices.get(h.nodeVertexIds[0]);
          const vB = vertices.get(h.nodeVertexIds[1]);
          if (!vA || !vB) return null;

          const pA = hexCorner(vA.anchor, vA.corner, HEX_SIZE);
          const pB = hexCorner(vB.anchor, vB.corner, HEX_SIZE);
          const hx = (pA.x + pB.x) / 2;
          const hy = (pA.y + pB.y) / 2;
          const angle = h.angle;

          const harbor = h.definition.harbor;
          const color =
            harbor.kind === 'generic'
              ? HARBOR_COLORS.generic
              : HARBOR_COLORS[harbor.resource] ?? '#1a5276';

          const label = harborShortLabel(harbor);

          return (
            <g
              key={h.definition.id}
              transform={`translate(${hx}, ${hy}) rotate(${(angle * 180) / Math.PI})`}
            >
              <rect
                x={-HEX_SIZE * 0.75}
                y={-HEX_SIZE * 0.32}
                width={HEX_SIZE * 1.5}
                height={HEX_SIZE * 0.64}
                rx={5}
                fill={color}
                stroke="#fff"
                strokeWidth={2}
                opacity={0.95}
              />
              <text
                x={0}
                y={4}
                textAnchor="middle"
                fill="#fff"
                fontSize={10}
                fontWeight={700}
                transform={`rotate(${(-angle * 180) / Math.PI})`}
              >
                ⚓ {label}
              </text>
              <title>
                {h.definition.name} på {h.edgeHexLabel} → {h.nodeLabels.join(', ')}
              </title>
            </g>
          );
        })}

      {mappingMode && mapping && (
        <MappingOverlay
          mapping={mapping}
          hexSize={HEX_SIZE}
          highlightEdge={highlightEdge}
          highlightCorner={highlightCorner}
        />
      )}

      {/* Settlement markers */}
      {!mappingMode &&
        placements.map((p, i) => {
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
      {!mappingMode &&
        interactive &&
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
