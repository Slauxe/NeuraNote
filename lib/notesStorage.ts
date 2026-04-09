// lib/notesStorage.ts
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { createEmptyNoteDoc, type NoteDoc } from "./noteDocument";
import { deleteBackgroundAsset } from "./webBackgroundAssets";

export type { NoteDoc } from "./noteDocument";

export type NoteMeta = {
  type: "note";
  id: string;
  title: string;
  updatedAt: number; // epoch ms
  coverColor?: string; // hex like "#8B5CF6"
  parentId?: string | null;
};

export type FolderMeta = {
  type: "folder";
  id: string;
  title: string;
  updatedAt: number; // epoch ms
  parentId?: string | null;
};

export type LibraryItemMeta = NoteMeta | FolderMeta;

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

type LibraryIndexFile = {
  version: 2;
  items: LibraryItemMeta[];
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
  const raw = await readJson<NotesIndexFile | LibraryIndexFile>(indexPath());
  if (raw && raw.version === 2 && Array.isArray((raw as LibraryIndexFile).items)) {
    return {
      version: 1,
      notes: (raw as LibraryIndexFile).items
        .filter((item): item is NoteMeta => item?.type === "note")
        .map((item) => ({ ...item })),
    };
  }
  if (raw && raw.version === 1 && Array.isArray((raw as NotesIndexFile).notes)) {
    return raw as NotesIndexFile;
  }

  // If index is missing/corrupt, rebuild minimal index by scanning folder
  const rebuilt = await rebuildIndexFromFiles();
  await writeJsonAtomic(indexPath(), rebuilt);
  return {
    version: 1,
    notes: rebuilt.items.filter((item): item is NoteMeta => item.type === "note"),
  };
}

async function loadLibraryIndex(): Promise<LibraryIndexFile> {
  await ensureNotesDir();
  const raw = await readJson<NotesIndexFile | LibraryIndexFile>(indexPath());
  if (raw && raw.version === 2 && Array.isArray((raw as LibraryIndexFile).items)) {
    return sanitizeLibraryIndex(raw as LibraryIndexFile);
  }
  if (raw && raw.version === 1 && Array.isArray((raw as NotesIndexFile).notes)) {
    const migrated = migrateLegacyIndex(raw as NotesIndexFile);
    await writeJsonAtomic(indexPath(), migrated);
    return migrated;
  }

  const rebuilt = await rebuildIndexFromFiles();
  await writeJsonAtomic(indexPath(), rebuilt);
  return rebuilt;
}

async function saveLibraryIndex(idx: LibraryIndexFile): Promise<void> {
  await ensureNotesDir();
  await writeJsonAtomic(indexPath(), sanitizeLibraryIndex(idx));
}

function normalizeParentId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function sanitizeLibraryIndex(idx: LibraryIndexFile): LibraryIndexFile {
  return {
    version: 2,
    items: idx.items
      .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
      .map((item) => {
        if (item.type === "folder") {
          return {
            type: "folder",
            id: item.id,
            title: item.title,
            updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : now(),
            parentId: normalizeParentId(item.parentId),
          } satisfies FolderMeta;
        }
        return {
          type: "note",
          id: item.id,
          title: item.title,
          updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : now(),
          coverColor: item.coverColor,
          parentId: normalizeParentId(item.parentId),
        } satisfies NoteMeta;
      }),
  };
}

function migrateLegacyIndex(idx: NotesIndexFile): LibraryIndexFile {
  return {
    version: 2,
    items: idx.notes.map((note) => ({
      type: "note" as const,
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
      coverColor: note.coverColor,
      parentId: null,
    })),
  };
}

async function rebuildIndexFromFiles(): Promise<LibraryIndexFile> {
  if (Platform.OS === "web") {
    return { version: 2, items: [] };
  }

  await ensureNotesDir();
  const dir = notesDir();
  const files = await FileSystem.readDirectoryAsync(dir);

  const items: LibraryItemMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    if (f === INDEX_FILE_NAME) continue;
    if (f.endsWith(DRAFT_SUFFIX)) continue;

    const id = f.replace(/\.json$/, "");
    const nf = await readJson<NoteFile>(notePath(id));
    if (!nf) continue;

    items.push({
      type: "note",
      id: nf.id,
      title: nf.title,
      updatedAt: nf.updatedAt,
      coverColor: nf.coverColor,
      parentId: null,
    });
  }

  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return { version: 2, items };
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
  const idx = await loadLibraryIndex();
  return idx.items
    .filter((item): item is NoteMeta => item.type === "note")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** List all library items, including folders. */
export async function listLibraryItems(): Promise<LibraryItemMeta[]> {
  const idx = await loadLibraryIndex();
  return [...idx.items].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createFolder(
  title = "New folder",
  parentId: string | null = null,
): Promise<string> {
  const idx = await loadLibraryIndex();
  if (parentId && !idx.items.some((item) => item.type === "folder" && item.id === parentId)) {
    throw new Error("Parent folder not found.");
  }

  const id = newId();
  const t = now();
  idx.items.unshift({
    type: "folder",
    id,
    title,
    updatedAt: t,
    parentId: normalizeParentId(parentId),
  });
  await saveLibraryIndex(idx);
  return id;
}

export async function renameFolder(id: string, title: string): Promise<void> {
  const idx = await loadLibraryIndex();
  const folder = idx.items.find(
    (item): item is FolderMeta => item.type === "folder" && item.id === id,
  );
  if (!folder) throw new Error("Folder not found.");
  folder.title = title;
  folder.updatedAt = now();
  await saveLibraryIndex(idx);
}

/** Create a new note file + add it to index.json. Returns the new noteId. */
export async function createNote(
  title = "No name",
  coverColor = "#8B5CF6",
  initialDoc?: NoteDoc,
  parentId: string | null = null,
): Promise<string> {
  const idx = await loadLibraryIndex();
  if (parentId && !idx.items.some((item) => item.type === "folder" && item.id === parentId)) {
    throw new Error("Parent folder not found.");
  }

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

  idx.items.unshift({
    type: "note",
    id,
    title,
    updatedAt: t,
    coverColor,
    parentId: normalizeParentId(parentId),
  });
  await saveLibraryIndex(idx);

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
    existing.meta.parentId ?? null,
  );
}

