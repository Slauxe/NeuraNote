import type { Router } from "expo-router";
import {
  AppState,
  Platform,
  type AppStateStatus,
} from "react-native";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { buildDocFromPages, normalizeDocToPages } from "@/lib/editorDocument";
import type { PageBackground, Stroke } from "@/lib/editorTypes";
import type {
  InfiniteBoard,
  InfiniteBoardBackgroundStyle,
  NoteDoc,
  NoteMetadata,
  NoteTextItem,
  NoteKind,
} from "@/lib/noteDocument";
import {
  clearNoteDraft,
  createNote,
  loadNote,
  loadNoteDraft,
  saveNote,
  saveNoteDraft,
} from "@/lib/notesStorage";
import { migratePageBackgroundsToAssets } from "@/lib/webBackgroundAssets";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type UseNotePersistenceArgs = {
  routeNoteId: string | null;
  router: Router;
  isPointerDownRef: RefObject<boolean>;
  pages: Stroke[][];
  pageTextItems: NoteTextItem[][];
  pageBackgrounds: PageBackground[];
  currentPageIndex: number;
  strokes: Stroke[];
  noteKind: NoteKind;
  boardSize: InfiniteBoard | null;
  boardBackgroundStyle: InfiniteBoardBackgroundStyle;
  metadata: NoteMetadata;
  emptyBackground: PageBackground;
  resetCanvasState: () => void;
  setNoteKind: (kind: NoteKind) => void;
  setBoardSize: (board: InfiniteBoard | null) => void;
  setBoardBackgroundStyle: (style: InfiniteBoardBackgroundStyle) => void;
  setMetadata: (metadata: NoteMetadata) => void;
  loadSnapshot: (snapshot: {
    pages: Stroke[][];
    pageTextItems: NoteTextItem[][];
    pageBackgrounds: PageBackground[];
    currentPageIndex: number;
    strokes: Stroke[];
  }) => void;
};

type Snapshot = {
  pages: Stroke[][];
  pageTextItems: NoteTextItem[][];
  pageBackgrounds: PageBackground[];
  currentPageIndex: number;
  noteKind: NoteKind;
  boardSize: InfiniteBoard | null;
  boardBackgroundStyle: InfiniteBoardBackgroundStyle;
  metadata: NoteMetadata;
};

const SAVE_DEBOUNCE_MS = 450;
const STATUS_RESET_MS = 1400;

function buildSnapshotDoc(snapshot: Snapshot): NoteDoc {
  return buildDocFromPages(
    snapshot.pages,
    snapshot.pageTextItems,
    snapshot.pageBackgrounds,
    snapshot.currentPageIndex,
    snapshot.noteKind,
    snapshot.boardSize
      ? {
          ...snapshot.boardSize,
          backgroundStyle: snapshot.boardBackgroundStyle,
        }
      : null,
    snapshot.metadata,
  );
}

