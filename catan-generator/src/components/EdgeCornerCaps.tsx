import type { HexCoord } from '../catan/types';
import { buildCornerCapPolygons } from '../catan/boardOuterFrame';
import { getWaterLineForPiece } from '../catan/edgePieceGeometry';

const EDGE_FILL = '#2e86c1';

interface EdgeCornerCapsProps {
  pieceGroups: HexCoord[][];
  size: number;
}

/** Fyller gap ved brett-hjørner mellom offset sjø-linje og hex-apex */
export function EdgeCornerCaps({ pieceGroups, size }: EdgeCornerCapsProps) {
  const pieceData = pieceGroups.map((coords) => ({
    coords,
    waterLine: getWaterLineForPiece(coords, size),
  }));
  const caps = buildCornerCapPolygons(pieceData, size);

  if (caps.length === 0) return null;

  return (
    <g className="edge-corner-caps" aria-hidden>
      {caps.map((points, i) => (
        <polygon key={`cap-${i}`} points={points} fill={EDGE_FILL} stroke="none" />
      ))}
    </g>
  );
}
