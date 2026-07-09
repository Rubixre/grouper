import type { Board, PlacedSettlement, SettlementScore } from '../catan/types';
import type { BoardMapping } from '../catan/mapping';
import { getEdgePieces, getSingleEdgePieces } from '../catan/edgePieces';
import { hexCorner, hexToPixel } from '../catan/hex';
import { getVertices } from '../catan/settlements';
import { PLAYER_COLORS } from '../catan/simulator';
import { BoardHex } from './BoardHex';
import { EdgePieceShape } from './EdgePieceShape';
import { HarborIcon } from './HarborIcon';
import { MappingOverlay } from './MappingOverlay';

export const BOARD_HEX_SIZE = 34;

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

/** Havn plasseres i kanthex-senteret, lett ut mot sjøen – unngår å skjule tall på land */
function harborPosition(h: Board['harbors'][0], hexSize: number): { x: number; y: number } {
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
  const edgePieces = getEdgePieces(board.edgeRotation, board.boardSize);
  const singleEdgePieces = getSingleEdgePieces(board.boardSize);
  const landHexes = board.hexes.filter((h) => h.kind === 'land');

  const bounds = board.hexes.map((h) => hexToPixel(h.coord, HEX_SIZE));
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

      {edgePieces.map((piece) => (
        <EdgePieceShape
          key={piece.label}
          coords={[...piece.coords]}
          size={HEX_SIZE}
          pieceLabel={mappingMode ? piece.label : undefined}
        />
      ))}

      {singleEdgePieces.map((piece) => (
        <EdgePieceShape
          key={piece.label}
          coords={[piece.coord]}
          size={HEX_SIZE}
          pieceLabel={mappingMode ? piece.label : undefined}
        />
      ))}

      {landHexes.map((tile) => (
        <BoardHex
          key={`${tile.coord.q},${tile.coord.r}`}
          coord={tile.coord}
          kind={tile.kind}
          resource={tile.resource}
          number={tile.number}
          size={HEX_SIZE}
        />
      ))}

      {/* Havner – sentrert i kanthex (blå), med ressursspesifikke ikoner */}
      {!mappingMode &&
        board.harbors.map((h) => {
          const { x: hx, y: hy } = harborPosition(h, HEX_SIZE);
          const title = `${h.definition.name} (B${h.pieceGroup + 1}) på ${h.edgeHexLabel} → ${h.nodeLabels.join(', ')}`;

          return (
            <g key={h.definition.id} transform={`translate(${hx}, ${hy})`}>
              <HarborIcon
                harbor={h.definition.harbor}
                size={HEX_SIZE * 0.72}
                title={title}
              />
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
