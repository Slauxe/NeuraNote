// lib/notesStorage.ts
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

export type NoteMeta = {
  id: string;
  title: string;
  updatedAt: number; // epoch ms
};

export type NoteDoc = {
  strokes: any[]; // keep as any[] for now to avoid circular imports from index.tsx
  // Add more later if you want: zoom, page settings, etc.
  // zoom?: number;
};

type NoteFile = {
  id: string;
  title: string;
  updatedAt: number;
  doc: NoteDoc;
};

type NotesIndexFile = {
  version: 1;
  notes: NoteMeta[];
};

const NOTES_DIR_NAME = "notes";
const INDEX_FILE_NAME = "index.json";

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

  await FileSystem.writeAsStringAsync(path, json, {
    encoding: "utf8" as any,
  });
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

    const id = f.replace(/\.json$/, "");
    const nf = await readJson<NoteFile>(notePath(id));
    if (!nf) continue;

    notes.push({ id: nf.id, title: nf.title, updatedAt: nf.updatedAt });
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

/** List note metadata (for Explore UI). Sorted by updatedAt desc. */
export async function listNotes(): Promise<NoteMeta[]> {
  const idx = await loadIndex();
  return [...idx.notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Create a new note file + add it to index.json. Returns the new noteId. */
export async function createNote(title = "No name"): Promise<string> {
  const id = newId();
  const t = now();

  const file: NoteFile = {
    id,
    title,
    updatedAt: t,
    doc: { strokes: [] },
  };

  await ensureNotesDir();
  await writeJsonAtomic(notePath(id), file);

  const idx = await loadIndex();
  const next: NotesIndexFile = {
    version: 1,
    notes: [{ id, title, updatedAt: t }, ...idx.notes],
  };
  await saveIndex(next);

  return id;
}

/** Load a note file by id. Returns null if missing/corrupt. */
export async function loadNote(
  id: string,
): Promise<{ meta: NoteMeta; doc: NoteDoc } | null> {
  await ensureNotesDir();
  const nf = await readJson<NoteFile>(notePath(id));
  if (!nf) return null;

  return {
    meta: { id: nf.id, title: nf.title, updatedAt: nf.updatedAt },
    doc: nf.doc ?? { strokes: [] },
  };
}

/**
 * Save note doc (and optionally title).
 * Updates updatedAt in both the note file and index.json.
 */
export async function saveNote(
  id: string,
  updates: { title?: string; doc?: NoteDoc },
): Promise<void> {
  await ensureNotesDir();
  const path = notePath(id);
  const existing = await readJson<NoteFile>(path);

  // If note file is missing, create it
  const t = now();
  const title = updates.title ?? existing?.title ?? "No name";
  const doc = updates.doc ?? existing?.doc ?? { strokes: [] };

  const nextFile: NoteFile = {
    id,
    title,
    updatedAt: t,
    doc,
  };

  await writeJsonAtomic(path, nextFile);

  // Update index entry
  const idx = await loadIndex();
  const without = idx.notes.filter((n) => n.id !== id);
  const nextIdx: NotesIndexFile = {
    version: 1,
    notes: [{ id, title, updatedAt: t }, ...without],
  };
  await saveIndex(nextIdx);
}

/** Delete note file + remove from index.json. */
export async function deleteNote(id: string): Promise<void> {
  // Remove file
  if (Platform.OS === "web") {
    localStorage.removeItem(notePath(id));
  } else {
    await FileSystem.deleteAsync(notePath(id), { idempotent: true });
  }

  // Remove file
  await FileSystem.deleteAsync(notePath(id), { idempotent: true });

  // Update index
  const idx = await loadIndex();
  const next: NotesIndexFile = {
    version: 1,
    notes: idx.notes.filter((n) => n.id !== id),
  };
  await saveIndex(next);
}

/** Helpful for debugging / export later */
export function getNotesDirectoryUri(): string {
  return notesDir();
}
