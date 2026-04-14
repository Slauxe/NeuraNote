export type Point = { x: number; y: number };

export type PageBackground = {
  dataUrl: string | null;
  assetId: string | null;
  pdfUri: string | null;
  pdfPageNumber: number | null;
};

export type Stroke = {
  id: string;
  points: Point[];
  segmentBBoxes: { minX: number; minY: number; maxX: number; maxY: number }[];
  d: string;
  w: number;
  c: string;
  a?: number;
  dashed?: boolean;
  shapePreset?: "axis-2d" | "axis-3d";
  groupId?: string;
  axisRole?: "x" | "y" | "z";
  axisOrigin?: Point;
  axisHandle?: Point;
  dx: number;
  dy: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

export const PAGE_W = 850;
export const PAGE_H = 1100;
export const INFINITE_CANVAS_W = 2400;
export const INFINITE_CANVAS_H = 1800;

export const EMPTY_PAGE_BACKGROUND: PageBackground = {
  dataUrl: null,
  assetId: null,
  pdfUri: null,
  pdfPageNumber: null,
};
