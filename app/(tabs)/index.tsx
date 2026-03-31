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
import { PageCanvas } from "@/components/editor/PageCanvas";
import { ColorModal } from "@/components/editor/modals/ColorModal";
import { BoardBackgroundModal } from "@/components/editor/modals/BoardBackgroundModal";
import { PagesModal } from "@/components/editor/modals/PagesModal";
import { SizeModal } from "@/components/editor/modals/SizeModal";
import { ToolbarLayoutModal } from "@/components/editor/modals/ToolbarLayoutModal";
import { useCanvasInteractions } from "@/hooks/useCanvasInteractions";
import { useEditorPageState } from "@/hooks/useEditorPageState";
import { useNotePersistence } from "@/hooks/useNotePersistence";
import { exportNoteAsPdf } from "@/lib/editorExport";
import { getCanvasSize } from "@/lib/editorGeometry";
import type {
  InfiniteBoard,
  InfiniteBoardBackgroundStyle,
  NoteKind,
} from "@/lib/noteDocument";
import { EMPTY_PAGE_BACKGROUND } from "@/lib/editorTypes";
import { PanResponder, Platform, Pressable, Text, View } from "react-native";

// Theme
const WORKSPACE_BG = "#ECEDEF";
const TOPBAR_BORDER = "rgba(22,26,33,0.12)";

const PAGE_BG = "#ffffff";
const TOOLBAR_MIN_TOP = 72;

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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeNoteId(x: unknown): string | null {
  if (typeof x === "string" && x.trim()) return x;
  if (Array.isArray(x) && typeof x[0] === "string" && x[0].trim()) return x[0];
  return null;
}

