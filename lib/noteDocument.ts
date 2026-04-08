export type NoteKind = "page" | "infinite";
export type InfiniteBoardBackgroundStyle = "grid" | "dots" | "blank";
export type PageTemplate =
  | "blank"
  | "ruled"
  | "grid"
  | "dots"
  | "graph-fine"
  | "graph-coarse"
  | "polar"
  | "isometric";
export type PageSizePreset = "letter" | "a4" | "square";
export type ShapePreset =
  | "line"
  | "vector"
  | "rectangle"
  | "triangle"
  | "ellipse"
  | "angle"
  | "dimension"
  | "axis"
  | "axis-2d"
  | "axis-3d"
  | "table";
export type InfiniteBoard = {
  width: number;
  height: number;
  backgroundStyle?: InfiniteBoardBackgroundStyle;
};

export type NoteMetadata = {
  description?: string;
  tags?: string[];
  bookmarkedPages?: number[];
  pageTemplate?: PageTemplate;
  pageSizePreset?: PageSizePreset;
};

export type NotePage = {
  id?: string;
  strokes: unknown[];
  textItems?: NoteTextItem[];
  backgroundDataUrl?: string;
  backgroundAssetId?: string;
  backgroundPdfUri?: string;
  backgroundPdfPageNumber?: number;
};

export type NoteTextItem = {
  id: string;
  text: string;
  x: number;
  y: number;
  color?: string;
  fontSize?: number;
};

export type NoteDoc = {
  version?: 1;
  kind?: NoteKind;
  board?: InfiniteBoard;
  metadata?: NoteMetadata;
  strokes: unknown[];
  pages?: NotePage[];
  currentPageIndex?: number;
};

export function createEmptyNoteDoc(kind: NoteKind = "page"): NoteDoc {
  return {
    version: 1,
    kind,
    metadata: {
      description: "",
      tags: [],
      bookmarkedPages: [],
      pageTemplate: "blank",
      pageSizePreset: "letter",
    },
    strokes: [],
    pages: [{ id: "page-1", strokes: [] }],
    currentPageIndex: 0,
  };
}
