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

  return (
    <g className="board-edge-masks" aria-hidden>
      {masks.map((rect) => (
        <polygon
          key={rect.label}
          points={edgeMaskToPolygonPoints(rect)}
          fill={OCEAN_FILL}
          stroke="none"
        />
      ))}
    </g>
  );
}
