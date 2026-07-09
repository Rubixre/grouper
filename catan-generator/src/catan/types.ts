export type ResourceType = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore' | 'desert';

export type HarborType =
  | { kind: 'generic' }
  | { kind: 'resource'; resource: Exclude<ResourceType, 'desert'> };

export interface HexCoord {
  q: number;
  r: number;
}

export interface HexTile {
  coord: HexCoord;
  resource: ResourceType;
  number: number | null; // null for desert
}

export interface CoastSlot {
  index: number;
  hex: HexCoord;
  /** Outward-facing edge direction (0-5) */
  edge: number;
}

export interface HarborPiece {
  id: string;
  name: string;
  harbor: HarborType;
  /** Visual slot span (3 consecutive coast slots) */
  slotSpan: 3;
}

export interface PlacedHarborPiece {
  piece: HarborPiece;
  /** Starting coast slot index (piece occupies start, start+1, start+2 mod 18) */
  startSlot: number;
}

export interface GeneratorSettings {
  allowAdjacent6And8: boolean;
  allowAdjacent2And12: boolean;
  allowAdjacentSameResource: boolean;
  allowAdjacentSameNumber: boolean;
}

export const DEFAULT_SETTINGS: GeneratorSettings = {
  allowAdjacent6And8: false,
  allowAdjacent2And12: false,
  allowAdjacentSameResource: false,
  allowAdjacentSameNumber: false,
};

export interface Board {
  hexes: HexTile[];
  harbors: PlacedHarborPiece[];
  coastSlots: CoastSlot[];
  rotation: number;
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
