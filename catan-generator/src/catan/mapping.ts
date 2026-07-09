import type { HexCoord } from './types';
import {
  BOARD_HEX_COORDS,
  getEdgeHexSet,
  getLandSet,
} from './boardLayout';
import { coordKey, hexCorner, hexNeighbor, hexToPixel } from './hex';
import { getVertices } from './settlements';

export interface NumberedEdgeHex {
  /** Display label, e.g. K1 */
  label: string;
  /** 1-based index, clockwise from top */
  index: number;
  coord: HexCoord;
  /** Hex-local corner indices (0–5) that touch land */
  landCorners: number[];
  /** Hex-local corner indices that face open water */
  waterCorners: number[];
}

export interface CoastMeetCorner {
  /** Display label, e.g. H1 */
  label: string;
  /** 1-based index, clockwise from top */
  index: number;
  vertexId: string;
  anchor: HexCoord;
  corner: number;
  edgeHexLabels: string[];
  landCoords: HexCoord[];
}

export interface BoardMapping {
  edgeHexes: NumberedEdgeHex[];
  coastCorners: CoastMeetCorner[];
  edgeByCoord: Map<string, NumberedEdgeHex>;
  edgeByLabel: Map<string, NumberedEdgeHex>;
  cornerByVertexId: Map<string, CoastMeetCorner>;
  cornerByLabel: Map<string, CoastMeetCorner>;
}

let mappingCache: BoardMapping | null = null;

function vertexAngle(anchor: HexCoord, corner: number): number {
  const { x, y } = hexCorner(anchor, corner, 1);
  return Math.atan2(y, x);
}

function landCornersForEdgeHex(coord: HexCoord, landSet: Set<string>): {
  landCorners: number[];
  waterCorners: number[];
} {
  const landCorners: number[] = [];
  const waterCorners: number[] = [];

  for (let corner = 0; corner < 6; corner++) {
    const touchesLand = [coord, hexNeighbor(coord, (corner + 5) % 6), hexNeighbor(coord, corner)]
      .some((h) => landSet.has(coordKey(h)));
    if (touchesLand) landCorners.push(corner);
    else waterCorners.push(corner);
  }

  return { landCorners, waterCorners };
}

export function buildBoardMapping(): BoardMapping {
  const edgeSet = getEdgeHexSet();
  const landSet = getLandSet();

  const edgeCoords = BOARD_HEX_COORDS.filter((c) => edgeSet.has(coordKey(c))).sort(
    (a, b) => {
      const pa = hexToPixel(a, 1);
      const pb = hexToPixel(b, 1);
      return Math.atan2(pa.y, pa.x) - Math.atan2(pb.y, pb.x);
    }
  );

  const edgeHexes: NumberedEdgeHex[] = edgeCoords.map((coord, i) => {
    const index = i + 1;
    const { landCorners, waterCorners } = landCornersForEdgeHex(coord, landSet);
    return {
      label: `K${index}`,
      index,
      coord,
      landCorners,
      waterCorners,
    };
  });

  const edgeByCoord = new Map(
    edgeHexes.map((e) => [coordKey(e.coord), e] as const)
  );
  const edgeByLabel = new Map(edgeHexes.map((e) => [e.label, e] as const));

  const vertices = getVertices();
  const coastRaw = [...vertices.values()]
    .filter((v) => {
      const hasEdge = v.hexes.some((h) => edgeSet.has(coordKey(h)));
      const hasLand = v.hexes.some((h) => landSet.has(coordKey(h)));
      return hasEdge && hasLand;
    })
    .sort((a, b) => vertexAngle(a.anchor, a.corner) - vertexAngle(b.anchor, b.corner));

  const coastCorners: CoastMeetCorner[] = coastRaw.map((v, i) => {
    const index = i + 1;
    const edgeHexLabels = v.hexes
      .filter((h) => edgeSet.has(coordKey(h)))
      .map((h) => edgeByCoord.get(coordKey(h))!.label)
      .sort();

    return {
      label: `H${index}`,
      index,
      vertexId: v.id,
      anchor: v.anchor,
      corner: v.corner,
      edgeHexLabels,
      landCoords: v.hexes.filter((h) => landSet.has(coordKey(h))),
    };
  });

  const cornerByVertexId = new Map(
    coastCorners.map((c) => [c.vertexId, c] as const)
  );
  const cornerByLabel = new Map(coastCorners.map((c) => [c.label, c] as const));

  return {
    edgeHexes,
    coastCorners,
    edgeByCoord,
    edgeByLabel,
    cornerByVertexId,
    cornerByLabel,
  };
}

export function getBoardMapping(): BoardMapping {
  if (!mappingCache) mappingCache = buildBoardMapping();
  return mappingCache;
}

export function resetBoardMapping(): void {
  mappingCache = null;
}

export function formatCoord(c: HexCoord): string {
  return `(${c.q}, ${c.r})`;
}
