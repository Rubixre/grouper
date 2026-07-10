import type { Board, PlacedSettlement, SettlementScore } from '../catan/types';
import type { BoardMapping } from '../catan/mapping';
import { getEdgePieces, getSingleEdgePieces } from '../catan/edgePieces';
import { hexCorner, hexToPixel } from '../catan/hex';
import { getVertices } from '../catan/settlements';
import { PLAYER_COLORS } from '../catan/simulator';
import { BoardHex } from './BoardHex';
import { EdgePieceShape } from './EdgePieceShape';
import { HarborIcon, getHarborTheme } from './HarborIcon';
import { MappingOverlay } from './MappingOverlay';
import type { PlacedHarbor } from '../catan/types';

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
const TOP_PLACEMENT_MARKERS = 8;

const PLACEMENT_RANK_COLORS = [
  '#f1c40f',
  '#2ecc71',
  '#58d68d',
  '#7dcea0',
  '#a9dfbf',
  '#abebc6',
  '#d5f5e3',
  '#eafaf1',
] as const;

function placementRankColor(rank: number): string {
  return PLACEMENT_RANK_COLORS[Math.min(rank - 1, PLACEMENT_RANK_COLORS.length - 1)];
}

function placementScoreTitle(score: SettlementScore, rank: number): string {
  const lines = [
    `#${rank} · Score ${score.total.toFixed(2)}`,
    `Produksjon ${score.production.toFixed(2)}`,
    `Dekning ${score.diversity.toFixed(2)}`,
  ];
  if (score.placementKind === 'second') {
    lines.push(
      `Utfylling ${((score.portfolio ?? 0) - (score.overlap ?? 0)).toFixed(2)}`,
      `Overlapp −${(score.overlap ?? 0).toFixed(2)}`
    );
  }
  if (score.harbor > 0) lines.push(`Havn +${score.harbor.toFixed(3)}`);
  return lines.join('\n');
}

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

function HarborPortLinks({
  harbor,
  hexSize,
}: {
  harbor: PlacedHarbor;
  hexSize: number;
}) {
  const harborPos = harborPosition(harbor, hexSize);
  const nodeA = getVertexPixel(harbor.nodeVertexIds[0], hexSize);
  const nodeB = getVertexPixel(harbor.nodeVertexIds[1], hexSize);
  if (!nodeA || !nodeB) return null;

  const theme = getHarborTheme(harbor.definition.harbor);

  return (
    <g className="harbor-port" aria-hidden>
      <line
        className="harbor-port-gate"
        x1={nodeA.x}
        y1={nodeA.y}
        x2={nodeB.x}
        y2={nodeB.y}
        stroke={theme.accent}
        strokeWidth={3.5}
        strokeLinecap="round"
        opacity={0.9}
      />
      <line
        className="harbor-port-spoke"
        x1={harborPos.x}
        y1={harborPos.y}
        x2={nodeA.x}
        y2={nodeA.y}
        stroke="#fff"
        strokeWidth={1.6}
        strokeDasharray="5 4"
        strokeLinecap="round"
        opacity={0.75}
      />
      <line
        className="harbor-port-spoke"
        x1={harborPos.x}
        y1={harborPos.y}
        x2={nodeB.x}
        y2={nodeB.y}
        stroke="#fff"
        strokeWidth={1.6}
        strokeDasharray="5 4"
        strokeLinecap="round"
        opacity={0.75}
      />
      <circle
        className="harbor-port-node"
        cx={nodeA.x}
        cy={nodeA.y}
        r={3.5}
        fill={theme.accent}
        stroke="#fff"
        strokeWidth={1.2}
      />
      <circle
        className="harbor-port-node"
        cx={nodeB.x}
        cy={nodeB.y}
        r={3.5}
        fill={theme.accent}
        stroke="#fff"
        strokeWidth={1.2}
      />
    </g>
  );
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
  const topPlacements = highlightedVertices.slice(0, TOP_PLACEMENT_MARKERS);
  const otherPlacements = highlightedVertices.slice(TOP_PLACEMENT_MARKERS);
  const edgePieces = getEdgePieces(
    board.edgeRotation,
    board.boardSize,
    board.extensionEdgeOrder
  );
  const singleEdgePieces = getSingleEdgePieces(
    board.boardSize,
    board.extensionEdgeOrder
  );
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
        />
      ))}

      {singleEdgePieces.map((piece) => (
        <EdgePieceShape
          key={piece.label}
          coords={[piece.coord]}
          size={HEX_SIZE}
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

      {/* Havnporter – linjer til tilkoblede H-noder */}
      {!mappingMode &&
        board.harbors.map((h) => (
          <HarborPortLinks key={`port-${h.definition.id}`} harbor={h} hexSize={HEX_SIZE} />
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

      {/* Øvrige gyldige plasseringer – klikkbare, uten rang */}
      {!mappingMode &&
        interactive &&
        otherPlacements.map((score) => {
          const pos = getVertexPixel(score.vertexId, HEX_SIZE);
          if (!pos) return null;

          const isSelected = selectedVertex === score.vertexId;
          const rank =
            highlightedVertices.findIndex((s) => s.vertexId === score.vertexId) + 1;

          return (
            <g
              key={`other-${score.vertexId}`}
              className={`placement-marker placement-marker-other ${isSelected ? 'selected' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => onVertexClick?.(score.vertexId)}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isSelected ? 10 : 7}
                fill="rgba(255,255,255,0.28)"
                stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.55)'}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              <title>
                {placementScoreTitle(score, rank)} (rang #{rank})
              </title>
            </g>
          );
        })}

      {/* Anbefalte plasseringer under simulering */}
      {!mappingMode &&
        interactive &&
        topPlacements.map((score, index) => {
          const pos = getVertexPixel(score.vertexId, HEX_SIZE);
          if (!pos) return null;

          const rank = index + 1;
          const isSelected = selectedVertex === score.vertexId;
          const fill = placementRankColor(rank);
          const radius = rank === 1 ? 16 : rank <= 3 ? 14 : 12;
          const labelFill = rank <= 2 ? '#1a252f' : '#145a32';

          return (
            <g
              key={score.vertexId}
              className={`placement-marker ${isSelected ? 'selected' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => onVertexClick?.(score.vertexId)}
            >
              {rank === 1 && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius + 5}
                  fill="none"
                  stroke="#f1c40f"
                  strokeWidth={2}
                  opacity={0.55}
                  className="placement-marker-pulse"
                />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius}
                fill={fill}
                fillOpacity={0.92}
                stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.85)'}
                strokeWidth={isSelected ? 3 : 2}
              />
              <text
                x={pos.x}
                y={pos.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={labelFill}
                fontSize={rank === 1 ? 11 : 10}
                fontWeight={800}
                stroke="#fff"
                strokeWidth={0.5}
                paintOrder="stroke"
              >
                {rank}
              </text>
              <title>{placementScoreTitle(score, rank)}</title>
            </g>
          );
        })}
    </svg>
  );
}
