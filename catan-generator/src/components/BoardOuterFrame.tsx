import type { BoardSize } from '../catan/types';
import {
  BOARD_WATER_COLOR,
  buildOuterFrameStraightPath,
  buildOuterFrameWedges,
} from '../catan/boardOuterFrame';

interface BoardOuterFrameProps {
  boardSize: BoardSize;
  hexSize: number;
}

/** Masker tagget hex-ytterkant med rette linjer i havfargen */
export function BoardOuterFrame({ boardSize, hexSize }: BoardOuterFrameProps) {
  const wedges = buildOuterFrameWedges(hexSize, boardSize);
  const straightPath = buildOuterFrameStraightPath(hexSize, boardSize);

  if (wedges.length === 0) return null;

  return (
    <g className="board-outer-frame" aria-hidden>
      {wedges.map((points, i) => (
        <polygon
          key={`outer-wedge-${i}`}
          points={points}
          fill={BOARD_WATER_COLOR}
          stroke="none"
        />
      ))}
      {straightPath && (
        <path
          d={straightPath}
          fill="none"
          stroke={BOARD_WATER_COLOR}
          strokeWidth={hexSize * 0.22}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}
