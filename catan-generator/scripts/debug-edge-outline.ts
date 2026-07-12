import { setBoardSize } from '../src/catan/boardLayout.ts';
import { getEdgePieces, getSingleEdgePieces } from '../src/catan/edgePieces.ts';
import { buildEdgePieceOutline } from '../src/catan/edgePieceGeometry.ts';
import { getBoardMapping } from '../src/catan/mapping.ts';

function analyze(size: 'base' | 'extension56') {
  setBoardSize(size);
  const mapping = getBoardMapping(size);
  const pieces = [...getEdgePieces(0, size), ...getSingleEdgePieces(size)];

  console.log(`=== ${size} ===`);
  for (const piece of pieces) {
    const labels = 'kLabels' in piece ? [...piece.kLabels] : [piece.kLabel];
    const coords = 'coords' in piece ? piece.coords : [piece.coord];
    const endHexes = labels.filter((lbl) => {
      const e = mapping.edgeByLabel.get(lbl)!;
      return e.landCorners.length === 2;
    });
    const outline = buildEdgePieceOutline(coords, 34);
    const hasApex = outline.some((p) => Math.abs(Math.abs(p.x) - 206) < 3 && Math.abs(Math.abs(p.y) - 17) < 3);
    console.log(
      `${piece.label} endHex=[${endHexes.join(',')}] pts=${outline.length}${hasApex ? ' HAS_APEX' : ''}`,
      outline.map((p) => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' → ')
    );
  }
}

analyze('base');
analyze('extension56');
