import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PageBackground, Stroke } from "@/lib/editorTypes";
import type { NoteTextItem } from "@/lib/noteDocument";

type UseEditorPageStateArgs = {
  emptyBackground: PageBackground;
};

type PageHistoryState = {
  entries: Stroke[][];
  index: number;
};

const MAX_HISTORY_ENTRIES = 100;

function cloneStroke(stroke: Stroke): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
    segmentBBoxes: stroke.segmentBBoxes.map((bbox) => ({ ...bbox })),
    axisOrigin: stroke.axisOrigin ? { ...stroke.axisOrigin } : undefined,
    axisHandle: stroke.axisHandle ? { ...stroke.axisHandle } : undefined,
    bbox: { ...stroke.bbox },
  };
}

function cloneStrokeSnapshot(strokes: Stroke[]): Stroke[] {
  return strokes.map(cloneStroke);
}

function buildInitialHistories(pages: Stroke[][]): PageHistoryState[] {
  const safePages = pages.length > 0 ? pages : [[]];
  return safePages.map((page) => ({
    // Seed history with the loaded snapshot by reference; we clone lazily
    // when committing or restoring history entries.
    entries: [page],
    index: 0,
  }));
}

function pushHistoryEntry(
  history: PageHistoryState,
  snapshot: Stroke[],
): PageHistoryState {
  const nextEntries = [
    ...history.entries.slice(0, history.index + 1),
    cloneStrokeSnapshot(snapshot),
  ];

  if (nextEntries.length <= MAX_HISTORY_ENTRIES) {
    return {
      entries: nextEntries,
      index: nextEntries.length - 1,
    };
  }

  const trimmedEntries = nextEntries.slice(
    nextEntries.length - MAX_HISTORY_ENTRIES,
  );
  return {
    entries: trimmedEntries,
    index: trimmedEntries.length - 1,
  };
}

