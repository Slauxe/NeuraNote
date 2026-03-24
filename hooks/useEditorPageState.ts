import { useEffect, useRef, useState } from "react";

import type { PageBackground, Stroke } from "@/lib/editorTypes";

type UseEditorPageStateArgs = {
  emptyBackground: PageBackground;
};

export function useEditorPageState({
  emptyBackground,
}: UseEditorPageStateArgs) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const [pages, setPages] = useState<Stroke[][]>([[]]);
  const [pageBackgrounds, setPageBackgrounds] = useState<PageBackground[]>([
    { ...emptyBackground },
  ]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [history, setHistory] = useState<Stroke[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    setPages((prev) => {
      const base = prev.length > 0 ? prev : [[]];
      const idx = Math.max(0, Math.min(currentPageIndex, base.length - 1));
      if (base[idx] === strokes) return base;
      const next = base.slice();
      next[idx] = strokes;
      return next;
    });
  }, [strokes, currentPageIndex]);

  const pushHistory = (newStrokes: Stroke[]) => {
    setHistory((prev) => {
      const newIndex = historyIndex + 1;
      return [...prev.slice(0, newIndex), newStrokes];
    });
    setHistoryIndex((prev) => prev + 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setStrokes(history[newIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setStrokes(history[newIndex]);
    }
  };

  const loadSnapshot = ({
    pages: nextPages,
    pageBackgrounds: nextBackgrounds,
    currentPageIndex: nextPageIndex,
    strokes: nextStrokes,
  }: {
    pages: Stroke[][];
    pageBackgrounds: PageBackground[];
    currentPageIndex: number;
    strokes: Stroke[];
  }) => {
    setPages(nextPages);
    setPageBackgrounds(nextBackgrounds);
    setCurrentPageIndex(nextPageIndex);
    setStrokes(nextStrokes);
    setHistory([nextStrokes]);
    setHistoryIndex(0);
  };

  const clearAll = () => {
    loadSnapshot({
      pages: [[]],
      pageBackgrounds: [{ ...emptyBackground }],
      currentPageIndex: 0,
      strokes: [],
    });
  };

  const selectPage = (index: number, beforeSwitch: () => void) => {
    const safePages = pages.length > 0 ? pages : [[]];
    const nextIndex = Math.max(0, Math.min(safePages.length - 1, index));
    const nextStrokes = safePages[nextIndex] ?? [];

    beforeSwitch();
    setCurrentPageIndex(nextIndex);
    setStrokes(nextStrokes);
    setHistory([nextStrokes]);
    setHistoryIndex(0);
  };

  const addPageBelowCurrent = (beforeSwitch: () => void) => {
    const safePages = pages.length > 0 ? pages : [[]];
    const safeBackgrounds = safePages.map(
      (_, i) => pageBackgrounds[i] ?? { ...emptyBackground },
    );
    const insertAt = Math.max(
      0,
      Math.min(safePages.length, currentPageIndex + 1),
    );
    const nextPages = [
      ...safePages.slice(0, insertAt),
      [],
      ...safePages.slice(insertAt),
    ];
    const nextBackgrounds = [
      ...safeBackgrounds.slice(0, insertAt),
      { ...emptyBackground },
      ...safeBackgrounds.slice(insertAt),
    ];

    beforeSwitch();
    setPages(nextPages);
    setPageBackgrounds(nextBackgrounds);
    setCurrentPageIndex(insertAt);
    setStrokes([]);
    setHistory([[]]);
    setHistoryIndex(0);
  };

  const removeCurrentPage = (beforeSwitch: () => void) => {
    const safePages = pages.length > 0 ? pages : [[]];
    const safeBackgrounds = safePages.map(
      (_, i) => pageBackgrounds[i] ?? { ...emptyBackground },
    );

    if (safePages.length <= 1) {
      beforeSwitch();
      clearAll();
      return;
    }

    const nextPages = safePages.filter((_, i) => i !== currentPageIndex);
    const nextBackgrounds = safeBackgrounds.filter(
      (_, i) => i !== currentPageIndex,
    );
    const nextIndex = Math.max(
      0,
      Math.min(nextPages.length - 1, currentPageIndex),
    );
    const nextStrokes = nextPages[nextIndex] ?? [];

    beforeSwitch();
    setPages(nextPages);
    setPageBackgrounds(nextBackgrounds);
    setCurrentPageIndex(nextIndex);
    setStrokes(nextStrokes);
    setHistory([nextStrokes]);
    setHistoryIndex(0);
  };

  const movePage = (from: number, delta: -1 | 1) => {
    const safePages = pages.length > 0 ? pages : [[]];
    const safeBackgrounds = safePages.map(
      (_, i) => pageBackgrounds[i] ?? { ...emptyBackground },
    );
    const to = from + delta;
    if (from < 0 || from >= safePages.length) return;
    if (to < 0 || to >= safePages.length) return;

    const nextPages = safePages.slice();
    const nextBackgrounds = safeBackgrounds.slice();
    const [moved] = nextPages.splice(from, 1);
    const [movedBg] = nextBackgrounds.splice(from, 1);
    nextPages.splice(to, 0, moved);
    nextBackgrounds.splice(to, 0, movedBg ?? { ...emptyBackground });

    let nextCurrentIndex = currentPageIndex;
    if (currentPageIndex === from) nextCurrentIndex = to;
    else if (from < currentPageIndex && to >= currentPageIndex) {
      nextCurrentIndex = currentPageIndex - 1;
    } else if (from > currentPageIndex && to <= currentPageIndex) {
      nextCurrentIndex = currentPageIndex + 1;
    }

    setPages(nextPages);
    setPageBackgrounds(nextBackgrounds);
    setCurrentPageIndex(nextCurrentIndex);
  };

  return {
    strokes,
    setStrokes,
    strokesRef,
    pages,
    setPages,
    pageBackgrounds,
    setPageBackgrounds,
    currentPageIndex,
    setCurrentPageIndex,
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    pushHistory,
    undo,
    redo,
    loadSnapshot,
    clearAll,
    selectPage,
    addPageBelowCurrent,
    removeCurrentPage,
    movePage,
  };
}
