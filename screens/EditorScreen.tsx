import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FloatingToolbar } from "@/components/editor/FloatingToolbar";
import {
  DISPLAY_FONT,
  STUDIO,
} from "@/components/studio/StudioPrimitives";
import { PageCanvas } from "@/components/editor/PageCanvas";
import { ColorModal } from "@/components/editor/modals/ColorModal";
import { BoardBackgroundModal } from "@/components/editor/modals/BoardBackgroundModal";
import { PagesModal } from "@/components/editor/modals/PagesModal";
import { ShapeModal } from "@/components/editor/modals/ShapeModal";
import { SizeModal } from "@/components/editor/modals/SizeModal";
import { ToolbarLayoutModal } from "@/components/editor/modals/ToolbarLayoutModal";
import { useCanvasInteractions } from "@/hooks/useCanvasInteractions";
import { useEditorPageState } from "@/hooks/useEditorPageState";
import { useNotePersistence } from "@/hooks/useNotePersistence";
import { getCanvasSize, getPagePresetSize } from "@/lib/editorGeometry";
import type {
  InfiniteBoard,
  InfiniteBoardBackgroundStyle,
  NoteMetadata,
  NoteKind,
  NoteTextItem,
  PageSizePreset,
  PageTemplate,
  ShapePreset,
} from "@/lib/noteDocument";
import { EMPTY_PAGE_BACKGROUND } from "@/lib/editorTypes";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

// Theme
const WORKSPACE_BG = STUDIO.bg;
const TOPBAR_BORDER = STUDIO.line;

const PAGE_BG = "#ffffff";
const TOP_CHROME_TOP = 14;
const BACK_BUTTON_LEFT = 14;
const TOOLBAR_GAP = 12;

const ERASER_MULT = 10;

const MIN_DIST_PX = 2;
const MIN_POINTS_TO_SAVE = 3;
const STROKE_SMOOTHING_ALPHA = 0.38;

const SIZE_OPTIONS: { label: string; width: number }[] = [
  { label: "1", width: 3 },
  { label: "2", width: 4 },
  { label: "3", width: 5 },
  { label: "4", width: 6 },
  { label: "5", width: 7 },
];

const HIGHLIGHTER_SIZE_OPTIONS: { label: string; width: number }[] = [
  { label: "1", width: 10 },
  { label: "2", width: 14 },
  { label: "3", width: 18 },
  { label: "4", width: 22 },
  { label: "5", width: 28 },
];

const DEFAULT_SLOTS: string[] = [
  "#111111",
  "#FFFFFF",
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#34C759",
  "#007AFF",
  "#5856D6",
  "#AF52DE",
  "#FF2D55",
];

const INFINITE_EDGE_TRIGGER = 220;
const INFINITE_EXPAND_X = 1200;
const INFINITE_EXPAND_Y = 900;
const EMPTY_SELECTED_SET = new Set<string>();
const ZERO_SELECTION_OFFSET = { dx: 0, dy: 0 };
const DEFAULT_GRID_STEP = 28;

type PerfSnapshot = {
  strokeCount: number;
  pointCount: number;
  frameDurationMs: number;
  eraseBatchSize: number;
  eraseCandidateCount: number;
  dirtyRectArea: number;
  activePageRenders: number;
};