export function useEditorPageState({
  emptyBackground,
}: UseEditorPageStateArgs) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const [pages, setPages] = useState<Stroke[][]>([[]]);
  const pagesRef = useRef<Stroke[][]>([[]]);
  const [pageBackgrounds, setPageBackgrounds] = useState<PageBackground[]>([
    { ...emptyBackground },
  ]);
  const [pageTextItems, setPageTextItems] = useState<NoteTextItem[][]>([[]]);
  const pageTextItemsRef = useRef<NoteTextItem[][]>([[]]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const currentPageIndexRef = useRef(0);
  const [pageHistories, setPageHistories] = useState<PageHistoryState[]>([
    { entries: [[]], index: 0 },
  ]);
  const pageHistoriesRef = useRef<PageHistoryState[]>([
    { entries: [[]], index: 0 },
  ]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    pageTextItemsRef.current = pageTextItems;
  }, [pageTextItems]);

  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

  useEffect(() => {
    pageHistoriesRef.current = pageHistories;
  }, [pageHistories]);

  const syncCurrentPageState = useCallback(
    (nextIndex: number, nextStrokes: Stroke[]) => {
      currentPageIndexRef.current = nextIndex;
      strokesRef.current = nextStrokes;
      setCurrentPageIndex(nextIndex);
      setStrokes(nextStrokes);
    },
    [],
  );

  const updateCurrentPageStrokes = useCallback(
    (next:
      | Stroke[]
      | ((prev: Stroke[]) => Stroke[])) => {
      const pageIndex = currentPageIndexRef.current;
      const previousStrokes = strokesRef.current;
      const resolved =
        typeof next === "function"
          ? (next as (prev: Stroke[]) => Stroke[])(previousStrokes)
          : next;

      if (resolved === previousStrokes) return previousStrokes;

      const nextPages = (pagesRef.current.length > 0 ? pagesRef.current : [[]]).slice();
      nextPages[pageIndex] = resolved;
      pagesRef.current = nextPages;
      strokesRef.current = resolved;
      setPages(nextPages);
      setStrokes(resolved);
      return resolved;
    },
    [],
  );

  const commitCurrentPageHistory = useCallback((snapshot?: Stroke[]) => {
    const pageIndex = currentPageIndexRef.current;
    const nextSnapshot = snapshot ?? strokesRef.current;
    const nextHistories = pageHistoriesRef.current.slice();
    const currentHistory = nextHistories[pageIndex] ?? {
      entries: [cloneStrokeSnapshot(nextSnapshot)],
      index: 0,
    };
    nextHistories[pageIndex] = pushHistoryEntry(currentHistory, nextSnapshot);
    pageHistoriesRef.current = nextHistories;
    setPageHistories(nextHistories);
  }, []);

  const commitCurrentPageStrokes = useCallback(
    (next:
      | Stroke[]
      | ((prev: Stroke[]) => Stroke[])) => {
      const resolved = updateCurrentPageStrokes(next);
      commitCurrentPageHistory(resolved);
      return resolved;
    },
    [commitCurrentPageHistory, updateCurrentPageStrokes],
  );

  const historyState = useMemo(() => {
    return (
      pageHistories[currentPageIndex] ?? {
        entries: [cloneStrokeSnapshot(strokes)],
        index: 0,
      }
    );
  }, [currentPageIndex, pageHistories, strokes]);

  const history = historyState.entries;
  const historyIndex = historyState.index;

  const undo = () => {
    const pageIndex = currentPageIndexRef.current;
    const currentHistory = pageHistoriesRef.current[pageIndex];
    if (!currentHistory || currentHistory.index <= 0) return;

    const nextIndex = currentHistory.index - 1;
    const nextSnapshot = cloneStrokeSnapshot(currentHistory.entries[nextIndex] ?? []);
    const nextHistories = pageHistoriesRef.current.slice();
    nextHistories[pageIndex] = {
      entries: currentHistory.entries,
      index: nextIndex,
    };
    pageHistoriesRef.current = nextHistories;
    setPageHistories(nextHistories);
    updateCurrentPageStrokes(nextSnapshot);
  };

  const redo = () => {
    const pageIndex = currentPageIndexRef.current;
    const currentHistory = pageHistoriesRef.current[pageIndex];
    if (!currentHistory || currentHistory.index >= currentHistory.entries.length - 1) {
      return;
    }

    const nextIndex = currentHistory.index + 1;
    const nextSnapshot = cloneStrokeSnapshot(currentHistory.entries[nextIndex] ?? []);
    const nextHistories = pageHistoriesRef.current.slice();
    nextHistories[pageIndex] = {
      entries: currentHistory.entries,
      index: nextIndex,
    };
    pageHistoriesRef.current = nextHistories;
    setPageHistories(nextHistories);
    updateCurrentPageStrokes(nextSnapshot);
  };

  const loadSnapshot = useCallback(
    ({
      pages: nextPages,
      pageBackgrounds: nextBackgrounds,
      pageTextItems: nextTextItems,
      currentPageIndex: nextPageIndex,
      strokes: nextStrokes,
    }: {
      pages: Stroke[][];
      pageTextItems: NoteTextItem[][];
      pageBackgrounds: PageBackground[];
      currentPageIndex: number;
      strokes: Stroke[];
    }) => {
      const safePages = nextPages.length > 0 ? nextPages : [[]];
      const clampedIndex = Math.max(
        0,
        Math.min(safePages.length - 1, nextPageIndex),
      );
      const pageSnapshot = nextStrokes ?? safePages[clampedIndex] ?? [];
      const nextHistories = buildInitialHistories(safePages);

      pagesRef.current = safePages;
      pageHistoriesRef.current = nextHistories;
      setPages(safePages);
      setPageTextItems(nextTextItems);
      setPageBackgrounds(nextBackgrounds);
      setPageHistories(nextHistories);
      syncCurrentPageState(clampedIndex, pageSnapshot);
    },
    [syncCurrentPageState],
  );

  const clearAll = () => {
    loadSnapshot({
      pages: [[]],
      pageBackgrounds: [{ ...emptyBackground }],
      pageTextItems: [[]],
      currentPageIndex: 0,
      strokes: [],
    });
  };

  const selectPage = (index: number, beforeSwitch: () => void) => {
    const safePages = pagesRef.current.length > 0 ? pagesRef.current : [[]];
    const nextIndex = Math.max(0, Math.min(safePages.length - 1, index));
    const currentHistory = pageHistoriesRef.current[nextIndex];
    const nextStrokes = cloneStrokeSnapshot(
      currentHistory?.entries[currentHistory.index] ?? safePages[nextIndex] ?? [],
    );

    beforeSwitch();
    syncCurrentPageState(nextIndex, nextStrokes);
  };

  const addPageBelowCurrent = (beforeSwitch: () => void) => {
    const safePages = pagesRef.current.length > 0 ? pagesRef.current : [[]];
    const safeBackgrounds = safePages.map(
      (_, i) => pageBackgrounds[i] ?? { ...emptyBackground },
    );
    const safeTextItems = safePages.map((_, i) => pageTextItemsRef.current[i] ?? []);
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
    const nextTextItems = [
      ...safeTextItems.slice(0, insertAt),
      [],
      ...safeTextItems.slice(insertAt),
    ];
    const nextHistories = [
      ...pageHistoriesRef.current.slice(0, insertAt),
      { entries: [[]], index: 0 },
      ...pageHistoriesRef.current.slice(insertAt),
    ];

    beforeSwitch();
    pagesRef.current = nextPages;
    pageHistoriesRef.current = nextHistories;
    setPages(nextPages);
    setPageTextItems(nextTextItems);
    setPageBackgrounds(nextBackgrounds);
    setPageHistories(nextHistories);
    syncCurrentPageState(insertAt, []);
  };

  const removeCurrentPage = (beforeSwitch: () => void) => {
    const safePages = pagesRef.current.length > 0 ? pagesRef.current : [[]];
    const safeBackgrounds = safePages.map(
      (_, i) => pageBackgrounds[i] ?? { ...emptyBackground },
    );
    const safeTextItems = safePages.map((_, i) => pageTextItemsRef.current[i] ?? []);

    if (safePages.length <= 1) {
      beforeSwitch();
      clearAll();
      return;
    }

    const nextPages = safePages.filter((_, i) => i !== currentPageIndex);
    const nextBackgrounds = safeBackgrounds.filter(
      (_, i) => i !== currentPageIndex,
    );
    const nextTextItems = safeTextItems.filter((_, i) => i !== currentPageIndex);
    const nextHistories = pageHistoriesRef.current.filter(
      (_, i) => i !== currentPageIndex,
    );
    const nextIndex = Math.max(
      0,
      Math.min(nextPages.length - 1, currentPageIndex),
    );
    const nextHistory = nextHistories[nextIndex];
    const nextStrokes = cloneStrokeSnapshot(
      nextHistory?.entries[nextHistory.index] ?? nextPages[nextIndex] ?? [],
    );

    beforeSwitch();
    pagesRef.current = nextPages;
    pageHistoriesRef.current = nextHistories;
    setPages(nextPages);
    setPageTextItems(nextTextItems);
    setPageBackgrounds(nextBackgrounds);
    setPageHistories(nextHistories);
    syncCurrentPageState(nextIndex, nextStrokes);
  };

  const movePage = (from: number, delta: -1 | 1) => {
    const safePages = pagesRef.current.length > 0 ? pagesRef.current : [[]];
    const safeBackgrounds = safePages.map(
      (_, i) => pageBackgrounds[i] ?? { ...emptyBackground },
    );
    const safeTextItems = safePages.map((_, i) => pageTextItemsRef.current[i] ?? []);
    const to = from + delta;
    if (from < 0 || from >= safePages.length) return;
    if (to < 0 || to >= safePages.length) return;

    const nextPages = safePages.slice();
    const nextBackgrounds = safeBackgrounds.slice();
    const nextTextItems = safeTextItems.slice();
    const nextHistories = pageHistoriesRef.current.slice();
    const [moved] = nextPages.splice(from, 1);
    const [movedBg] = nextBackgrounds.splice(from, 1);
    const [movedTextItems] = nextTextItems.splice(from, 1);
    const [movedHistory] = nextHistories.splice(from, 1);
    nextPages.splice(to, 0, moved);
    nextBackgrounds.splice(to, 0, movedBg ?? { ...emptyBackground });
    nextTextItems.splice(to, 0, movedTextItems ?? []);
    nextHistories.splice(to, 0, movedHistory ?? { entries: [[]], index: 0 });

    let nextCurrentIndex = currentPageIndex;
    if (currentPageIndex === from) nextCurrentIndex = to;
    else if (from < currentPageIndex && to >= currentPageIndex) {
      nextCurrentIndex = currentPageIndex - 1;
    } else if (from > currentPageIndex && to <= currentPageIndex) {
      nextCurrentIndex = currentPageIndex + 1;
    }

    pagesRef.current = nextPages;
    pageHistoriesRef.current = nextHistories;
    setPages(nextPages);
    setPageTextItems(nextTextItems);
    setPageBackgrounds(nextBackgrounds);
    setPageHistories(nextHistories);
    syncCurrentPageState(
      nextCurrentIndex,
      cloneStrokeSnapshot(
        nextHistories[nextCurrentIndex]?.entries[
          nextHistories[nextCurrentIndex]?.index ?? 0
        ] ?? nextPages[nextCurrentIndex] ?? [],
      ),
    );
  };

  return {
    strokes,
    setStrokes,
    strokesRef,
    updateCurrentPageStrokes,
    commitCurrentPageStrokes,
    commitCurrentPageHistory,
    pages,
    setPages,
    pageTextItems,
    setPageTextItems,
    pageBackgrounds,
    setPageBackgrounds,
    currentPageIndex,
    setCurrentPageIndex,
    history,
    historyIndex,
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
