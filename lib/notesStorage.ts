// lib/notesStorage.ts
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { createEmptyNoteDoc, type NoteDoc } from "./noteDocument";
import { deleteBackgroundAsset } from "./webBackgroundAssets";

export type { NoteDoc } from "./noteDocument";

export type NoteMeta = {
  id: string;
  title: string;
  updatedAt: number; // epoch ms
  coverColor?: string; // hex like "#8B5CF6"
};

type NoteFile = {
  id: string;
  title: string;
  updatedAt: number;
  coverColor?: string;
  doc: NoteDoc;
};

type NotesIndexFile = {
  version: 1;
  notes: NoteMeta[];
};

type NoteDraftFile = {
  version: 1;
  noteId: string;
  updatedAt: number;
  doc: NoteDoc;
};

const NOTES_DIR_NAME = "notes";
const INDEX_FILE_NAME = "index.json";
const DRAFT_SUFFIX = ".draft.json";

function ensureDocumentDir() {
  // Web doesn’t have FileSystem.documentDirectory
  if (Platform.OS === "web") return "web://local";

  const dir =
    (FileSystem as any).documentDirectory ??
    (FileSystem as any).default?.documentDirectory;

  if (!dir) {
    throw new Error("FileSystem.documentDirectory is not available");
  }
  return dir as string;
}

function notesDir(): string {
  // Always ends with "/"
  return `${ensureDocumentDir()}${NOTES_DIR_NAME}/`;
}

function indexPath(): string {
  return `${notesDir()}${INDEX_FILE_NAME}`;
}

function notePath(id: string): string {
  return `${notesDir()}${id}.json`;
}

function draftPath(id: string): string {
  return `${notesDir()}${id}${DRAFT_SUFFIX}`;
}

async function exists(path: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return localStorage.getItem(path) != null;
  }
  const info = await FileSystem.getInfoAsync(path);
  return !!info.exists;
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data);

  if (Platform.OS === "web") {
    // localStorage key = the path string
    localStorage.setItem(path, json);
    return;
  }

  const tempPath = `${path}.tmp`;
  await FileSystem.writeAsStringAsync(tempPath, json, {
    encoding: "utf8" as any,
  });
  await FileSystem.deleteAsync(path, { idempotent: true });
  await FileSystem.moveAsync({ from: tempPath, to: path });
}

