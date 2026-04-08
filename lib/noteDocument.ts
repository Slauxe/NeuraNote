export type NoteKind = "page" | "infinite";
export type InfiniteBoardBackgroundStyle = "grid" | "dots" | "blank";
export type InfiniteBoard = {
  width: number;
  height: number;
  backgroundStyle?: InfiniteBoardBackgroundStyle;
};

export type NotePage = {
  id?: string;
  strokes: unknown[];
  backgroundDataUrl?: string;
  backgroundAssetId?: string;
  backgroundPdfUri?: string;
  backgroundPdfPageNumber?: number;
};

export type NoteDoc = {
  version?: 1;
  kind?: NoteKind;
  board?: InfiniteBoard;
  strokes: unknown[];
  pages?: NotePage[];
  currentPageIndex?: number;
};

export function createEmptyNoteDoc(kind: NoteKind = "page"): NoteDoc {
  return {
    version: 1,
    kind,
    strokes: [],
    pages: [{ id: "page-1", strokes: [] }],
    currentPageIndex: 0,
  };
}
