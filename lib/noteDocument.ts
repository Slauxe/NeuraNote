export type NotePage = {
  id?: string;
  strokes: unknown[];
  backgroundDataUrl?: string;
  backgroundPdfUri?: string;
  backgroundPdfPageNumber?: number;
};

export type NoteDoc = {
  strokes: unknown[];
  pages?: NotePage[];
  currentPageIndex?: number;
};

export function createEmptyNoteDoc(): NoteDoc {
  return {
    strokes: [],
    pages: [{ id: "page-1", strokes: [] }],
    currentPageIndex: 0,
  };
}