const INITIAL_PERF_SNAPSHOT: PerfSnapshot = {
  strokeCount: 0,
  pointCount: 0,
  frameDurationMs: 0,
  eraseBatchSize: 0,
  eraseCandidateCount: 0,
  dirtyRectArea: 0,
  activePageRenders: 0,
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function formatSaveLabel(
  saveState: "idle" | "dirty" | "saving" | "saved" | "error",
  recoveredFromDraft: boolean,
) {
  if (recoveredFromDraft) return "Recovered draft";
  if (saveState === "saving") return "Saving";
  if (saveState === "dirty") return "Unsaved";
  if (saveState === "saved") return "Saved";
  if (saveState === "error") return "Save failed";
  return "All changes saved";
}

function normalizeNoteId(x: unknown): string | null {
  if (typeof x === "string" && x.trim()) return x;
  if (Array.isArray(x) && typeof x[0] === "string" && x[0].trim()) return x[0];
  return null;
}

function inferGridStep(template: PageTemplate) {
  if (template === "graph-fine") return 20;
  if (template === "graph-coarse") return 32;
  if (template === "grid" || template === "dots") return DEFAULT_GRID_STEP;
  if (template === "isometric") return 28;
  return DEFAULT_GRID_STEP;
}

export default function EditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeNoteId = normalizeNoteId((params as any)?.noteId);
  const insets = useSafeAreaInsets();
  const topChromeTop = insets.top + TOP_CHROME_TOP;
  const toolbarMinTop = topChromeTop;

  // Tool
  const [tool, setTool] = useState<
    "pen" | "highlighter" | "shape" | "text" | "eraser" | "lasso" | "hand"
  >("pen");
  const [exportFeedback, setExportFeedback] = useState<{
    tone: "idle" | "success" | "error";
    message: string;
  }>({
    tone: "idle",
    message: "",
  });

  // Toolbar drag + orientation
  const [toolbarOrientation, setToolbarOrientation] = useState<
    "horizontal" | "vertical"
  >("horizontal");
  const [isToolbarModeOpen, setIsToolbarModeOpen] = useState(false);

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [toolbarSize, setToolbarSize] = useState({ w: 0, h: 0 });
  const [backButtonWidth, setBackButtonWidth] = useState(0);

  // toolbar position (absolute)
  const [toolbarPos, setToolbarPos] = useState({
    x: BACK_BUTTON_LEFT + 120 + TOOLBAR_GAP,
    y: TOP_CHROME_TOP,
  });
  const hasInitializedToolbarPos = useRef(false);

  const toolbarPosRef = useRef(toolbarPos);
  const toolbarPosX = useSharedValue(toolbarPos.x);
  const toolbarPosY = useSharedValue(toolbarPos.y);
  const toolbarMinX = useSharedValue(0);
  const toolbarMaxX = useSharedValue(0);
  const toolbarMinY = useSharedValue(toolbarMinTop);
  const toolbarMaxY = useSharedValue(toolbarMinTop);
  const toolbarDragStartX = useSharedValue(toolbarPos.x);
  const toolbarDragStartY = useSharedValue(toolbarPos.y);
  const toolbarMoved = useSharedValue(false);
  useEffect(() => {
    toolbarPosRef.current = toolbarPos;
    toolbarPosX.value = toolbarPos.x;
    toolbarPosY.value = toolbarPos.y;
    toolbarDragStartX.value = toolbarPos.x;
    toolbarDragStartY.value = toolbarPos.y;
  }, [toolbarDragStartX, toolbarDragStartY, toolbarPos, toolbarPosX, toolbarPosY]);

  // double-tap on the 3-dot handle
  const lastHandleTapMs = useRef<number>(0);
  // Tool sizes (separate pen/eraser)
  const [penSizeIndex, setPenSizeIndex] = useState(0);
  const [highlighterSizeIndex, setHighlighterSizeIndex] = useState(2);
  const [eraserSizeIndex, setEraserSizeIndex] = useState(2);
  const penWidth = SIZE_OPTIONS[penSizeIndex].width;
  const highlighterWidth = HIGHLIGHTER_SIZE_OPTIONS[highlighterSizeIndex].width;
  const eraserWidth = SIZE_OPTIONS[eraserSizeIndex].width * ERASER_MULT;
  const [isSizeModalOpen, setIsSizeModalOpen] = useState(false);
  const [sizeModalTool, setSizeModalTool] = useState<
    "pen" | "highlighter" | "eraser"
  >("pen");
  // Pen color
  const [hue, setHue] = useState(0);
  const [penColor, setPenColor] = useState<string>("#111111");
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);

  // Saved slots
  const [colorSlots, setColorSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [isPagesModalOpen, setIsPagesModalOpen] = useState(false);
  const [isShapeModalOpen, setIsShapeModalOpen] = useState(false);
  const [shapePreset, setShapePreset] = useState<ShapePreset>("line");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [shapeSnapEnabled, setShapeSnapEnabled] = useState(true);
  const [textDraft, setTextDraft] = useState("");
  const [pendingTextPoint, setPendingTextPoint] = useState<{
    pageIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const [pageTemplate, setPageTemplate] = useState<PageTemplate>("blank");
  const [pageSizePreset, setPageSizePreset] = useState<PageSizePreset>("letter");
  const [metadata, setMetadata] = useState<NoteMetadata>({
    description: "",
    tags: [],
    bookmarkedPages: [],
    pageTemplate: "blank",
    pageSizePreset: "letter",
  });
  const [tagsInput, setTagsInput] = useState("");
  useEffect(() => {
    setPageTemplate(metadata.pageTemplate ?? "blank");
    setPageSizePreset(metadata.pageSizePreset ?? "letter");
    setTagsInput((metadata.tags ?? []).join(", "));
  }, [metadata.pageSizePreset, metadata.pageTemplate, metadata.tags]);
  useEffect(() => {
    setMetadata((prev) =>
      prev.pageTemplate === pageTemplate && prev.pageSizePreset === pageSizePreset
        ? prev
        : { ...prev, pageTemplate, pageSizePreset },
    );
  }, [pageSizePreset, pageTemplate]);

  // Effective settings depend on tool
  const activeColor = tool === "eraser" ? PAGE_BG : penColor;
  const activeWidth =
    tool === "eraser"
      ? eraserWidth
      : tool === "highlighter"
        ? highlighterWidth
        : penWidth;
  const activeOpacity = tool === "highlighter" ? 0.32 : 1;
  const eraserRadius = activeWidth / 2;

  // Option B refs (latest brush settings)
  const activeColorRef = useRef(activeColor);
  const activeWidthRef = useRef(activeWidth);
  const activeAlphaRef = useRef(activeOpacity);
  useEffect(() => {
    activeColorRef.current = activeColor;
    activeWidthRef.current = activeWidth;
    activeAlphaRef.current = activeOpacity;
  }, [activeColor, activeWidth, activeOpacity]);

  // Zoom
  const [zoom, setZoom] = useState(1);
  const clampZoom = useCallback(
    (z: number) => Math.max(0.5, Math.min(2.5, z)),
    [],
  );
  const quantizeZoom = useCallback((z: number) => Math.round(z * 100) / 100, []);
  const zoomRef = useRef(1);
  const workspaceRef = useRef<any>(null);
  const wheelZoomRafRef = useRef<number | null>(null);
  const wheelZoomAccumRef = useRef(0);
  const wheelZoomFocusRef = useRef<{ x: number; y: number } | null>(null);
  const [noteKind, setNoteKind] = useState<NoteKind>("page");
  const [boardSize, setBoardSize] = useState<InfiniteBoard | null>(null);
  const [boardBackgroundStyle, setBoardBackgroundStyle] =
    useState<InfiniteBoardBackgroundStyle>("grid");
  const canvasSize = useMemo(
    () =>
      noteKind === "infinite"
        ? boardSize ?? getCanvasSize(noteKind)
        : getPagePresetSize(pageSizePreset),
    [boardSize, noteKind, pageSizePreset],
  );
  const isInfiniteCanvas = noteKind === "infinite";
  const [isBoardBackgroundModalOpen, setIsBoardBackgroundModalOpen] =
    useState(false);
  const scrollContainerRef = useRef<any>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!exportFeedback.message) return;
    const timer = setTimeout(() => {
      setExportFeedback({ tone: "idle", message: "" });
    }, 2400);
    return () => clearTimeout(timer);
  }, [exportFeedback]);

  // Strokes + current stroke
  const {
    strokes,
    strokesRef,
    updateCurrentPageStrokes,
    commitCurrentPageStrokes,
    commitCurrentPageHistory,
    pages,
    pageTextItems,
    setPageTextItems,
    pageBackgrounds,
    setPageBackgrounds,
    currentPageIndex,
    history,
    historyIndex,
    undo,
    redo,
    loadSnapshot,
    selectPage,
    addPageBelowCurrent,
    removeCurrentPage,
    movePage,
  } = useEditorPageState({
    emptyBackground: EMPTY_PAGE_BACKGROUND,
  });
  const canvasSizeRef = useRef(canvasSize);
  const perfRef = useRef<PerfSnapshot>(INITIAL_PERF_SNAPSHOT);
  const [perfSnapshot, setPerfSnapshot] = useState<PerfSnapshot>(
    INITIAL_PERF_SNAPSHOT,
  );

  // ---- Toolbar constraints
  const clampToolbarPos = (x: number, y: number) => {
    const maxX = Math.max(0, containerSize.w - toolbarSize.w);
    const maxY = Math.max(toolbarMinTop, containerSize.h - toolbarSize.h - insets.bottom);
    return {
      x: clamp(x, 0, maxX),
      y: clamp(y, toolbarMinTop, maxY),
    };
  };
  useEffect(() => {
    toolbarMinX.value = 0;
    toolbarMaxX.value = Math.max(0, containerSize.w - toolbarSize.w);
    toolbarMinY.value = toolbarMinTop;
    toolbarMaxY.value = Math.max(
      toolbarMinTop,
      containerSize.h - toolbarSize.h - insets.bottom,
    );
  }, [
    containerSize.h,
    containerSize.w,
    insets.bottom,
    toolbarMaxX,
    toolbarMaxY,
    toolbarMinTop,
    toolbarMinX,
    toolbarMinY,
    toolbarSize.h,
    toolbarSize.w,
  ]);

  const commitToolbarPos = useCallback((x: number, y: number) => {
    const next = clampToolbarPos(x, y);
    toolbarPosRef.current = next;
    setToolbarPos(next);
  }, [containerSize.h, containerSize.w, insets.bottom, toolbarMinTop, toolbarSize.h, toolbarSize.w]);

  const handleToolbarDragEnd = useCallback(
    (x: number, y: number, moved: boolean) => {
      commitToolbarPos(x, y);
      if (!moved) {
        const now = Date.now();
        if (now - lastHandleTapMs.current < 280) {
          setIsToolbarModeOpen(true);
        }
        lastHandleTapMs.current = now;
      }
    },
    [commitToolbarPos],
  );

  // When orientation changes, size changes -> keep toolbar in view
  useEffect(() => {
    setToolbarPos((p) => clampToolbarPos(p.x, p.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    toolbarOrientation,
    containerSize.w,
    containerSize.h,
    toolbarSize.w,
    toolbarSize.h,
  ]);

  useEffect(() => {
    if (hasInitializedToolbarPos.current || backButtonWidth <= 0) return;
    hasInitializedToolbarPos.current = true;
    setToolbarPos(
      clampToolbarPos(
        BACK_BUTTON_LEFT + backButtonWidth + TOOLBAR_GAP,
        topChromeTop,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backButtonWidth, topChromeTop]);

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  const toolbarHandleGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onStart(() => {
          "worklet";
          toolbarMoved.value = false;
          toolbarDragStartX.value = toolbarPosX.value;
          toolbarDragStartY.value = toolbarPosY.value;
        })
        .onUpdate((event) => {
          "worklet";
          if (Math.abs(event.translationX) + Math.abs(event.translationY) > 3) {
            toolbarMoved.value = true;
          }

          const nextX = Math.max(
            toolbarMinX.value,
            Math.min(toolbarMaxX.value, toolbarDragStartX.value + event.translationX),
          );
          const nextY = Math.max(
            toolbarMinY.value,
            Math.min(toolbarMaxY.value, toolbarDragStartY.value + event.translationY),
          );
          toolbarPosX.value = nextX;
          toolbarPosY.value = nextY;
        })
        .onEnd(() => {
          "worklet";
          runOnJS(handleToolbarDragEnd)(
            toolbarPosX.value,
            toolbarPosY.value,
            toolbarMoved.value,
          );
        })
        .onFinalize(() => {
          "worklet";
          toolbarMoved.value = false;
        }),
    [
      handleToolbarDragEnd,
      toolbarDragStartX,
      toolbarDragStartY,
      toolbarMaxX,
      toolbarMaxY,
      toolbarMinX,
      toolbarMinY,
      toolbarMoved,
      toolbarPosX,
      toolbarPosY,
    ],
  );

  const floatingToolbarStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: toolbarPosX.value - toolbarPos.x },
      { translateY: toolbarPosY.value - toolbarPos.y },
    ],
  }), [toolbarPos.x, toolbarPos.y]);

  const handlePerfEvent = useCallback(
    (
      event:
        | { type: "eraseBatch"; batchSize: number }
        | { type: "interaction"; active: boolean }
        | { type: "dirtyRect"; area: number }
        | { type: "eraseCandidates"; count: number },
    ) => {
      if (event.type === "eraseBatch") {
        perfRef.current = {
          ...perfRef.current,
          eraseBatchSize: event.batchSize,
        };
        return;
      }

      if (event.type === "eraseCandidates") {
        perfRef.current = {
          ...perfRef.current,
          eraseCandidateCount: event.count,
        };
        return;
      }

      if (event.type === "dirtyRect") {
        perfRef.current = {
          ...perfRef.current,
          dirtyRectArea: event.area,
        };
        return;
      }

      if (event.active) {
        perfRef.current = {
          ...perfRef.current,
          activePageRenders: 0,
          eraseBatchSize: 0,
          eraseCandidateCount: 0,
          dirtyRectArea: 0,
        };
      }
    },
    [],
  );

  const {
    currentPath,
    eraserCursor,
    lassoPath,
    selectedIds,
    selectedSet,
    selectionPreviewOffset,
    selectionBounds,
    isInteracting,
    livePreviewStateRef,
    nativeStrokePreview,
    acknowledgeActivePageRender,
    isPointerDown,
    pageHandlersByPage,
    deleteSelection,
    resetCanvasState,
    handleSelectPage,
    handleAddPageBelowCurrent,
    handleRemoveCurrentPage,
    clearPenModeArtifacts,
    clearEraserModeArtifacts,
    clearLassoModeArtifacts,
    copySelection,
    pasteSelection,
    duplicateSelection,
    scaleSelection,
    rotateSelection,
    alignSelectionToGrid,
    canPaste,
    activeAxisRotateHandles,
    startAxisRotation,
    rotateAxisToPoint,
    endAxisRotation,
  } = useCanvasInteractions({
    tool,
    pages,
    strokesRef,
    updateCurrentPageStrokes,
    commitCurrentPageStrokes,
    commitCurrentPageHistory,
    currentPageIndex,
    selectPage,
    addPageBelowCurrent,
    removeCurrentPage,
    activeWidthRef,
    activeColorRef,
    activeAlphaRef,
    shapePreset,
    pageTemplate,
    snapToGrid,
    shapeSnapEnabled,
    gridStep: inferGridStep(pageTemplate),
    onTextPlacement: ({ pageIndex, point }) => {
      setPendingTextPoint({ pageIndex, x: point.x, y: point.y });
      setTextDraft("");
      setTool("text");
    },
    zoom,
    zoomRef,
    canvasSize,
    canvasSizeRef,
    isInfiniteCanvas,
    setBoardSize,
    minDistPx: MIN_DIST_PX,
    minPointsToSave: MIN_POINTS_TO_SAVE,
    strokeSmoothingAlpha: STROKE_SMOOTHING_ALPHA,
    infiniteEdgeTrigger: INFINITE_EDGE_TRIGGER,
    infiniteExpandX: INFINITE_EXPAND_X,
    infiniteExpandY: INFINITE_EXPAND_Y,
    onPerfEvent: handlePerfEvent,
  });

  const handleActivePageRender = useCallback((renderedStrokes: typeof strokes) => {
    perfRef.current = {
      ...perfRef.current,
      activePageRenders: perfRef.current.activePageRenders + 1,
    };
    acknowledgeActivePageRender(renderedStrokes);
  }, [acknowledgeActivePageRender]);

  const {
    saveState,
    saveError,
    recoveredFromDraft,
    retrySave,
    dismissRecoveredFromDraft,
  } = useNotePersistence({
    routeNoteId,
    router,
    isPointerDownRef: isPointerDown,
    pages,
    pageTextItems,
    pageBackgrounds,
    currentPageIndex,
    strokes,
    noteKind,
    boardSize,
    boardBackgroundStyle,
    metadata,
    emptyBackground: EMPTY_PAGE_BACKGROUND,
    resetCanvasState,
    setNoteKind,
    setBoardSize,
    setBoardBackgroundStyle,
    setMetadata,
    loadSnapshot,
  });
  const isAndroidInteractionMode =
    Platform.OS === "android" &&
    isInteracting &&
    (tool === "eraser" || tool === "lasso" || tool === "hand");
  const showTopChrome = !isAndroidInteractionMode;

  useEffect(() => {
    perfRef.current = {
      ...perfRef.current,
      strokeCount: strokes.length,
      pointCount: strokes.reduce((total, stroke) => total + stroke.points.length, 0),
    };
  }, [strokes]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    let frameId: number | null = null;
    let publishId: ReturnType<typeof setInterval> | null = null;
    let lastFrameAt = 0;

    const loop = (timestamp: number) => {
      if (lastFrameAt > 0) {
        perfRef.current = {
          ...perfRef.current,
          frameDurationMs: timestamp - lastFrameAt,
        };
      }
      lastFrameAt = timestamp;
      frameId = requestAnimationFrame(loop);
    };

    if (isInteracting) {
      frameId = requestAnimationFrame(loop);
      publishId = setInterval(() => {
        setPerfSnapshot({ ...perfRef.current });
      }, 250);
    } else {
      setPerfSnapshot({ ...perfRef.current });
    }

    return () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      if (publishId != null) clearInterval(publishId);
    };
  }, [isInteracting]);

  const handPanRef = useRef<{
    active: boolean;
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  }>({
    active: false,
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const applyZoomWithFocus = useCallback(
    (targetZoom: number, focusX?: number, focusY?: number) => {
      const nextZoom = clampZoom(targetZoom);
      const container = scrollContainerRef.current as any;
      const prevZoom = zoomRef.current;

      if (
        !container ||
        typeof container.scrollLeft !== "number" ||
        typeof container.scrollTop !== "number" ||
        focusX == null ||
        focusY == null
      ) {
        setZoom(nextZoom);
        return;
      }

      const contentX = (container.scrollLeft + focusX) / prevZoom;
      const contentY = (container.scrollTop + focusY) / prevZoom;

      setZoom(nextZoom);

      requestAnimationFrame(() => {
        container.scrollLeft = contentX * nextZoom - focusX;
        container.scrollTop = contentY * nextZoom - focusY;
      });
    },
    [clampZoom],
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const workspaceEl = workspaceRef.current as any;
    if (!workspaceEl?.addEventListener) return;

    const flushWheelZoom = () => {
      wheelZoomRafRef.current = null;
      const dy = wheelZoomAccumRef.current;
      const focus = wheelZoomFocusRef.current;
      wheelZoomAccumRef.current = 0;

      if (!Number.isFinite(dy) || dy === 0) return;

      applyZoomWithFocus(
        zoomRef.current * Math.exp((-dy * 0.0052)),
        focus?.x,
        focus?.y,
      );
    };

    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey) return;

      ev.preventDefault();

      const dy = Number(ev.deltaY ?? 0);
      if (!Number.isFinite(dy) || dy === 0) return;

      const rect = workspaceEl.getBoundingClientRect?.();
      if (
        rect &&
        typeof ev.clientX === "number" &&
        typeof ev.clientY === "number"
      ) {
        wheelZoomFocusRef.current = {
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
        };
      }

      wheelZoomAccumRef.current += dy;

      if (wheelZoomRafRef.current != null) return;
      wheelZoomRafRef.current = requestAnimationFrame(flushWheelZoom);
    };

    workspaceEl.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      workspaceEl.removeEventListener("wheel", onWheel);
      if (wheelZoomRafRef.current != null) {
        cancelAnimationFrame(wheelZoomRafRef.current);
        wheelZoomRafRef.current = null;
      }
      wheelZoomAccumRef.current = 0;
      wheelZoomFocusRef.current = null;
    };
  }, [applyZoomWithFocus]);

  useEffect(() => {
    if (Platform.OS !== "web" || tool !== "hand") return;
    const container = scrollContainerRef.current as any;
    if (!container?.addEventListener) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      handPanRef.current = {
        active: true,
        x: event.clientX,
        y: event.clientY,
        scrollLeft: container.scrollLeft ?? 0,
        scrollTop: container.scrollTop ?? 0,
      };
      container.style.cursor = "grabbing";
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!handPanRef.current.active) return;
      container.scrollLeft =
        handPanRef.current.scrollLeft - (event.clientX - handPanRef.current.x);
      container.scrollTop =
        handPanRef.current.scrollTop - (event.clientY - handPanRef.current.y);
      event.preventDefault();
    };

    const endPan = () => {
      handPanRef.current.active = false;
      container.style.cursor = "grab";
    };

    container.style.cursor = "grab";
    container.addEventListener("pointerdown", onPointerDown, { passive: false });
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown as any);
      window.removeEventListener("pointermove", onPointerMove as any);
      window.removeEventListener("pointerup", endPan);
      window.removeEventListener("pointercancel", endPan);
      container.style.cursor = "";
      handPanRef.current.active = false;
    };
  }, [tool]);

  const animateZoomTo = useCallback(
    (targetZoom: number) => {
      const container = scrollContainerRef.current as any;
      const focusX =
        container && typeof container.clientWidth === "number"
          ? container.clientWidth / 2
          : undefined;
      const focusY =
        container && typeof container.clientHeight === "number"
          ? container.clientHeight / 2
          : undefined;
      applyZoomWithFocus(clampZoom(quantizeZoom(targetZoom)), focusX, focusY);
    },
    [applyZoomWithFocus, clampZoom, quantizeZoom],
  );

  const exportAsPdf = async () => {
    try {
      const { exportNoteAsPdf } = await import("@/lib/editorExport");
      await exportNoteAsPdf({
        pages,
        pageBackgrounds,
        currentPageIndex,
        activePageStrokes: strokes,
        noteKind,
        pageWidth: canvasSize.width,
        pageHeight: canvasSize.height,
      });
      setExportFeedback({
        tone: "success",
        message:
          Platform.OS === "web"
            ? "PDF export opened the print dialog."
            : "PDF export is currently available on web.",
      });
    } catch (error: any) {
      setExportFeedback({
        tone: "error",
        message:
          typeof error?.message === "string" && error.message.trim()
            ? error.message.trim()
            : "Could not export this note as a PDF.",
      });
    }
  };

  const exportAsImage = async () => {
    if (Platform.OS !== "web") {
      setExportFeedback({
        tone: "error",
        message: "Image export is currently available on web.",
      });
      return;
    }

    try {
      const activeStrokes = pages[currentPageIndex] ?? strokes;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize.width}" height="${canvasSize.height}" viewBox="0 0 ${canvasSize.width} ${canvasSize.height}"><rect width="100%" height="100%" fill="#ffffff"/>${activeStrokes
        .map(
          (stroke) =>
            `<path d="${stroke.d}" stroke="${stroke.c}" stroke-opacity="${stroke.a ?? 1}" stroke-width="${stroke.w}" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(${stroke.dx} ${stroke.dy})" />`,
        )
        .join("")}</svg>`;
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      const popup = window.open(dataUrl, "_blank");
      if (!popup) {
        throw new Error("Popup blocked while opening image export.");
      }
      setExportFeedback({
        tone: "success",
        message: "Image export opened in a new tab.",
      });
    } catch (error: any) {
      setExportFeedback({
        tone: "error",
        message:
          typeof error?.message === "string" && error.message.trim()
            ? error.message.trim()
            : "Could not export this page as an image.",
      });
    }
  };

  const bookmarkedPages = metadata.bookmarkedPages ?? [];
  const toggleBookmark = useCallback((index: number) => {
    setMetadata((prev) => {
      const bookmarks = new Set(prev.bookmarkedPages ?? []);
      if (bookmarks.has(index)) bookmarks.delete(index);
      else bookmarks.add(index);
      return {
        ...prev,
        bookmarkedPages: [...bookmarks].sort((a, b) => a - b),
      };
    });
  }, []);

  const handleAddPage = useCallback(() => {
    const insertAt = currentPageIndex + 1;
    setMetadata((prev) => ({
      ...prev,
      bookmarkedPages: (prev.bookmarkedPages ?? []).map((pageIndex) =>
        pageIndex >= insertAt ? pageIndex + 1 : pageIndex,
      ),
    }));
    handleAddPageBelowCurrent();
  }, [currentPageIndex, handleAddPageBelowCurrent]);

  const handleRemovePage = useCallback(() => {
    setMetadata((prev) => ({
      ...prev,
      bookmarkedPages: (prev.bookmarkedPages ?? [])
        .filter((pageIndex) => pageIndex !== currentPageIndex)
        .map((pageIndex) =>
          pageIndex > currentPageIndex ? pageIndex - 1 : pageIndex,
        ),
    }));
    handleRemoveCurrentPage();
  }, [currentPageIndex, handleRemoveCurrentPage]);

  const handleMovePage = useCallback(
    (from: number, delta: -1 | 1) => {
      const to = from + delta;
      setMetadata((prev) => ({
        ...prev,
        bookmarkedPages: (prev.bookmarkedPages ?? []).map((pageIndex) => {
          if (pageIndex === from) return to;
          if (delta === 1 && pageIndex > from && pageIndex <= to) return pageIndex - 1;
          if (delta === -1 && pageIndex < from && pageIndex >= to) return pageIndex + 1;
          return pageIndex;
        }),
      }));
      movePage(from, delta);
    },
    [movePage],
  );
  const commitTextPlacement = useCallback(
    (value?: string) => {
      const text = (value ?? textDraft).trim();
      if (!pendingTextPoint || !text) {
        setPendingTextPoint(null);
        setTextDraft("");
        return;
      }
      const nextItem: NoteTextItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text,
        x: pendingTextPoint.x,
        y: pendingTextPoint.y,
        color: penColor,
        fontSize: 18,
      };
      setPageTextItems((prev) => {
        const next = prev.length > 0 ? prev.map((items) => items.slice()) : [[]];
        while (next.length <= pendingTextPoint.pageIndex) next.push([]);
        next[pendingTextPoint.pageIndex] = [
          ...(next[pendingTextPoint.pageIndex] ?? []),
          nextItem,
        ];
        return next;
      });
      setPendingTextPoint(null);
      setTextDraft("");
    },
    [penColor, pendingTextPoint, setPageTextItems, textDraft],
  );
  const moveTextItem = useCallback(
    (pageIndex: number, itemId: string, point: { x: number; y: number }) => {
      setPageTextItems((prev) => {
        const next = prev.length > 0 ? prev.map((items) => items.slice()) : [[]];
        while (next.length <= pageIndex) next.push([]);
        next[pageIndex] = (next[pageIndex] ?? []).map((item) =>
          item.id === itemId ? { ...item, x: point.x, y: point.y } : item,
        );
        return next;
      });
    },
    [setPageTextItems],
  );
  const selectionMenu = useMemo(() => {
    if (selectedIds.length === 0) return null;
    return (
      <View
        style={{
          minWidth: 126,
          borderRadius: 16,
          padding: 8,
          gap: 6,
          backgroundColor: "rgba(255,249,241,0.96)",
          borderWidth: 1,
          borderColor: TOPBAR_BORDER,
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          boxShadow: "0 14px 28px rgba(56,42,26,0.14)",
        }}
      >
        <Pressable onPress={copySelection} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>Copy</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (canPaste) pasteSelection();
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 8, opacity: canPaste ? 1 : 0.45 }}
        >
          <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>Paste</Text>
        </Pressable>
        <Pressable onPress={duplicateSelection} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>Duplicate</Text>
        </Pressable>
        <Pressable onPress={() => scaleSelection(1.1)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>Resize +</Text>
        </Pressable>
        <Pressable onPress={() => scaleSelection(0.92)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>Resize -</Text>
        </Pressable>
        <Pressable onPress={alignSelectionToGrid} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>Snap Align</Text>
        </Pressable>
        <Pressable onPress={() => rotateSelection(-12)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>Rotate Left</Text>
        </Pressable>
        <Pressable onPress={() => rotateSelection(12)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>Rotate Right</Text>
        </Pressable>
        <Pressable onPress={deleteSelection} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ color: STUDIO.danger, fontWeight: "900" }}>Delete</Text>
        </Pressable>
      </View>
    );
  }, [
    canPaste,
    copySelection,
    deleteSelection,
    duplicateSelection,
    pasteSelection,
    rotateSelection,
    scaleSelection,
    alignSelectionToGrid,
    selectedIds.length,
  ]);

  return (
    <View
      style={{ flex: 1, backgroundColor: WORKSPACE_BG }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setContainerSize({ w: width, h: height });
        // keep toolbar in view if container changes (rotate / resize)
        setToolbarPos((p) => {
          const next = clampToolbarPos(p.x, p.y);
          return next;
        });
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: WORKSPACE_BG,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -120,
          left: -60,
          width: 280,
          height: 280,
          borderRadius: 999,
          backgroundColor: "rgba(154,92,55,0.08)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: -80,
          bottom: 80,
          width: 320,
          height: 320,
          borderRadius: 999,
          backgroundColor: "rgba(35,52,70,0.08)",
        }}
      />
      {showTopChrome ? (
        <>
          <Pressable
            onPress={() => {
              router.push("/(tabs)/explore");
            }}
            onLayout={(e) => {
              setBackButtonWidth(e.nativeEvent.layout.width);
            }}
            style={{
              position: "absolute",
              left: BACK_BUTTON_LEFT,
              top: topChromeTop,
              zIndex: 70,
              height: 42,
              paddingHorizontal: 16,
              borderRadius: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: "rgba(255,249,241,0.84)",
              borderWidth: 1,
              borderColor: TOPBAR_BORDER,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              boxShadow: "0 12px 28px rgba(56,42,26,0.12)",
              backdropFilter: "blur(12px)",
            }}
          >
            <ChevronLeft size={18} color={STUDIO.ink} />
            <View>
              <Text style={{ color: STUDIO.accentWarm, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" }}>Library</Text>
              <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>Back</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              if (recoveredFromDraft) {
                dismissRecoveredFromDraft();
                return;
              }
              if (saveState === "error") {
                retrySave();
              }
            }}
            disabled={!recoveredFromDraft && saveState !== "error"}
            style={{
              position: "absolute",
              right: 14,
              top: topChromeTop,
              zIndex: 70,
              minHeight: 42,
              maxWidth: 240,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 18,
              justifyContent: "center",
              backgroundColor:
                saveState === "error"
                  ? "rgba(156,67,52,0.96)"
                  : recoveredFromDraft
                    ? "rgba(154,92,55,0.94)"
                    : "rgba(255,249,241,0.84)",
              borderWidth: 1,
              borderColor:
                saveState === "error"
                  ? "rgba(127,29,29,0.22)"
                  : recoveredFromDraft
                    ? "rgba(146,64,14,0.16)"
                    : TOPBAR_BORDER,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              boxShadow: "0 12px 28px rgba(56,42,26,0.12)",
              backdropFilter: "blur(12px)",
            }}
          >
            <Text
              style={{
                color:
                  saveState === "error" ? "#FFF8F3" : recoveredFromDraft ? "#7C2D12" : STUDIO.ink,
                fontWeight: "900",
                fontSize: 12,
              }}
            >
              {formatSaveLabel(saveState, recoveredFromDraft)}
            </Text>
            {saveState === "error" && saveError ? (
              <Text style={{ color: "rgba(255,255,255,0.92)", marginTop: 2, fontSize: 11 }}>
                Tap to retry
              </Text>
            ) : recoveredFromDraft ? (
              <Text style={{ color: "#92400E", marginTop: 2, fontSize: 11 }}>
                Tap to dismiss
              </Text>
            ) : null}
          </Pressable>

          {exportFeedback.message ? (
            <View
              style={{
                position: "absolute",
                right: 14,
                top: topChromeTop + 58,
                zIndex: 70,
                maxWidth: 260,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 18,
                backgroundColor:
                  exportFeedback.tone === "error"
                    ? "rgba(156,67,52,0.94)"
                    : "rgba(62,107,76,0.92)",
                borderWidth: 1,
                borderColor:
                  exportFeedback.tone === "error"
                    ? "rgba(127,29,29,0.26)"
                    : "rgba(21,128,61,0.24)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>
                {exportFeedback.message}
              </Text>
            </View>
          ) : null}

          <View
            style={{
              position: "absolute",
              right: 14,
              top: exportFeedback.message ? topChromeTop + 118 : topChromeTop + 58,
              zIndex: 70,
              borderRadius: 18,
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 8,
              backgroundColor: "rgba(255,249,241,0.88)",
              borderWidth: 1,
              borderColor: TOPBAR_BORDER,
            }}
          >
            <Pressable onPress={() => setSnapToGrid((value) => !value)}>
              <Text style={{ color: STUDIO.ink, fontWeight: "800", fontSize: 12 }}>
                Grid snap: {snapToGrid ? "On" : "Off"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setShapeSnapEnabled((value) => !value)}>
              <Text style={{ color: STUDIO.ink, fontWeight: "800", fontSize: 12 }}>
                Shape snap: {shapeSnapEnabled ? "On" : "Off"}
              </Text>
            </Pressable>
          </View>

          <FloatingToolbar
            toolbarPos={toolbarPos}
            floatingStyle={floatingToolbarStyle}
            toolbarOrientation={toolbarOrientation}
            penColor={penColor}
            tool={tool}
            navLabel={isInfiniteCanvas ? "Board" : "Pages"}
            navSubLabel={
              isInfiniteCanvas
                ? boardBackgroundStyle[0].toUpperCase() +
                  boardBackgroundStyle.slice(1)
                : `${currentPageIndex + 1}/${Math.max(1, pages.length)}`
            }
            selectedCount={selectedIds.length}
            zoom={zoom}
            historyIndex={historyIndex}
            historyLength={history.length}
            onToolbarLayout={(size) => {
              setToolbarSize(size);
              setToolbarPos((p) => clampToolbarPos(p.x, p.y));
            }}
            toolbarHandleGesture={toolbarHandleGesture}
            onPenPress={() => {
              if (tool === "pen") {
                setSizeModalTool("pen");
                setIsSizeModalOpen(true);
              } else {
                setTool("pen");
                clearPenModeArtifacts();
              }
            }}
            onHighlighterPress={() => {
              if (tool === "highlighter") {
                setSizeModalTool("highlighter");
                setIsSizeModalOpen(true);
              } else {
                setTool("highlighter");
                clearPenModeArtifacts();
              }
            }}
            onShapePress={() => {
              if (tool === "shape") {
                setIsShapeModalOpen(true);
              } else {
                setTool("shape");
                clearPenModeArtifacts();
              }
            }}
            onTextPress={() => {
              setTool("text");
              clearPenModeArtifacts();
            }}
            onEraserPress={() => {
              if (tool === "eraser") {
                setSizeModalTool("eraser");
                setIsSizeModalOpen(true);
              } else {
                setTool("eraser");
                clearEraserModeArtifacts();
              }
            }}
            onLassoPress={() => {
              setTool("lasso");
              clearLassoModeArtifacts();
            }}
            onHandPress={() => {
              setTool("hand");
              clearLassoModeArtifacts();
            }}
            onColorPress={() => setIsColorModalOpen(true)}
            onPagesPress={() =>
              isInfiniteCanvas
                ? setIsBoardBackgroundModalOpen(true)
                : setIsPagesModalOpen(true)
            }
            onExportPdf={exportAsPdf}
            onExportImage={exportAsImage}
            onZoomOut={() => animateZoomTo(zoom - 0.01)}
            onZoomReset={() => animateZoomTo(1)}
            onZoomIn={() => animateZoomTo(zoom + 0.01)}
            onUndo={undo}
            onRedo={redo}
          />
        </>
      ) : null}

      {Platform.OS === "android" ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 14,
            bottom: insets.bottom + 12,
            zIndex: 70,
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: "rgba(35,52,70,0.88)",
          }}
        >
          <Text style={{ color: "#FFF9F2", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" }}>
            Perf
          </Text>
          <Text style={{ color: "#FFF9F2", fontSize: 11, marginTop: 4 }}>
            {`strokes ${perfSnapshot.strokeCount}  points ${perfSnapshot.pointCount}`}
          </Text>
          <Text style={{ color: "#FFF9F2", fontSize: 11, marginTop: 2 }}>
            {`frame ${perfSnapshot.frameDurationMs.toFixed(1)}ms  erase ${perfSnapshot.eraseBatchSize}`}
          </Text>
          <Text style={{ color: "#FFF9F2", fontSize: 11, marginTop: 2 }}>
            {`candidates ${perfSnapshot.eraseCandidateCount}  dirty ${Math.round(perfSnapshot.dirtyRectArea)}`}
          </Text>
          <Text style={{ color: "#FFF9F2", fontSize: 11, marginTop: 2 }}>
            {`active renders ${perfSnapshot.activePageRenders}  mode ${isAndroidInteractionMode ? "interaction" : "idle"}`}
          </Text>
        </View>
      ) : null}

      {/* Workspace */}
      <View
        ref={scrollContainerRef}
        style={
          Platform.OS === "web"
            ? ({
                flex: 1,
                backgroundColor: WORKSPACE_BG,
                overflow: "auto",
              } as any)
            : { flex: 1, backgroundColor: WORKSPACE_BG }
        }
      >
        <View
          ref={workspaceRef}
          style={
            Platform.OS === "web"
              ? ({
                  minHeight: "100%",
                  minWidth: "100%",
                  padding: 24,
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: isInfiniteCanvas ? "flex-start" : "center",
                  gap: 26,
                } as any)
              : {
                  minHeight: "100%",
                  padding: 24,
                  justifyContent: "flex-start",
                  alignItems: isInfiniteCanvas ? "flex-start" : "center",
                  gap: 26,
                }
          }
        >
          {pages.map((pageStrokes, pageIndex) => {
            const pageIsActive = pageIndex === currentPageIndex;
            const renderStrokes = pageIsActive ? strokes : pageStrokes;
            const pageBackground = pageBackgrounds[pageIndex] ?? {
              ...EMPTY_PAGE_BACKGROUND,
            };
            const textItems = pageTextItems[pageIndex] ?? [];
            return (
              <PageCanvas
                key={`page-${pageIndex}`}
                zoom={zoom}
                pageIndex={pageIndex}
                pageIsActive={pageIsActive}
                noteKind={noteKind}
                pageWidth={canvasSize.width}
                pageHeight={canvasSize.height}
                boardBackgroundStyle={boardBackgroundStyle}
                pageTemplate={pageTemplate}
                pageBackground={pageBackground}
                renderStrokes={renderStrokes}
                textItems={textItems}
                selectedSet={pageIsActive ? selectedSet : EMPTY_SELECTED_SET}
                selectionPreviewOffset={
                  pageIsActive ? selectionPreviewOffset : ZERO_SELECTION_OFFSET
                }
                selectionBounds={pageIsActive ? selectionBounds : null}
                selectionMenu={
                  pageIsActive && !isAndroidInteractionMode ? selectionMenu : null
                }
                currentPath={pageIsActive ? currentPath : ""}
                activeColor={activeColor}
                activeWidth={activeWidth}
                activeOpacity={activeOpacity}
                lassoPath={pageIsActive ? lassoPath : ""}
                tool={tool}
                eraserCursor={pageIsActive ? eraserCursor : null}
                eraserRadius={eraserRadius}
                pageHandlers={pageHandlersByPage[pageIndex]}
                textMoveEnabled={tool === "text" || tool === "hand"}
                onMoveTextItem={(itemId, point) =>
                  moveTextItem(pageIndex, itemId, point)
                }
                axisRotateHandles={pageIsActive ? activeAxisRotateHandles : null}
                onAxisRotateStart={(axisRole) => {
                  const handle = activeAxisRotateHandles?.find(
                    (item) => item.axisRole === axisRole,
                  );
                  if (handle) startAxisRotation(handle);
                }}
                onAxisRotate={rotateAxisToPoint}
                onAxisRotateEnd={endAxisRotation}
                hideInteractiveOverlays={isAndroidInteractionMode}
                onActivePageRender={handleActivePageRender}
                livePreviewStateRef={livePreviewStateRef}
                nativeStrokePreview={nativeStrokePreview}
              />
            );
          })}
        </View>
      </View>

      {/* Toolbar mode modal (opened by double-tap on 3-dot handle) */}
      <ToolbarLayoutModal
        visible={isToolbarModeOpen}
        toolbarOrientation={toolbarOrientation}
        onClose={() => setIsToolbarModeOpen(false)}
        onSelectOrientation={(orientation) => {
          setToolbarOrientation(orientation);
          setIsToolbarModeOpen(false);
        }}
      />

      {/* Pages modal */}
      {!isInfiniteCanvas ? (
        <PagesModal
          visible={isPagesModalOpen}
          pages={pages}
          currentPageIndex={currentPageIndex}
          onClose={() => setIsPagesModalOpen(false)}
          onAddPage={handleAddPage}
          onRemovePage={handleRemovePage}
          onSelectPage={handleSelectPage}
          onMovePage={handleMovePage}
          bookmarkedPages={bookmarkedPages}
          onToggleBookmark={toggleBookmark}
          pageTemplate={pageTemplate}
          onSetPageTemplate={setPageTemplate}
          pageSizePreset={pageSizePreset}
          onSetPageSizePreset={setPageSizePreset}
        />
      ) : null}

      <BoardBackgroundModal
        visible={isBoardBackgroundModalOpen}
        value={boardBackgroundStyle}
        onClose={() => setIsBoardBackgroundModalOpen(false)}
        onSelect={(value) => {
          setBoardBackgroundStyle(value);
          setBoardSize((prev) =>
            prev ? { ...prev, backgroundStyle: value } : prev,
          );
          setIsBoardBackgroundModalOpen(false);
        }}
      />

      {/* Size modal */}
      <SizeModal
        visible={isSizeModalOpen}
        sizeModalTool={sizeModalTool}
        sizeOptions={
          sizeModalTool === "highlighter"
            ? HIGHLIGHTER_SIZE_OPTIONS
            : SIZE_OPTIONS
        }
        penSizeIndex={penSizeIndex}
        highlighterSizeIndex={highlighterSizeIndex}
        eraserSizeIndex={eraserSizeIndex}
        eraserMultiplier={ERASER_MULT}
        onClose={() => setIsSizeModalOpen(false)}
        onSelectPenSize={setPenSizeIndex}
        onSelectHighlighterSize={setHighlighterSizeIndex}
        onSelectEraserSize={setEraserSizeIndex}
      />

      <ShapeModal
        visible={isShapeModalOpen}
        value={shapePreset}
        onClose={() => setIsShapeModalOpen(false)}
        onSelect={(value) => {
          setShapePreset(value);
          setTool("shape");
        }}
      />

      {/* Color modal (Hue slider + slots) */}
      <ColorModal
        visible={isColorModalOpen}
        hue={hue}
        penColor={penColor}
        colorSlots={colorSlots}
        activeSlotIndex={activeSlotIndex}
        tool={tool}
        onClose={() => setIsColorModalOpen(false)}
        onHueChange={(nextHue, nextColor) => {
          setHue(nextHue);
          setPenColor(nextColor);
          setActiveSlotIndex(null);
        }}
        onActivatePenTool={() => setTool("pen")}
        onSetPenColor={setPenColor}
        onSetColorSlots={setColorSlots}
        onSetActiveSlotIndex={setActiveSlotIndex}
      />

      {pendingTextPoint ? (
        <View
          style={{
            position: "absolute",
            left: 40,
            right: 40,
            bottom: insets.bottom + 12,
            zIndex: 90,
            borderRadius: 18,
            padding: 12,
            gap: 8,
            backgroundColor: "rgba(255,249,241,0.96)",
            borderWidth: 1,
            borderColor: TOPBAR_BORDER,
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <Text style={{ color: STUDIO.accentWarm, fontWeight: "900", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
            Label
          </Text>
          <TextInput
            value={textDraft}
            onChangeText={setTextDraft}
            placeholder="Type a label"
            placeholderTextColor="rgba(30,35,41,0.42)"
            autoFocus
            style={{
              height: 44,
              borderRadius: 14,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: STUDIO.line,
              backgroundColor: "rgba(255,255,255,0.84)",
              color: STUDIO.ink,
              fontWeight: "700",
            }}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => {
                setPendingTextPoint(null);
                setTextDraft("");
              }}
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: STUDIO.line,
                backgroundColor: "rgba(255,249,241,0.66)",
              }}
            >
              <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => commitTextPlacement()}
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,248,239,0.18)",
                backgroundColor: STUDIO.accent,
              }}
            >
              <Text style={{ color: "#FFF9F2", fontWeight: "900" }}>Place Label</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}