export default function Index() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeNoteId = normalizeNoteId((params as any)?.noteId);

  // Tool
  const [tool, setTool] = useState<"pen" | "eraser" | "lasso">("pen");

  // Toolbar drag + orientation
  const [toolbarOrientation, setToolbarOrientation] = useState<
    "horizontal" | "vertical"
  >("vertical");
  const [isToolbarModeOpen, setIsToolbarModeOpen] = useState(false);

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [toolbarSize, setToolbarSize] = useState({ w: 0, h: 0 });

  // toolbar position (absolute)
  const [toolbarPos, setToolbarPos] = useState({ x: 12, y: 72 });

  const toolbarPosRef = useRef(toolbarPos);
  useEffect(() => {
    toolbarPosRef.current = toolbarPos;
  }, [toolbarPos]);

  // double-tap on the 3-dot handle
  const lastHandleTapMs = useRef<number>(0);
  const movedDuringDrag = useRef(false);
  const toolbarDragStart = useRef<{ x: number; y: number } | null>(null);

  // Tool sizes (separate pen/eraser)
  const [penSizeIndex, setPenSizeIndex] = useState(0);
  const [eraserSizeIndex, setEraserSizeIndex] = useState(2);
  const penWidth = SIZE_OPTIONS[penSizeIndex].width;
  const eraserWidth = SIZE_OPTIONS[eraserSizeIndex].width * ERASER_MULT;
  const [isSizeModalOpen, setIsSizeModalOpen] = useState(false);
  const [sizeModalTool, setSizeModalTool] = useState<"pen" | "eraser">("pen");
  const lastPenTapMs = useRef(0);
  const lastEraserTapMs = useRef(0);

  // Pen color
  const [hue, setHue] = useState(0);
  const [penColor, setPenColor] = useState<string>("#111111");
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);

  // Saved slots
  const [colorSlots, setColorSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [isPagesModalOpen, setIsPagesModalOpen] = useState(false);

  // Effective settings depend on tool
  const activeColor = tool === "eraser" ? PAGE_BG : penColor;
  const activeWidth = tool === "eraser" ? eraserWidth : penWidth;
  const eraserRadius = activeWidth / 2;

  // Option B refs (latest brush settings)
  const activeColorRef = useRef(activeColor);
  const activeWidthRef = useRef(activeWidth);
  useEffect(() => {
    activeColorRef.current = activeColor;
    activeWidthRef.current = activeWidth;
  }, [activeColor, activeWidth]);

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
    () => boardSize ?? getCanvasSize(noteKind),
    [boardSize, noteKind],
  );
  const isInfiniteCanvas = noteKind === "infinite";
  const [isBoardBackgroundModalOpen, setIsBoardBackgroundModalOpen] =
    useState(false);
  const scrollContainerRef = useRef<any>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Strokes + current stroke
  const {
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
    selectPage,
    addPageBelowCurrent,
    removeCurrentPage,
    movePage,
  } = useEditorPageState({
    emptyBackground: EMPTY_PAGE_BACKGROUND,
  });
  const canvasSizeRef = useRef(canvasSize);

  // ---- Toolbar constraints
  const clampToolbarPos = (x: number, y: number) => {
    const maxX = Math.max(0, containerSize.w - toolbarSize.w);
    const maxY = Math.max(0, containerSize.h - toolbarSize.h);
    return {
      x: clamp(x, 0, maxX),
      y: clamp(y, TOOLBAR_MIN_TOP, maxY),
    };
  };

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
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  // ---- Toolbar drag handle PanResponder (drag only on 3-dot handle)
  const handlePanResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        movedDuringDrag.current = false;
        toolbarDragStart.current = toolbarPosRef.current;
      },

      onPanResponderMove: (_evt, gesture) => {
        // gesture.dx/dy are cumulative from grant
        if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3) {
          movedDuringDrag.current = true;
        }

        const base = toolbarDragStart.current ?? toolbarPosRef.current;
        const next = clampToolbarPos(base.x + gesture.dx, base.y + gesture.dy);
        setToolbarPos(next);
      },

      onPanResponderRelease: () => {
        // If it wasn't a drag, treat as tap (for double-tap)
        if (!movedDuringDrag.current) {
          const now = Date.now();
          if (now - lastHandleTapMs.current < 280) {
            setIsToolbarModeOpen(true);
          }
          lastHandleTapMs.current = now;
        }
        toolbarDragStart.current = null;
      },
      onPanResponderTerminate: () => {
        toolbarDragStart.current = null;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.w, containerSize.h, toolbarSize.w, toolbarSize.h]);

  const {
    currentPath,
    eraserCursor,
    lassoPath,
    selectedIds,
    selectedSet,
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
  } = useCanvasInteractions({
    tool,
    pages,
    strokesRef,
    setStrokes,
    pushHistory,
    currentPageIndex,
    selectPage,
    addPageBelowCurrent,
    removeCurrentPage,
    activeWidthRef,
    activeColorRef,
    zoomRef,
    canvasSizeRef,
    isInfiniteCanvas,
    setBoardSize,
    minDistPx: MIN_DIST_PX,
    minPointsToSave: MIN_POINTS_TO_SAVE,
    strokeSmoothingAlpha: STROKE_SMOOTHING_ALPHA,
    infiniteEdgeTrigger: INFINITE_EDGE_TRIGGER,
    infiniteExpandX: INFINITE_EXPAND_X,
    infiniteExpandY: INFINITE_EXPAND_Y,
  });

  useNotePersistence({
    routeNoteId,
    router,
    isPointerDownRef: isPointerDown,
    pages,
    pageBackgrounds,
    currentPageIndex,
    strokes,
    noteKind,
    boardSize,
    boardBackgroundStyle,
    emptyBackground: EMPTY_PAGE_BACKGROUND,
    resetCanvasState,
    setNoteKind,
    setBoardSize,
    setBoardBackgroundStyle,
    setPages,
    setPageBackgrounds,
    setCurrentPageIndex,
    setStrokes,
    setHistory,
    setHistoryIndex,
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

  const exportAsPdf = () => {
    exportNoteAsPdf({
      pages,
      pageBackgrounds,
      currentPageIndex,
      activePageStrokes: strokes,
      noteKind,
      pageWidth: canvasSize.width,
      pageHeight: canvasSize.height,
    });
  };

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
      <Pressable
        onPress={() => {
          router.push("/(tabs)/explore");
        }}
        style={{
          position: "absolute",
          left: 14,
          top: 14,
          zIndex: 70,
          height: 42,
          paddingHorizontal: 14,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: "rgba(255,255,255,0.94)",
          borderWidth: 1,
          borderColor: TOPBAR_BORDER,
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
          backdropFilter: "blur(4px)",
        }}
      >
        <ChevronLeft size={18} color="#121826" />
        <Text style={{ color: "#121826", fontWeight: "900" }}>Back</Text>
      </Pressable>

      {/* Floating, draggable toolbar */}
      <FloatingToolbar
        toolbarPos={toolbarPos}
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
        handlePanHandlers={handlePanResponder.panHandlers}
        onPenPress={() => {
          const now = Date.now();
          if (now - lastPenTapMs.current < 280) {
            setTool("pen");
            setSizeModalTool("pen");
            setIsSizeModalOpen(true);
          } else {
            setTool("pen");
            clearPenModeArtifacts();
          }
          lastPenTapMs.current = now;
        }}
        onEraserPress={() => {
          const now = Date.now();
          if (now - lastEraserTapMs.current < 280) {
            setTool("eraser");
            setSizeModalTool("eraser");
            setIsSizeModalOpen(true);
          } else {
            setTool("eraser");
            clearEraserModeArtifacts();
          }
          lastEraserTapMs.current = now;
        }}
        onLassoPress={() => {
          setTool("lasso");
          clearLassoModeArtifacts();
        }}
        onColorPress={() => setIsColorModalOpen(true)}
        onPagesPress={() =>
          isInfiniteCanvas
            ? setIsBoardBackgroundModalOpen(true)
            : setIsPagesModalOpen(true)
        }
        onExportPdf={exportAsPdf}
        onDeleteSelection={deleteSelection}
        onZoomOut={() => animateZoomTo(zoom - 0.01)}
        onZoomReset={() => animateZoomTo(1)}
        onZoomIn={() => animateZoomTo(zoom + 0.01)}
        onUndo={undo}
        onRedo={redo}
      />

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
                pageBackground={pageBackground}
                renderStrokes={renderStrokes}
                selectedSet={pageIsActive ? selectedSet : EMPTY_SELECTED_SET}
                currentPath={pageIsActive ? currentPath : ""}
                activeColor={activeColor}
                activeWidth={activeWidth}
                lassoPath={pageIsActive ? lassoPath : ""}
                tool={tool}
                eraserCursor={pageIsActive ? eraserCursor : null}
                eraserRadius={eraserRadius}
                pageHandlers={pageHandlersByPage[pageIndex]}
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
          onAddPage={handleAddPageBelowCurrent}
          onRemovePage={handleRemoveCurrentPage}
          onSelectPage={handleSelectPage}
          onMovePage={movePage}
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
        sizeOptions={SIZE_OPTIONS}
        penSizeIndex={penSizeIndex}
        eraserSizeIndex={eraserSizeIndex}
        eraserMultiplier={ERASER_MULT}
        onClose={() => setIsSizeModalOpen(false)}
        onSelectPenSize={setPenSizeIndex}
        onSelectEraserSize={setEraserSizeIndex}
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
    </View>
  );
}
