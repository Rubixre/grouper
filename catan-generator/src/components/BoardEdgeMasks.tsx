import type { BoardSize } from '../catan/boardLayout';
import type { ExtensionEdgeOrder } from '../catan/extensionLayout';
import { EXTENSION_IDENTITY_ORDER } from '../catan/extensionLayout';
import {
  OCEAN_FILL,
  buildBoardEdgeMasks,
  edgeMaskToPolygonPoints,
} from '../catan/boardEdgeMasks';

interface BoardEdgeMasksProps {
  edgeRotation: number;
  boardSize: BoardSize;
  hexSize: number;
  extensionEdgeOrder?: ExtensionEdgeOrder;
}

const MASK_STROKE = '#154360';

/** Rette havfargede rektangler over taggete ytterkanter på kantbrikker */
export function BoardEdgeMasks({
  edgeRotation,
  boardSize,
  hexSize,
  extensionEdgeOrder = EXTENSION_IDENTITY_ORDER,
}: BoardEdgeMasksProps) {
  const masks = buildBoardEdgeMasks(
    edgeRotation,
    boardSize,
    hexSize,
    extensionEdgeOrder
  );
  const strokeWidth = hexSize * 0.12;

  return (
    <g className="board-edge-masks" aria-hidden>
      {masks.map((rect) => (
        <polygon
          key={rect.label}
          points={edgeMaskToPolygonPoints(rect)}
          fill={OCEAN_FILL}
          stroke={MASK_STROKE}
          strokeWidth={strokeWidth}
          strokeLinejoin="miter"
        />
      ))}
    </g>
  );
}