export function useNotePersistence({
  routeNoteId,
  router,
  isPointerDownRef,
  pages,
  pageBackgrounds,
  pageTextItems,
  currentPageIndex,
  strokes,
  noteKind,
  boardSize,
  boardBackgroundStyle,
  metadata,
  emptyBackground,
  resetCanvasState,
  setNoteKind,
  setBoardSize,
  setBoardBackgroundStyle,
  setMetadata,
  loadSnapshot,
}: UseNotePersistenceArgs) {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recoveredFromDraft, setRecoveredFromDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const activeNoteIdRef = useRef<string | null>(null);
  const hydratingRef = useRef(false);
  const snapshotRef = useRef<Snapshot>({
    pages,
    pageTextItems,
    pageBackgrounds,
    currentPageIndex,
    noteKind,
    boardSize,
    boardBackgroundStyle,
    metadata,
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const pendingDraftTimestampRef = useRef<number | null>(null);
  const forceFlushIdRef = useRef(0);
  const skipNextAutosaveRef = useRef(false);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const clearStatusTimer = useCallback(() => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  const scheduleSavedStatusReset = useCallback(() => {
    clearStatusTimer();
    statusTimerRef.current = setTimeout(() => {
      if (!dirtyRef.current && !isSavingRef.current) {
        setSaveState("idle");
      }
    }, STATUS_RESET_MS);
  }, [clearStatusTimer]);

  const captureSnapshot = useCallback(() => snapshotRef.current, []);

  const persistCurrentSnapshot = useCallback(
    async (reason: "debounced" | "flush") => {
      const noteId = activeNoteIdRef.current;
      if (!noteId || hydratingRef.current) return;

      if (isSavingRef.current) {
        queuedSaveRef.current = true;
        return;
      }

      isSavingRef.current = true;
      clearStatusTimer();
      setSaveState("saving");
      setSaveError(null);

      try {
        const snapshot = captureSnapshot();
        const doc = buildSnapshotDoc(snapshot);
        let draftTimestamp: number | null = null;
        if (Platform.OS !== "web") {
          draftTimestamp = await saveNoteDraft(noteId, doc);
          pendingDraftTimestampRef.current = draftTimestamp;
        }
        await saveNote(noteId, { doc });
        if (
          draftTimestamp != null &&
          pendingDraftTimestampRef.current === draftTimestamp
        ) {
          await clearNoteDraft(noteId);
          pendingDraftTimestampRef.current = null;
        }
        dirtyRef.current = false;
        setLastSavedAt(Date.now());
        setSaveState("saved");
        scheduleSavedStatusReset();
      } catch (error: any) {
        dirtyRef.current = true;
        const message =
          typeof error?.message === "string" && error.message.trim()
            ? error.message.trim()
            : reason === "flush"
              ? "Could not finish saving before the app closed."
              : "Could not save your latest changes.";
        setSaveState("error");
        setSaveError(message);
      } finally {
        isSavingRef.current = false;
        if (queuedSaveRef.current && activeNoteIdRef.current === noteId) {
          queuedSaveRef.current = false;
          persistCurrentSnapshot("debounced").catch(() => {});
        }
      }
    },
    [captureSnapshot, clearStatusTimer, scheduleSavedStatusReset],
  );

  const flushPendingSave = useCallback(async () => {
    clearSaveTimer();
    if (!dirtyRef.current || hydratingRef.current || !activeNoteIdRef.current) {
      return;
    }
    const flushId = ++forceFlushIdRef.current;
    await persistCurrentSnapshot("flush");
    if (forceFlushIdRef.current !== flushId) return;
  }, [clearSaveTimer, persistCurrentSnapshot]);

  useEffect(() => {
    snapshotRef.current = {
      pages,
      pageTextItems,
      pageBackgrounds,
    currentPageIndex,
    noteKind,
    boardSize,
    boardBackgroundStyle,
    metadata,
  };
  }, [
    pages,
    pageTextItems,
    pageBackgrounds,
    currentPageIndex,
    noteKind,
    boardSize,
    boardBackgroundStyle,
    metadata,
  ]);

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  useEffect(() => {
    hydratingRef.current = hydrating;
  }, [hydrating]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await flushPendingSave().catch(() => {});

      if (!routeNoteId) {
        setActiveNoteId(null);
        activeNoteIdRef.current = null;
        try {
          const newId = await createNote("No name");
          if (cancelled) return;
          router.replace({
            pathname: "/(tabs)",
            params: { noteId: newId },
          });
        } catch {
          // Stay on the current screen if note creation fails.
        }
        return;
      }

      clearSaveTimer();
      clearStatusTimer();
      dirtyRef.current = false;
      queuedSaveRef.current = false;
      pendingDraftTimestampRef.current = null;
      setSaveState("idle");
      setSaveError(null);
      setRecoveredFromDraft(false);
      setLastSavedAt(null);
      setActiveNoteId(routeNoteId);
      setHydrating(true);
      resetCanvasState();

      try {
        const [storedNote, draft] = await Promise.all([
          loadNote(routeNoteId),
          Platform.OS === "web"
            ? Promise.resolve(null)
            : loadNoteDraft(routeNoteId),
        ]);
        if (cancelled) return;

        const shouldUseDraft =
          !!draft &&
          (!storedNote || draft.updatedAt >= storedNote.meta.updatedAt);
        const sourceDoc = shouldUseDraft ? draft.doc : storedNote?.doc;
        const normalized = normalizeDocToPages(sourceDoc);
        const migratedBackgrounds =
          Platform.OS === "web"
            ? await migratePageBackgroundsToAssets(normalized.pageBackgrounds)
            : { backgrounds: normalized.pageBackgrounds, changed: false };
        const pageStrokes = normalized.pages[normalized.currentPageIndex] ?? [];

        setNoteKind(normalized.kind);
        setBoardSize(normalized.board);
        setBoardBackgroundStyle(normalized.board?.backgroundStyle ?? "grid");
        setMetadata(normalized.metadata);
        loadSnapshot({
          pages: normalized.pages,
          pageTextItems: normalized.pageTextItems,
          pageBackgrounds: migratedBackgrounds.backgrounds,
          currentPageIndex: normalized.currentPageIndex,
          strokes: pageStrokes,
        });

        snapshotRef.current = {
          pages: normalized.pages,
          pageTextItems: normalized.pageTextItems,
          pageBackgrounds: migratedBackgrounds.backgrounds,
          currentPageIndex: normalized.currentPageIndex,
          noteKind: normalized.kind,
          boardSize: normalized.board,
          boardBackgroundStyle: normalized.board?.backgroundStyle ?? "grid",
          metadata: normalized.metadata,
        };

        if (shouldUseDraft) {
          setRecoveredFromDraft(true);
          dirtyRef.current = true;
          setSaveState("dirty");
        } else if (migratedBackgrounds.changed) {
          dirtyRef.current = true;
          setSaveState("dirty");
        } else if (storedNote?.meta.updatedAt) {
          skipNextAutosaveRef.current = true;
          setLastSavedAt(storedNote.meta.updatedAt);
        }
      } catch {
        if (!cancelled) {
          skipNextAutosaveRef.current = true;
          setNoteKind("page");
          setBoardSize(null);
          setBoardBackgroundStyle("grid");
          setMetadata({
            description: "",
            tags: [],
            bookmarkedPages: [],
            pageTemplate: "blank",
            pageSizePreset: "letter",
          });
          loadSnapshot({
            pages: [[]],
            pageTextItems: [[]],
            pageBackgrounds: [{ ...emptyBackground }],
            currentPageIndex: 0,
            strokes: [],
          });
        }
      } finally {
        if (!cancelled) {
          setHydrating(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    routeNoteId,
    router,
    emptyBackground,
    resetCanvasState,
    setNoteKind,
    setBoardSize,
    setBoardBackgroundStyle,
    setMetadata,
    loadSnapshot,
    clearSaveTimer,
    clearStatusTimer,
    flushPendingSave,
  ]);

  useEffect(() => {
    if (!activeNoteId || hydrating) return;
    if (isPointerDownRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    dirtyRef.current = true;
    setSaveState((prev) => (prev === "error" ? "error" : "dirty"));
    clearSaveTimer();

    saveTimerRef.current = setTimeout(() => {
      if (hydratingRef.current) return;
      persistCurrentSnapshot("debounced").catch(() => {});
    }, SAVE_DEBOUNCE_MS);

    return clearSaveTimer;
  }, [
    strokes,
    activeNoteId,
    hydrating,
    pages,
    pageTextItems,
    pageBackgrounds,
    currentPageIndex,
    noteKind,
    boardSize,
    boardBackgroundStyle,
    metadata,
    isPointerDownRef,
    clearSaveTimer,
    persistCurrentSnapshot,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState !== "active") {
          flushPendingSave().catch(() => {});
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const onBeforeUnload = () => {
      flushPendingSave().catch(() => {});
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flushPendingSave]);

  useEffect(
    () => () => {
      clearSaveTimer();
      clearStatusTimer();
      flushPendingSave().catch(() => {});
    },
    [clearSaveTimer, clearStatusTimer, flushPendingSave],
  );

  const retrySave = useCallback(() => {
    if (!activeNoteIdRef.current || hydratingRef.current) return;
    dirtyRef.current = true;
    clearSaveTimer();
    persistCurrentSnapshot("flush").catch(() => {});
  }, [clearSaveTimer, persistCurrentSnapshot]);

  const dismissRecoveredFromDraft = useCallback(() => {
    setRecoveredFromDraft(false);
  }, []);

  return {
    activeNoteId,
    hydrating,
    saveState,
    saveError,
    lastSavedAt,
    recoveredFromDraft,
    retrySave,
    dismissRecoveredFromDraft,
  };
}