/** Load a note file by id. Returns null if missing/corrupt. */
export async function loadNote(
  id: string,
): Promise<{ meta: NoteMeta; doc: NoteDoc } | null> {
  await ensureNotesDir();
  const idx = await loadLibraryIndex();
  const metaEntry = idx.items.find(
    (item): item is NoteMeta => item.type === "note" && item.id === id,
  );
  const nf = await readJson<NoteFile>(notePath(id));
  if (!nf) return null;

  return {
    meta: {
      type: "note",
      id: nf.id,
      title: nf.title,
      updatedAt: nf.updatedAt,
      coverColor: nf.coverColor,
      parentId: metaEntry?.parentId ?? null,
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
  const idx = await loadLibraryIndex();
  const existingMeta = idx.items.find(
    (item): item is NoteMeta => item.type === "note" && item.id === id,
  );
  const without = idx.items.filter((item) => item.id !== id);
  without.unshift({
    type: "note",
    id,
    title,
    updatedAt: t,
    coverColor,
    parentId: existingMeta?.parentId ?? null,
  });
  await saveLibraryIndex({ version: 2, items: without });
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
  const idx = await loadLibraryIndex();
  const next: LibraryIndexFile = {
    version: 2,
    items: idx.items.filter((item) => item.id !== id),
  };
  await saveLibraryIndex(next);

  if (Platform.OS === "web") {
    const assetIds = [
      ...collectBackgroundAssetIds(existing?.doc),
      ...collectBackgroundAssetIds(existingDraft?.doc),
    ];
    await Promise.all(assetIds.map((assetId) => deleteBackgroundAsset(assetId)));
  }
}

async function deleteNoteFileOnly(id: string): Promise<void> {
  const existing = await loadNote(id).catch(() => null);
  const existingDraft = await loadNoteDraft(id).catch(() => null);

  if (Platform.OS === "web") {
    localStorage.removeItem(notePath(id));
    localStorage.removeItem(draftPath(id));
  } else {
    await FileSystem.deleteAsync(notePath(id), { idempotent: true });
    await FileSystem.deleteAsync(draftPath(id), { idempotent: true });
  }

  if (Platform.OS === "web") {
    const assetIds = [
      ...collectBackgroundAssetIds(existing?.doc),
      ...collectBackgroundAssetIds(existingDraft?.doc),
    ];
    await Promise.all(assetIds.map((assetId) => deleteBackgroundAsset(assetId)));
  }
}

function collectDescendantFolderIds(items: LibraryItemMeta[], folderId: string): string[] {
  const descendants: string[] = [];
  const queue = [folderId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const item of items) {
      if (item.type === "folder" && item.parentId === current) {
        descendants.push(item.id);
        queue.push(item.id);
      }
    }
  }
  return descendants;
}

export async function moveLibraryItem(
  id: string,
  parentId: string | null,
): Promise<void> {
  const idx = await loadLibraryIndex();
  const item = idx.items.find((entry) => entry.id === id);
  if (!item) throw new Error("Library item not found.");

  const normalizedParentId = normalizeParentId(parentId);
  if (
    normalizedParentId &&
    !idx.items.some((entry) => entry.type === "folder" && entry.id === normalizedParentId)
  ) {
    throw new Error("Destination folder not found.");
  }

  if (item.type === "folder") {
    if (normalizedParentId === item.id) {
      throw new Error("A folder cannot be moved into itself.");
    }
    const descendantIds = collectDescendantFolderIds(idx.items, item.id);
    if (normalizedParentId && descendantIds.includes(normalizedParentId)) {
      throw new Error("A folder cannot be moved into one of its descendants.");
    }
  }

  item.parentId = normalizedParentId;
  item.updatedAt = now();
  await saveLibraryIndex(idx);
}

export async function deleteFolder(id: string): Promise<void> {
  const idx = await loadLibraryIndex();
  const folder = idx.items.find(
    (item): item is FolderMeta => item.type === "folder" && item.id === id,
  );
  if (!folder) throw new Error("Folder not found.");

  const descendantFolderIds = collectDescendantFolderIds(idx.items, id);
  const folderIdsToDelete = new Set([id, ...descendantFolderIds]);
  const noteIdsToDelete = idx.items
    .filter(
      (item): item is NoteMeta =>
        item.type === "note" && folderIdsToDelete.has(item.parentId ?? ""),
    )
    .map((item) => item.id);

  await Promise.all(noteIdsToDelete.map((noteId) => deleteNoteFileOnly(noteId)));

  await saveLibraryIndex({
    version: 2,
    items: idx.items.filter(
      (item) =>
        !folderIdsToDelete.has(item.id) && !noteIdsToDelete.includes(item.id),
    ),
  });
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
