import type { BoardMapping } from '../catan/mapping';
import { hexCorner, hexToPixel } from '../catan/hex';

interface MappingOverlayProps {
  mapping: BoardMapping;
  hexSize: number;
  highlightEdge?: string | null;
  highlightCorner?: string | null;
  showEdgeCorners?: boolean;
}

export function MappingOverlay({
  mapping,
  hexSize,
  highlightEdge = null,
  highlightCorner = null,
  showEdgeCorners = true,
}: MappingOverlayProps) {
  return (
    <g className="mapping-overlay" pointerEvents="none">
      {/* K1–K18 on edge hex centers */}
      {mapping.edgeHexes.map((edge) => {
        const center = hexToPixel(edge.coord, hexSize);
        const active = highlightEdge === edge.label;
        return (
          <g key={edge.label}>
            <circle
              cx={center.x}
              cy={center.y}
              r={hexSize * 0.42}
              fill={active ? '#f39c12' : 'rgba(0,0,0,0.35)'}
              stroke="#fff"
              strokeWidth={active ? 2.5 : 1.5}
            />
            <text
              x={center.x}
              y={center.y + 5}
              textAnchor="middle"
              fill="#fff"
              fontSize={hexSize * 0.38}
              fontWeight={800}
            >
              {edge.label}
            </text>

            {/* Local corner indices 0–5 on edge hexes */}
            {showEdgeCorners &&
              Array.from({ length: 6 }, (_, corner) => {
                const pos = hexCorner(edge.coord, corner, hexSize);
                const isLand = edge.landCorners.includes(corner);
                return (
                  <g key={`${edge.label}-c${corner}`}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={hexSize * 0.18}
                      fill={isLand ? '#f1c40f' : 'rgba(255,255,255,0.85)'}
                      stroke={isLand ? '#d35400' : '#7f8c8d'}
                      strokeWidth={1}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 3}
                      textAnchor="middle"
                      fill="#1a1a1a"
                      fontSize={hexSize * 0.2}
                      fontWeight={700}
                    >
                      {corner}
                    </text>
                  </g>
                );
              })}
          </g>
        );
      })}

      {/* H1–H30 where edge hex meets land */}
      {mapping.coastCorners.map((corner) => {
        const pos = hexCorner(corner.anchor, corner.corner, hexSize);
        const active = highlightCorner === corner.label;
        return (
          <g key={corner.label}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={active ? 11 : 8}
              fill={active ? '#e74c3c' : '#f39c12'}
              stroke="#fff"
              strokeWidth={active ? 2.5 : 1.5}
            />
            <text
              x={pos.x}
              y={pos.y + 3.5}
              textAnchor="middle"
              fill="#1a1a1a"
              fontSize={9}
              fontWeight={800}
            >
              {corner.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
