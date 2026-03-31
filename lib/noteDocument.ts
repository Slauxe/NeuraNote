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
  backgroundPdfUri?: string;
  backgroundPdfPageNumber?: number;
};

export type NoteDoc = {
  kind?: NoteKind;
  board?: InfiniteBoard;
  strokes: unknown[];
  pages?: NotePage[];
  currentPageIndex?: number;
};

export function createEmptyNoteDoc(kind: NoteKind = "page"): NoteDoc {
  return {
    kind,
    strokes: [],
    pages: [{ id: "page-1", strokes: [] }],
    currentPageIndex: 0,
  };
}
