import type { BoardSize } from './boardLayout';
import type { ExtensionEdgeOrder } from './extensionLayout';

export type { BoardSize };
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
  /** When true, 6 and 8 may be placed on adjacent hexes */
  allowAdjacent6And8: boolean;
  /** When true, 2 and 12 may be placed on adjacent hexes */
  allowAdjacent2And12: boolean;
  /** When true, identical resources may be placed on adjacent hexes */
  allowAdjacentSameResource: boolean;
  /** When true, identical numbers may be placed on adjacent hexes */
  allowAdjacentSameNumber: boolean;
  /** When true, edge pieces are randomly rotated; when false, original B1–B6 order */
  randomHarbors: boolean;
}

export const DEFAULT_SETTINGS: GeneratorSettings = {
  allowAdjacent6And8: true,
  allowAdjacent2And12: true,
  allowAdjacentSameResource: true,
  allowAdjacentSameNumber: true,
  randomHarbors: true,
};

export interface Board {
  boardSize: BoardSize;
  hexes: HexTile[];
  harbors: PlacedHarbor[];
  coastSlots: CoastSlot[];
  /** Edge piece rotation 0–5 (grunnspill) */
  edgeRotation: number;
  /** Permutasjon av kantbrikker i 5–6 utvidelse */
  extensionEdgeOrder?: ExtensionEdgeOrder;
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

/** Default: gjennomsnitt av fire seiersprofiler (Board Game Analysis) */
export const DEFAULT_RESOURCE_WEIGHTS: ResourceWeights = {
  wheat: 1.295,
  ore: 1.2375,
  wood: 0.78,
  brick: 0.78,
  sheep: 0.7625,
};

export interface SettlementScore {
  vertexId: string;
  total: number;
  production: number;
  diversity: number;
  harbor: number;
  /** Utfylling mellom 1. og 2. landsby (kun andre plassering) */
  portfolio?: number;
  /** Overlapp-straff mellom landsbyene (kun andre plassering) */
  overlap?: number;
  placementKind?: 'first' | 'second';
  breakdown: { resource: ResourceType; value: number }[];
}

export interface PlacedSettlement {
  vertexId: string;
  player: number;
  isCity: boolean;
}

export type PlayerCount = 2 | 3 | 4 | 5 | 6;
