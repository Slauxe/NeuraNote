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
  d: string;
  w: number;
  c: string;
  dx: number;
  dy: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

export const PAGE_W = 850;
export const PAGE_H = 1100;
export const INFINITE_CANVAS_W = 6000;
export const INFINITE_CANVAS_H = 4000;

export const EMPTY_PAGE_BACKGROUND: PageBackground = {
  dataUrl: null,
  assetId: null,
  pdfUri: null,
  pdfPageNumber: null,
};
