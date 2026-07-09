export type ResourceType = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | 'desert';

export type HarborType =
  | { kind: 'generic' }
  | { kind: 'resource'; resource: Exclude<ResourceType, 'desert'> };

export interface HexCoord {
  q: number;
  r: number;
}

export type HexKind = 'land' | 'edge';

export interface HexTile {
  coord: HexCoord;
  kind: HexKind;
  resource: ResourceType | null;
  number: number | null;
}

export interface CoastSlot {
  index: number;
  hex: HexCoord;
  /** Outward-facing edge direction (0-5) */
  edge: number;
}

export interface HarborDefinition {
  id: string;
  name: string;
  harbor: HarborType;
  /** Physical piece group 0–5 (B1–B6), default G0 = K18,K1,K2 */
  pieceGroup: number;
  /** Position within the 3-hex piece (0, 1, 2) */
  hexOffset: number;
}

export interface PlacedHarbor {
  definition: HarborDefinition;
  pieceGroup: number;
  edgeHexLabel: string;
  nodeLabels: [string, string];
  edgeCoord: HexCoord;
  nodeVertexIds: [string, string];
  /** Radians, mot land mellom de to nodene */
  angle: number;
}

/** @deprecated Old 3-slot frame pieces */
export interface HarborPiece {
  id: string;
  name: string;
  harbor: HarborType;
  slotSpan: 3;
}

/** @deprecated */
export interface PlacedHarborPiece {
  piece: HarborPiece;
  startSlot: number;
}

export interface GeneratorSettings {
  /** When true (default), 6 and 8 may not be placed on adjacent hexes */
  noAdjacent6And8: boolean;
  /** When true (default), 2 and 12 may not be placed on adjacent hexes */
  noAdjacent2And12: boolean;
  /** When true (default), identical resources may not be placed on adjacent hexes */
  noAdjacentSameResource: boolean;
  /** When true (default), identical numbers may not be placed on adjacent hexes */
  noAdjacentSameNumber: boolean;
}

export const DEFAULT_SETTINGS: GeneratorSettings = {
  noAdjacent6And8: true,
  noAdjacent2And12: true,
  noAdjacentSameResource: true,
  noAdjacentSameNumber: true,
};

export interface Board {
  hexes: HexTile[];
  harbors: PlacedHarbor[];
  coastSlots: CoastSlot[];
  /** Edge piece rotation 0–5 (each step = 1/6 turn clockwise) */
  edgeRotation: number;
}

export interface Vertex {
  id: string;
  hexes: HexCoord[];
  /** Canonical hex for rendering this vertex */
  anchor: HexCoord;
  /** Corner index (0-5) on anchor hex */
  corner: number;
  /** Adjacent vertex ids (distance-1 on settlement graph) */
  neighbors: string[];
}

export interface ResourceWeights {
  wood: number;
  brick: number;
  sheep: number;
  wheat: number;
  ore: number;
}

export const DEFAULT_RESOURCE_WEIGHTS: ResourceWeights = {
  wood: 1.0,
  brick: 1.0,
  sheep: 0.85,
  wheat: 1.15,
  ore: 1.2,
};

export interface SettlementScore {
  vertexId: string;
  total: number;
  production: number;
  diversity: number;
  harbor: number;
  breakdown: { resource: ResourceType; value: number }[];
}

export interface PlacedSettlement {
  vertexId: string;
  player: number;
  isCity: boolean;
}

export type PlayerCount = 2 | 3 | 4;