async function readJson<T>(path: string): Promise<T | null> {
  if (Platform.OS === "web") {
    const raw = localStorage.getItem(path);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;

  const raw = await FileSystem.readAsStringAsync(path, {
    encoding: "utf8" as any,
  });

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Create notes directory and index.json if missing. Safe to call anytime. */
export async function ensureNotesDir(): Promise<void> {
  if (Platform.OS !== "web") {
    const dir = notesDir();
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }

  const idx = indexPath();
  if (!(await exists(idx))) {
    const empty: NotesIndexFile = { version: 1, notes: [] };
    await writeJsonAtomic(idx, empty);
  }
}

async function loadIndex(): Promise<NotesIndexFile> {
  await ensureNotesDir();
  const idx = await readJson<NotesIndexFile>(indexPath());
  if (idx && idx.version === 1 && Array.isArray(idx.notes)) return idx;

  // If index is missing/corrupt, rebuild minimal index by scanning folder
  const rebuilt = await rebuildIndexFromFiles();
  await writeJsonAtomic(indexPath(), rebuilt);
  return rebuilt;
}

async function saveIndex(idx: NotesIndexFile): Promise<void> {
  await ensureNotesDir();
  await writeJsonAtomic(indexPath(), idx);
}

async function rebuildIndexFromFiles(): Promise<NotesIndexFile> {
  if (Platform.OS === "web") {
    return { version: 1, notes: [] };
  }

  await ensureNotesDir();
  const dir = notesDir();
  const files = await FileSystem.readDirectoryAsync(dir);

  const notes: NoteMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    if (f === INDEX_FILE_NAME) continue;
    if (f.endsWith(DRAFT_SUFFIX)) continue;

    const id = f.replace(/\.json$/, "");
    const nf = await readJson<NoteFile>(notePath(id));
    if (!nf) continue;

    notes.push({
      id: nf.id,
      title: nf.title,
      updatedAt: nf.updatedAt,
      coverColor: nf.coverColor,
    });
  }

  notes.sort((a, b) => b.updatedAt - a.updatedAt);
  return { version: 1, notes };
}

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function now(): number {
  return Date.now();
}

function collectBackgroundAssetIds(doc: NoteDoc | null | undefined) {
  if (!doc?.pages?.length) return [] as string[];
  const ids = doc.pages
    .map((page) =>
      typeof page?.backgroundAssetId === "string" ? page.backgroundAssetId : null,
    )
    .filter((value): value is string => !!value);
  return [...new Set(ids)];
}

/** List note metadata (for Explore UI). Sorted by updatedAt desc. */
export async function listNotes(): Promise<NoteMeta[]> {
  const idx = await loadIndex();
  return [...idx.notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Create a new note file + add it to index.json. Returns the new noteId. */
export async function createNote(
  title = "No name",
  coverColor = "#8B5CF6",
  initialDoc?: NoteDoc,
): Promise<string> {
  const id = newId();
  const t = now();

  const file: NoteFile = {
    id,
    title,
    updatedAt: t,
    coverColor,
    doc:
      initialDoc ?? createEmptyNoteDoc(),
  };

  await ensureNotesDir();
  await writeJsonAtomic(notePath(id), file);

  const idx = await loadIndex();
  const next: NotesIndexFile = {
    version: 1,
    notes: [{ id, title, updatedAt: t, coverColor }, ...idx.notes],
  };
  await saveIndex(next);

  return id;
}

export async function duplicateNote(id: string): Promise<string> {
  const existing = await loadNote(id);
  if (!existing) {
    throw new Error("Note not found.");
  }

  const duplicateTitle = `${existing.meta.title || "No name"} copy`;
  const duplicatedDoc = JSON.parse(JSON.stringify(existing.doc)) as NoteDoc;

  return createNote(
    duplicateTitle,
    existing.meta.coverColor ?? "#8B5CF6",
    duplicatedDoc,
  );
}

/** Load a note file by id. Returns null if missing/corrupt. */
export async function loadNote(
  id: string,
): Promise<{ meta: NoteMeta; doc: NoteDoc } | null> {
  await ensureNotesDir();
  const nf = await readJson<NoteFile>(notePath(id));
  if (!nf) return null;

  return {
    meta: {
      id: nf.id,
      title: nf.title,
      updatedAt: nf.updatedAt,
      coverColor: nf.coverColor,
    },
    doc:
      nf.doc ?? createEmptyNoteDoc(),
  };
}

/**
 * Save note doc (and optionally title).
 * Updates updatedAt in both the note file and index.json.
 */
export async function saveNote(
  id: string,
  updates: { title?: string; coverColor?: string; doc?: NoteDoc },
): Promise<void> {
  await ensureNotesDir();
  const path = notePath(id);
  const existing = await readJson<NoteFile>(path);

  // If note file is missing, create it
  const t = now();
  const title = updates.title ?? existing?.title ?? "No name";
  const coverColor = updates.coverColor ?? existing?.coverColor ?? "#8B5CF6";
  const doc =
    updates.doc ??
    existing?.doc ??
    createEmptyNoteDoc();

  const nextFile: NoteFile = {
    id,
    title,
    updatedAt: t,
    coverColor,
    doc,
  };

  await writeJsonAtomic(path, nextFile);

  // Update index entry
  const idx = await loadIndex();
  const without = idx.notes.filter((n) => n.id !== id);
  const nextIdx: NotesIndexFile = {
    version: 1,
    notes: [{ id, title, updatedAt: t, coverColor }, ...without],
  };
  await saveIndex(nextIdx);
}

/** Delete note file + remove from index.json. */
export async function deleteNote(id: string): Promise<void> {
  const existing = await loadNote(id).catch(() => null);
  const existingDraft = await loadNoteDraft(id).catch(() => null);

  // Remove file
  if (Platform.OS === "web") {
    localStorage.removeItem(notePath(id));
    localStorage.removeItem(draftPath(id));
  } else {
    await FileSystem.deleteAsync(notePath(id), { idempotent: true });
    await FileSystem.deleteAsync(draftPath(id), { idempotent: true });
  }

  // Update index
  const idx = await loadIndex();
  const next: NotesIndexFile = {
    version: 1,
    notes: idx.notes.filter((n) => n.id !== id),
  };
  await saveIndex(next);

  if (Platform.OS === "web") {
    const assetIds = [
      ...collectBackgroundAssetIds(existing?.doc),
      ...collectBackgroundAssetIds(existingDraft?.doc),
    ];
    await Promise.all(assetIds.map((assetId) => deleteBackgroundAsset(assetId)));
  }
}

/** Helpful for debugging / export later */
export function getNotesDirectoryUri(): string {
  return notesDir();
}

export async function saveNoteDraft(id: string, doc: NoteDoc): Promise<number> {
  const updatedAt = now();
  const draft: NoteDraftFile = {
    version: 1,
    noteId: id,
    updatedAt,
    doc,
  };
  await ensureNotesDir();
  await writeJsonAtomic(draftPath(id), draft);
  return updatedAt;
}

export async function loadNoteDraft(
  id: string,
): Promise<{ updatedAt: number; doc: NoteDoc } | null> {
  await ensureNotesDir();
  const draft = await readJson<NoteDraftFile>(draftPath(id));
  if (!draft || draft.noteId !== id) return null;
  if (!Number.isFinite(draft.updatedAt)) return null;

  return {
    updatedAt: draft.updatedAt,
    doc: draft.doc ?? createEmptyNoteDoc(),
  };
}

export async function clearNoteDraft(id: string): Promise<void> {
  const path = draftPath(id);
  if (Platform.OS === "web") {
    localStorage.removeItem(path);
    return;
  }
  await FileSystem.deleteAsync(path, { idempotent: true });
}
