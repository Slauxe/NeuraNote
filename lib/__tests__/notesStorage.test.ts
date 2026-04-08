jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

jest.mock("expo-file-system/legacy", () => ({}));

import {
  clearNoteDraft,
  createNote,
  deleteNote,
  duplicateNote,
  listNotes,
  loadNote,
  loadNoteDraft,
  saveNote,
  saveNoteDraft,
} from "../notesStorage";

function createLocalStorageMock() {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => (key in store ? store[key] : null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
}

describe("notesStorage web persistence", () => {
  beforeEach(() => {
    Object.defineProperty(global, "localStorage", {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  it("creates, loads, updates, lists, and deletes notes in localStorage", async () => {
    const noteId = await createNote("First note", "#00AAFF", {
      version: 1,
      kind: "page",
      strokes: [],
      pages: [{ id: "page-1", strokes: [] }],
      currentPageIndex: 0,
    });

    let notes = await listNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: noteId,
      title: "First note",
      coverColor: "#00AAFF",
    });

    let loaded = await loadNote(noteId);
    expect(loaded).not.toBeNull();
    expect(loaded?.doc).toMatchObject({
      version: 1,
      kind: "page",
      currentPageIndex: 0,
    });

    await saveNote(noteId, {
      title: "Updated title",
      doc: {
        version: 1,
        kind: "infinite",
        board: {
          width: 2400,
          height: 1800,
          backgroundStyle: "grid",
        },
        strokes: [],
        pages: [{ id: "board-1", strokes: [] }],
        currentPageIndex: 0,
      },
    });

    loaded = await loadNote(noteId);
    expect(loaded?.meta.title).toBe("Updated title");
    expect(loaded?.doc.kind).toBe("infinite");

    await deleteNote(noteId);

    notes = await listNotes();
    expect(notes).toEqual([]);
    expect(await loadNote(noteId)).toBeNull();
  });

  it("stores and clears recovery drafts independently from the main note file", async () => {
    const noteId = await createNote("Draft target");

    await saveNoteDraft(noteId, {
      version: 1,
      kind: "page",
      strokes: [],
      pages: [{ id: "page-1", strokes: [{ id: "draft-stroke" }] }],
      currentPageIndex: 0,
    });

    const draft = await loadNoteDraft(noteId);
    expect(draft).not.toBeNull();
    expect(draft?.doc.pages?.[0]?.strokes).toEqual([{ id: "draft-stroke" }]);

    const note = await loadNote(noteId);
    expect(note?.doc.pages?.[0]?.strokes).toEqual([]);

    await clearNoteDraft(noteId);
    expect(await loadNoteDraft(noteId)).toBeNull();
  });

  it("duplicates notes with a copied document and cover color", async () => {
    const noteId = await createNote("Original", "#1188FF", {
      version: 1,
      kind: "page",
      strokes: [],
      pages: [{ id: "page-1", strokes: [{ id: "stroke-1" }] }],
      currentPageIndex: 0,
    });

    const duplicateId = await duplicateNote(noteId);
    expect(duplicateId).not.toBe(noteId);

    const notes = await listNotes();
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({
      id: duplicateId,
      title: "Original copy",
      coverColor: "#1188FF",
    });

    const duplicated = await loadNote(duplicateId);
    expect(duplicated?.doc.pages?.[0]?.strokes).toEqual([{ id: "stroke-1" }]);
  });
});
