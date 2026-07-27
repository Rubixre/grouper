import type { Board, PlacedSettlement, SettlementScore } from '../catan/types';
import type { BoardMapping } from '../catan/mapping';
import type { SimulationConfig } from '../catan/playerConfig';
import { getPlayerConfig } from '../catan/playerConfig';
import { getEdgePieces, getSingleEdgePieces } from '../catan/edgePieces';
import { hexCorner, hexToPixel } from '../catan/hex';
import { getVertices } from '../catan/settlements';
import { BoardHex } from './BoardHex';
import { EdgePieceShape } from './EdgePieceShape';
import { BoardEdgeMasks } from './BoardEdgeMasks';
import { HarborIcon } from './HarborIcon';
import { HarborDock, harborPosition } from './HarborDock';
import { MappingOverlay } from './MappingOverlay';

export const BOARD_HEX_SIZE = 42;

interface BoardViewProps {
  board: Board;
  placements?: PlacedSettlement[];
  playerConfig?: SimulationConfig;
  highlightedVertices?: SettlementScore[];
  previewSecondVertex?: string | null;
  selectedVertex?: string | null;
  harborPlanHighlight?: {
    firstVertexId: string;
    secondVertexId?: string;
    harborNodeVertexIds: [string, string];
  } | null;
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
  ];
  if (score.placementKind === 'second') {
    lines[1] = `Parprod. ${score.production.toFixed(2)}`;
    if (score.portfolio && score.portfolio > 0) {
      lines.push(`Byggbarhet +${score.portfolio.toFixed(2)}`);
    }
    if (score.overlap && score.overlap > 0) {
      lines.push(`Overlapp −${score.overlap.toFixed(2)}`);
    }
  }
  if (score.expansion && score.expansion > 0) {
    lines.push(`Ekspansjon +${score.expansion.toFixed(3)}`);
  }
  if (score.robberExposure && score.robberExposure > 0) {
    lines.push(`Robber −${score.robberExposure.toFixed(3)}`);
  }
  if (score.harbor > 0) lines.push(`Havn +${score.harbor.toFixed(3)}`);
  return lines.join('\n');
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
  playerConfig,
  highlightedVertices = [],
  previewSecondVertex = null,
  selectedVertex,
  harborPlanHighlight = null,
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
    board.extensionEdgeOrder,
    board.edgePieceOrder
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

  const playerColor = (playerIndex: number) =>
    playerConfig
      ? getPlayerConfig(playerConfig, playerIndex).color
      : ['#c0392b', '#e8d4b0', '#2f5fa8', '#e6b800', '#1f8a7a', '#6b3a8c'][playerIndex];

  const previewPos = previewSecondVertex
    ? getVertexPixel(previewSecondVertex, HEX_SIZE)
    : null;

  const harborFirstPos = harborPlanHighlight
    ? getVertexPixel(harborPlanHighlight.firstVertexId, HEX_SIZE)
    : null;
  const harborSecondPos =
    harborPlanHighlight?.secondVertexId != null
      ? getVertexPixel(harborPlanHighlight.secondVertexId, HEX_SIZE)
      : null;
  const selectedPos =
    selectedVertex &&
    !(harborPlanHighlight && selectedVertex === harborPlanHighlight.firstVertexId)
      ? getVertexPixel(selectedVertex, HEX_SIZE)
      : null;

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

      <BoardEdgeMasks
        edgeRotation={board.edgeRotation}
        boardSize={board.boardSize}
        hexSize={HEX_SIZE}
        extensionEdgeOrder={board.extensionEdgeOrder}
        edgePieceOrder={board.edgePieceOrder}
      />

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
          <HarborDock
            key={`dock-${h.definition.id}`}
            harbor={h}
            hexSize={HEX_SIZE}
            harborPos={harborPosition(h, HEX_SIZE)}
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
              fill={playerColor(p.player)}
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

      {!mappingMode && previewPos && !harborPlanHighlight?.secondVertexId && (
        <g className="second-settlement-preview" aria-label="Forventet landsby nr. 2">
          <circle
            cx={previewPos.x}
            cy={previewPos.y}
            r={14}
            fill="none"
            stroke="#2ecc71"
            strokeWidth={2.5}
            strokeDasharray="5 4"
            opacity={0.9}
          />
          <text
            x={previewPos.x}
            y={previewPos.y + 22}
            textAnchor="middle"
            fill="#eafaf1"
            fontSize={9}
            fontWeight={700}
          >
            #2?
          </text>
        </g>
      )}

      {!mappingMode && harborPlanHighlight && harborFirstPos && (
        <g className="harbor-plan-markers" aria-label="Havnstrategi på brettet">
          <circle
            cx={harborFirstPos.x}
            cy={harborFirstPos.y}
            r={18}
            fill="none"
            stroke="#f39c12"
            strokeWidth={3}
            className="harbor-plan-pulse"
          />
          <circle
            cx={harborFirstPos.x}
            cy={harborFirstPos.y}
            r={13}
            fill="#f39c12"
            fillOpacity={0.95}
            stroke="#fff"
            strokeWidth={2.5}
          />
          <text
            x={harborFirstPos.x}
            y={harborFirstPos.y + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#1a252f"
            fontSize={11}
            fontWeight={800}
          >
            1
          </text>
          {harborSecondPos && (
            <>
              <circle
                cx={harborSecondPos.x}
                cy={harborSecondPos.y}
                r={14}
                fill="none"
                stroke="#1abc9c"
                strokeWidth={2.5}
                strokeDasharray="5 4"
              />
              <circle
                cx={harborSecondPos.x}
                cy={harborSecondPos.y}
                r={9}
                fill="#1abc9c"
                fillOpacity={0.9}
                stroke="#fff"
                strokeWidth={2}
              />
              <text
                x={harborSecondPos.x}
                y={harborSecondPos.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#0b3d2e"
                fontSize={10}
                fontWeight={800}
              >
                2
              </text>
            </>
          )}
          {harborPlanHighlight.harborNodeVertexIds.map((nodeId) => {
            const nodePos = getVertexPixel(nodeId, HEX_SIZE);
            if (!nodePos) return null;
            return (
              <g key={`harbor-node-${nodeId}`}>
                <circle
                  cx={nodePos.x}
                  cy={nodePos.y}
                  r={7}
                  fill="#3498db"
                  fillOpacity={0.85}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
                <text
                  x={nodePos.x}
                  y={nodePos.y + 14}
                  textAnchor="middle"
                  fill="#eafaf1"
                  fontSize={8}
                  fontWeight={700}
                >
                  havn
                </text>
              </g>
            );
          })}
        </g>
      )}

      {!mappingMode && selectedPos && (
        <g className="selected-vertex-marker" aria-label="Valgt plassering">
          <circle
            cx={selectedPos.x}
            cy={selectedPos.y}
            r={16}
            fill="none"
            stroke="#fff"
            strokeWidth={3}
            opacity={0.95}
          />
        </g>
      )}
    </svg>
  );
}
