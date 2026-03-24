import type { Router } from "expo-router";
import { useEffect, useRef, useState, type RefObject } from "react";

import { buildDocFromPages, normalizeDocToPages } from "@/lib/editorDocument";
import type { PageBackground, Stroke } from "@/lib/editorTypes";
import { createNote, loadNote, saveNote } from "@/lib/notesStorage";

type UseNotePersistenceArgs = {
  routeNoteId: string | null;
  router: Router;
  isPointerDownRef: RefObject<boolean>;
  pages: Stroke[][];
  pageBackgrounds: PageBackground[];
  currentPageIndex: number;
  strokes: Stroke[];
  emptyBackground: PageBackground;
  resetCanvasState: () => void;
  setPages: (pages: Stroke[][]) => void;
  setPageBackgrounds: (backgrounds: PageBackground[]) => void;
  setCurrentPageIndex: (index: number) => void;
  setStrokes: (strokes: Stroke[]) => void;
  setHistory: (history: Stroke[][]) => void;
  setHistoryIndex: (index: number) => void;
};

export function useNotePersistence({
  routeNoteId,
  router,
  isPointerDownRef,
  pages,
  pageBackgrounds,
  currentPageIndex,
  strokes,
  emptyBackground,
  resetCanvasState,
  setPages,
  setPageBackgrounds,
  setCurrentPageIndex,
  setStrokes,
  setHistory,
  setHistoryIndex,
}: UseNotePersistenceArgs) {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!routeNoteId) {
        setActiveNoteId(null);
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

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      setActiveNoteId(routeNoteId);
      setHydrating(true);
      resetCanvasState();
      setStrokes([]);

      try {
        const data = await loadNote(routeNoteId);
        if (cancelled) return;

        const normalized = normalizeDocToPages(data?.doc);
        const pageStrokes = normalized.pages[normalized.currentPageIndex] ?? [];
        setPages(normalized.pages);
        setPageBackgrounds(normalized.pageBackgrounds);
        setCurrentPageIndex(normalized.currentPageIndex);
        setStrokes(pageStrokes);
        setHistory([pageStrokes]);
        setHistoryIndex(0);
      } catch {
        if (!cancelled) {
          setPages([[]]);
          setPageBackgrounds([{ ...emptyBackground }]);
          setCurrentPageIndex(0);
          setStrokes([]);
          setHistory([[]]);
          setHistoryIndex(0);
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
    setCurrentPageIndex,
    setHistory,
    setHistoryIndex,
    setPageBackgrounds,
    setPages,
    setStrokes,
  ]);

  useEffect(() => {
    if (!activeNoteId) return;
    if (hydrating) return;
    if (isPointerDownRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      if (hydrating) return;

      const doc = buildDocFromPages(pages, pageBackgrounds, currentPageIndex);
      saveNote(activeNoteId, { doc }).catch(() => {});
    }, 450);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    strokes,
    activeNoteId,
    hydrating,
    pages,
    pageBackgrounds,
    currentPageIndex,
    isPointerDownRef,
  ]);

  return {
    activeNoteId,
    hydrating,
  };
}
