import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import {
  bboxOverlap,
  computeBBox,
  dist,
  getCanvasSize,
  lerpPoint,
  pointInPoly,
  pointsToSmoothPath,
  smoothTowards,
  splitStrokeByEraserPathPoints,
  uid,
} from "@/lib/editorGeometry";
import type { Point, Stroke } from "@/lib/editorTypes";
import type { InfiniteBoard } from "@/lib/noteDocument";

type Tool = "pen" | "eraser" | "lasso";

type UseCanvasInteractionsArgs = {
  tool: Tool;
  pages: Stroke[][];
  strokesRef: React.RefObject<Stroke[]>;
  updateCurrentPageStrokes: (
    next: Stroke[] | ((prev: Stroke[]) => Stroke[]),
  ) => Stroke[];
  commitCurrentPageStrokes: (
    next: Stroke[] | ((prev: Stroke[]) => Stroke[]),
  ) => Stroke[];
  commitCurrentPageHistory: (snapshot?: Stroke[]) => void;
  currentPageIndex: number;
  selectPage: (index: number, beforeSwitch: () => void) => void;
  addPageBelowCurrent: (beforeSwitch: () => void) => void;
  removeCurrentPage: (beforeSwitch: () => void) => void;
  activeWidthRef: React.RefObject<number>;
  activeColorRef: React.RefObject<string>;
  zoomRef: React.RefObject<number>;
  canvasSizeRef: React.RefObject<{ width: number; height: number }>;
  isInfiniteCanvas: boolean;
  setBoardSize: React.Dispatch<React.SetStateAction<InfiniteBoard | null>>;
  minDistPx: number;
  minPointsToSave: number;
  strokeSmoothingAlpha: number;
  infiniteEdgeTrigger: number;
  infiniteExpandX: number;
  infiniteExpandY: number;
};

const EMPTY_SELECTION = new Set<string>();

export function useCanvasInteractions({
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
  zoomRef,
  canvasSizeRef,
  isInfiniteCanvas,
  setBoardSize,
  minDistPx,
  minPointsToSave,
  strokeSmoothingAlpha,
  infiniteEdgeTrigger,
  infiniteExpandX,
  infiniteExpandY,
}: UseCanvasInteractionsArgs) {
  const [currentPath, setCurrentPath] = useState("");
  const [eraserCursor, setEraserCursor] = useState<Point | null>(null);
  const [lassoPath, setLassoPath] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(
    () => (selectedIds.length > 0 ? new Set(selectedIds) : EMPTY_SELECTION),
    [selectedIds],
  );

  const toolRef = useRef(tool);
  const currentPageIndexRef = useRef(currentPageIndex);
  const selectedIdsRef = useRef(selectedIds);
  const selectedSetRef = useRef(selectedSet);
  const isInfiniteCanvasRef = useRef(isInfiniteCanvas);

  const isPointerDown = useRef(false);
  const pointerPageIndex = useRef<number | null>(null);
  const currentPoints = useRef<Point[]>([]);
  const currentPathDraft = useRef("");
  const rafId = useRef<number | null>(null);
  const pending = useRef(false);

  const lastEraserPoint = useRef<Point | null>(null);
  const eraserDidMutate = useRef(false);
  const queuedEraserPoints = useRef<Point[]>([]);
  const eraserRafId = useRef<number | null>(null);
  const eraserCursorDraft = useRef<Point | null>(null);
  const eraserCursorRenderRaf = useRef<number | null>(null);
  const eraserCursorPending = useRef(false);

  const lassoPoints = useRef<Point[]>([]);
  const lassoPathDraft = useRef("");
  const lassoRenderRaf = useRef<number | null>(null);
  const lassoPending = useRef(false);

  const isMovingSelection = useRef(false);
  const moveStart = useRef<Point | null>(null);
  const moveBase = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const moveDidMutate = useRef(false);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
    selectedSetRef.current = selectedSet;
  }, [selectedIds, selectedSet]);

  useEffect(() => {
    isInfiniteCanvasRef.current = isInfiniteCanvas;
  }, [isInfiniteCanvas]);

  const ensureInfiniteCanvasRoom = useCallback(
    (point: Point) => {
      if (!isInfiniteCanvasRef.current) return;

      setBoardSize((prev) => {
        const current = prev ?? getCanvasSize("infinite");
        let nextWidth = current.width;
        let nextHeight = current.height;

        if (point.x >= current.width - infiniteEdgeTrigger) {
          nextWidth = Math.max(
            current.width + infiniteExpandX,
            Math.ceil(point.x + infiniteEdgeTrigger),
          );
        }
        if (point.y >= current.height - infiniteEdgeTrigger) {
          nextHeight = Math.max(
            current.height + infiniteExpandY,
            Math.ceil(point.y + infiniteEdgeTrigger),
          );
        }

        if (nextWidth === current.width && nextHeight === current.height) {
          return current;
        }

        return {
          ...current,
          width: nextWidth,
          height: nextHeight,
        };
      });
    },
    [infiniteEdgeTrigger, infiniteExpandX, infiniteExpandY, setBoardSize],
  );

  const recomputePath = useCallback(() => {
    if (pending.current) return;

    if (typeof requestAnimationFrame !== "function") {
      setCurrentPath(currentPathDraft.current);
      return;
    }

    pending.current = true;
    rafId.current = requestAnimationFrame(() => {
      pending.current = false;
      setCurrentPath(currentPathDraft.current);
    });
  }, []);

  const commitEraserCursor = useCallback((point: Point | null, immediate = false) => {
    eraserCursorDraft.current = point;

    if (immediate) {
      if (eraserCursorRenderRaf.current != null) {
        cancelAnimationFrame(eraserCursorRenderRaf.current);
        eraserCursorRenderRaf.current = null;
      }
      eraserCursorPending.current = false;
      setEraserCursor(point);
      return;
    }

    if (eraserCursorPending.current) return;
    if (typeof requestAnimationFrame !== "function") {
      setEraserCursor(point);
      return;
    }

    eraserCursorPending.current = true;
    eraserCursorRenderRaf.current = requestAnimationFrame(() => {
      eraserCursorPending.current = false;
      eraserCursorRenderRaf.current = null;
      setEraserCursor(eraserCursorDraft.current);
    });
  }, []);

  const commitLassoPath = useCallback((path: string, immediate = false) => {
    lassoPathDraft.current = path;

    if (immediate) {
      if (lassoRenderRaf.current != null) {
        cancelAnimationFrame(lassoRenderRaf.current);
        lassoRenderRaf.current = null;
      }
      lassoPending.current = false;
      setLassoPath(path);
      return;
    }

    if (lassoPending.current) return;
    if (typeof requestAnimationFrame !== "function") {
      setLassoPath(path);
      return;
    }

    lassoPending.current = true;
    lassoRenderRaf.current = requestAnimationFrame(() => {
      lassoPending.current = false;
      lassoRenderRaf.current = null;
      setLassoPath(lassoPathDraft.current);
    });
  }, []);

  const startDraftPath = useCallback((point: Point) => {
    currentPathDraft.current = `M ${point.x} ${point.y} L ${point.x + 0.01} ${point.y + 0.01}`;
  }, []);

  const appendDraftPathPoint = useCallback((point: Point) => {
    currentPathDraft.current += ` L ${point.x} ${point.y}`;
  }, []);

  const startStroke = useCallback(
    (point: Point) => {
      ensureInfiniteCanvasRoom(point);
      currentPoints.current = [point];
      startDraftPath(point);
      setCurrentPath(currentPathDraft.current);
    },
    [ensureInfiniteCanvasRoom, startDraftPath],
  );

  const extendStroke = useCallback(
    (point: Point) => {
      ensureInfiniteCanvasRoom(point);
      const points = currentPoints.current;
      const last = points[points.length - 1];

      if (!last) {
        points.push(point);
        appendDraftPathPoint(point);
        recomputePath();
        return;
      }

      if (dist(last, point) < minDistPx) return;

      const smoothed = smoothTowards(last, point, strokeSmoothingAlpha);
      const segmentLength = dist(last, smoothed);
      const segmentStep = Math.max(1, minDistPx * 0.75);
      const steps = Math.max(1, Math.ceil(segmentLength / segmentStep));

      for (let i = 1; i <= steps; i++) {
        const nextPoint = lerpPoint(last, smoothed, i / steps);
        points.push(nextPoint);
        appendDraftPathPoint(nextPoint);
      }

      recomputePath();
    },
    [
      appendDraftPathPoint,
      ensureInfiniteCanvasRoom,
      minDistPx,
      recomputePath,
      strokeSmoothingAlpha,
    ],
  );

  const endStroke = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
      pending.current = false;
    }

    if (currentPoints.current.length < minPointsToSave) {
      currentPoints.current = [];
      currentPathDraft.current = "";
      setCurrentPath("");
      return;
    }

    const points = currentPoints.current;
    const d = pointsToSmoothPath(points);
    const bbox = computeBBox(points);

      if (d.trim().length > 0) {
        const stroke: Stroke = {
        id: uid(),
        points: points.slice(),
        d,
        w: activeWidthRef.current,
        c: activeColorRef.current,
        dx: 0,
          dy: 0,
          bbox,
        };
        commitCurrentPageStrokes((prev) => [...prev, stroke]);
      }

    currentPoints.current = [];
    currentPathDraft.current = "";
    setCurrentPath("");
  }, [
    activeColorRef,
    activeWidthRef,
    commitCurrentPageStrokes,
    minPointsToSave,
  ]);

  const cancelStroke = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
      pending.current = false;
    }
    currentPoints.current = [];
    currentPathDraft.current = "";
    setCurrentPath("");
  }, []);

  const eraseAtPoints = useCallback(
    (points: Point[]) => {
      if (points.length === 0) return;
      const radius = activeWidthRef.current / 2;

      updateCurrentPageStrokes((prev) => {
        let changed = false;
        const next: Stroke[] = [];

        for (const stroke of prev) {
          const replaced = splitStrokeByEraserPathPoints(
            stroke,
            points,
            radius,
            minPointsToSave,
          );
          if (replaced === null) next.push(stroke);
          else {
            changed = true;
            next.push(...replaced);
          }
        }

        if (changed) eraserDidMutate.current = true;
        return changed ? next : prev;
      });
    },
    [activeWidthRef, minPointsToSave, updateCurrentPageStrokes],
  );

  const flushQueuedEraser = useCallback(() => {
    if (eraserRafId.current != null) {
      cancelAnimationFrame(eraserRafId.current);
      eraserRafId.current = null;
    }

    if (queuedEraserPoints.current.length === 0) return;
    const points = queuedEraserPoints.current.slice();
    queuedEraserPoints.current = [];
    eraseAtPoints(points);
  }, [eraseAtPoints]);

  const queueEraserPoints = useCallback(
    (points: Point[]) => {
      if (points.length === 0) return;
      queuedEraserPoints.current.push(...points);

      if (eraserRafId.current != null) return;
      if (typeof requestAnimationFrame !== "function") {
        flushQueuedEraser();
        return;
      }

      eraserRafId.current = requestAnimationFrame(() => {
        eraserRafId.current = null;
        flushQueuedEraser();
      });
    },
    [flushQueuedEraser],
  );

  const eraseAtPoint = useCallback(
    (point: Point) => {
      queueEraserPoints([point]);
    },
    [queueEraserPoints],
  );

  const eraseAlongSegment = useCallback(
    (from: Point, to: Point) => {
      const radius = activeWidthRef.current / 2;
      const step = Math.max(1.25, radius * 0.22);
      const distance = dist(from, to);

      if (distance <= step) {
        eraseAtPoint(to);
        return;
      }

      const sampleCount = Math.ceil(distance / step);
      const samples: Point[] = [];
      for (let i = 1; i <= sampleCount; i++) {
        const t = i / sampleCount;
        samples.push({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        });
      }
      queueEraserPoints(samples);
    },
    [activeWidthRef, eraseAtPoint, queueEraserPoints],
  );

  const lassoToPath = useCallback((points: Point[]) => {
    if (points.length === 0) return "";
    let d = `M ${points[0].x} ${points[0].y} `;
    for (let i = 1; i < points.length; i++) d += `L ${points[i].x} ${points[i].y} `;
    d += "Z";
    return d;
  }, []);

  const startLasso = useCallback(
    (point: Point) => {
      lassoPoints.current = [point];
      commitLassoPath(lassoToPath(lassoPoints.current), true);
    },
    [commitLassoPath, lassoToPath],
  );

  const extendLasso = useCallback(
    (point: Point) => {
      const points = lassoPoints.current;
      const last = points[points.length - 1];
      if (last && dist(last, point) < 3) return;
      points.push(point);
      commitLassoPath(lassoToPath(points));
    },
    [commitLassoPath, lassoToPath],
  );

  const finishLassoAndSelect = useCallback(() => {
    const polygon = lassoPoints.current;
    if (polygon.length < 3) {
      commitLassoPath("");
      lassoPoints.current = [];
      return;
    }

    const polygonBounds = computeBBox(polygon);
    const hits: string[] = [];

    for (const stroke of strokesRef.current) {
      const strokeBounds = {
        minX: stroke.bbox.minX + stroke.dx,
        minY: stroke.bbox.minY + stroke.dy,
        maxX: stroke.bbox.maxX + stroke.dx,
        maxY: stroke.bbox.maxY + stroke.dy,
      };
      if (!bboxOverlap(strokeBounds, polygonBounds)) continue;

      let inside = false;
      for (let i = 0; i < stroke.points.length; i += 2) {
        const point = stroke.points[i];
        const translatedPoint = { x: point.x + stroke.dx, y: point.y + stroke.dy };
        if (pointInPoly(translatedPoint, polygon)) {
          inside = true;
          break;
        }
      }
      if (inside) hits.push(stroke.id);
    }

    setSelectedIds(hits);
    commitLassoPath("");
    lassoPoints.current = [];
  }, [commitLassoPath, strokesRef]);

  const startMoveSelection = useCallback(
    (point: Point) => {
      if (selectedIdsRef.current.length === 0) return;
      isMovingSelection.current = true;
      moveStart.current = point;
      moveDidMutate.current = false;

      const base = new Map<string, { dx: number; dy: number }>();
      for (const stroke of strokesRef.current) {
        if (selectedSetRef.current.has(stroke.id)) {
          base.set(stroke.id, { dx: stroke.dx, dy: stroke.dy });
        }
      }
      moveBase.current = base;
    },
    [strokesRef],
  );

  const moveSelectionTo = useCallback(
    (point: Point) => {
      if (!isMovingSelection.current || !moveStart.current) return;
      ensureInfiniteCanvasRoom(point);

      const dx = point.x - moveStart.current.x;
      const dy = point.y - moveStart.current.y;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        moveDidMutate.current = true;
      }

      updateCurrentPageStrokes((prev) =>
        prev.map((stroke) => {
          if (!selectedSetRef.current.has(stroke.id)) return stroke;
          const base = moveBase.current.get(stroke.id);
          if (!base) return stroke;
          return { ...stroke, dx: base.dx + dx, dy: base.dy + dy };
        }),
      );
    },
    [ensureInfiniteCanvasRoom, updateCurrentPageStrokes],
  );

  const endMoveSelection = useCallback(() => {
    if (isMovingSelection.current && moveDidMutate.current) {
      commitCurrentPageHistory(strokesRef.current);
    }
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
    moveDidMutate.current = false;
  }, [commitCurrentPageHistory, strokesRef]);

  const deleteSelection = useCallback(() => {
    if (selectedIdsRef.current.length === 0) return;
    commitCurrentPageStrokes((prev) =>
      prev.filter((stroke) => !selectedSetRef.current.has(stroke.id)),
    );
    setSelectedIds([]);
  }, [commitCurrentPageStrokes]);

  const getLocalPagePoint = useCallback(
    (event: any): Point | null => {
      const nativeEvent = event?.nativeEvent ?? {};
      let localX: number | null = null;
      let localY: number | null = null;

      if (Platform.OS === "web") {
        const targetRect = event?.currentTarget?.getBoundingClientRect?.();
        if (
          targetRect &&
          typeof nativeEvent.clientX === "number" &&
          typeof nativeEvent.clientY === "number"
        ) {
          localX = nativeEvent.clientX - targetRect.left;
          localY = nativeEvent.clientY - targetRect.top;
        }
      } else {
        localX =
          typeof nativeEvent.locationX === "number"
            ? nativeEvent.locationX
            : typeof nativeEvent.offsetX === "number"
              ? nativeEvent.offsetX
              : null;
        localY =
          typeof nativeEvent.locationY === "number"
            ? nativeEvent.locationY
            : typeof nativeEvent.offsetY === "number"
              ? nativeEvent.offsetY
              : null;
      }

      if (localX == null || localY == null) return null;

      const zoom = zoomRef.current;
      const canvasSize = canvasSizeRef.current;
      const x = localX / zoom;
      const y = localY / zoom;
      if (x < 0 || y < 0 || x > canvasSize.width || y > canvasSize.height) {
        return null;
      }
      return { x, y };
    },
    [canvasSizeRef, zoomRef],
  );

  const resetCanvasState = useCallback(() => {
    isPointerDown.current = false;
    currentPoints.current = [];
    currentPathDraft.current = "";
    setCurrentPath("");
    setSelectedIds([]);
    lassoPathDraft.current = "";
    if (lassoRenderRaf.current != null) {
      cancelAnimationFrame(lassoRenderRaf.current);
      lassoRenderRaf.current = null;
      lassoPending.current = false;
    }
    setLassoPath("");
    lassoPoints.current = [];
    eraserCursorDraft.current = null;
    if (eraserCursorRenderRaf.current != null) {
      cancelAnimationFrame(eraserCursorRenderRaf.current);
      eraserCursorRenderRaf.current = null;
      eraserCursorPending.current = false;
    }
    setEraserCursor(null);
    lastEraserPoint.current = null;
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
  }, []);

  const resetForPageSwitch = useCallback(() => {
    isPointerDown.current = false;
    cancelStroke();
    flushQueuedEraser();
    setSelectedIds([]);
    commitLassoPath("");
    lassoPoints.current = [];
    commitEraserCursor(null);
    lastEraserPoint.current = null;
    eraserDidMutate.current = false;
    queuedEraserPoints.current = [];
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
    moveDidMutate.current = false;
  }, [cancelStroke, commitEraserCursor, commitLassoPath, flushQueuedEraser]);

  const handleSelectPage = useCallback(
    (index: number) => {
      selectPage(index, resetForPageSwitch);
    },
    [resetForPageSwitch, selectPage],
  );

  const handleAddPageBelowCurrent = useCallback(() => {
    addPageBelowCurrent(resetForPageSwitch);
  }, [addPageBelowCurrent, resetForPageSwitch]);

  const handleRemoveCurrentPage = useCallback(() => {
    removeCurrentPage(resetForPageSwitch);
  }, [removeCurrentPage, resetForPageSwitch]);

  const clearPenModeArtifacts = useCallback(() => {
    setSelectedIds([]);
    commitLassoPath("");
    commitEraserCursor(null);
    lastEraserPoint.current = null;
  }, [commitEraserCursor, commitLassoPath]);

  const clearEraserModeArtifacts = useCallback(() => {
    setSelectedIds([]);
    commitLassoPath("");
  }, [commitLassoPath]);

  const clearLassoModeArtifacts = useCallback(() => {
    commitLassoPath("");
    lassoPoints.current = [];
    commitEraserCursor(null);
    lastEraserPoint.current = null;
  }, [commitEraserCursor, commitLassoPath]);

  const interactionApiRef = useRef({
    getLocalPagePoint,
    handleSelectPage,
    startMoveSelection,
    startLasso,
    startStroke,
    clearSelection: () => setSelectedIds([]),
    showEraserCursor: commitEraserCursor,
    eraseAtPoint,
    extendLasso,
    moveSelectionTo,
    eraseAlongSegment,
    extendStroke,
    flushQueuedEraser,
    commitCurrentPageHistory,
    endMoveSelection,
    finishLassoAndSelect,
    endStroke,
    clearLasso: () => commitLassoPath(""),
    cancelStroke,
  });

  interactionApiRef.current = {
    getLocalPagePoint,
    handleSelectPage,
    startMoveSelection,
    startLasso,
    startStroke,
    clearSelection: () => setSelectedIds([]),
    showEraserCursor: commitEraserCursor,
    eraseAtPoint,
    extendLasso,
    moveSelectionTo,
    eraseAlongSegment,
    extendStroke,
    flushQueuedEraser,
    commitCurrentPageHistory,
    endMoveSelection,
    finishLassoAndSelect,
    endStroke,
    clearLasso: () => commitLassoPath(""),
    cancelStroke,
  };

  const pageHandlersByPage = useMemo(
    () =>
      pages.map((_, pageIndex) => {
        if (Platform.OS === "web") {
          return {
            onPointerDown: (event: any) => {
              const api = interactionApiRef.current;
              if (
                event?.nativeEvent?.button != null &&
                event.nativeEvent.button !== 0
              ) {
                return;
              }

              event?.preventDefault?.();
              event?.stopPropagation?.();

              const point = api.getLocalPagePoint(event);
              if (!point) {
                if (toolRef.current === "lasso") api.clearSelection();
                return;
              }

              if (pageIndex !== currentPageIndexRef.current) {
                api.handleSelectPage(pageIndex);
              }

              pointerPageIndex.current = pageIndex;
              isPointerDown.current = true;
              event?.nativeEvent?.target?.setPointerCapture?.(
                event.nativeEvent.pointerId,
              );

              if (toolRef.current === "lasso") {
                if (selectedIdsRef.current.length > 0) api.startMoveSelection(point);
                else api.startLasso(point);
                return;
              }

              if (toolRef.current === "eraser") {
                api.showEraserCursor(point, true);
                eraserDidMutate.current = false;
                lastEraserPoint.current = point;
                api.eraseAtPoint(point);
                return;
              }

              api.startStroke(point);
            },
            onPointerMove: (event: any) => {
              const api = interactionApiRef.current;
              if (!isPointerDown.current) return;
              if (pointerPageIndex.current !== pageIndex) return;
              event?.preventDefault?.();

              const point = api.getLocalPagePoint(event);
              if (!point) return;

              if (toolRef.current === "lasso") {
                if (isMovingSelection.current) api.moveSelectionTo(point);
                else api.extendLasso(point);
                return;
              }

              if (toolRef.current === "eraser") {
                api.showEraserCursor(point);
                const previous = lastEraserPoint.current;
                if (previous) api.eraseAlongSegment(previous, point);
                else api.eraseAtPoint(point);
                lastEraserPoint.current = point;
                return;
              }

              api.extendStroke(point);
            },
            onPointerUp: (event: any) => {
              const api = interactionApiRef.current;
              if (!isPointerDown.current) return;
              if (pointerPageIndex.current !== pageIndex) return;
              event?.preventDefault?.();

              isPointerDown.current = false;
              pointerPageIndex.current = null;

              if (toolRef.current === "eraser") {
                api.flushQueuedEraser();
                if (eraserDidMutate.current) {
                  api.commitCurrentPageHistory(strokesRef.current);
                }
                api.showEraserCursor(null);
                lastEraserPoint.current = null;
                eraserDidMutate.current = false;
                return;
              }

              if (toolRef.current === "lasso") {
                if (isMovingSelection.current) api.endMoveSelection();
                else api.finishLassoAndSelect();
                return;
              }

              api.endStroke();
            },
            onPointerCancel: () => {
              const api = interactionApiRef.current;
              if (!isPointerDown.current) return;
              if (pointerPageIndex.current !== pageIndex) return;
              isPointerDown.current = false;
              pointerPageIndex.current = null;
              api.flushQueuedEraser();
              api.showEraserCursor(null);
              lastEraserPoint.current = null;
              eraserDidMutate.current = false;
              api.endMoveSelection();
              api.clearLasso();
              lassoPoints.current = [];
              api.cancelStroke();
            },
          } as any;
        }

        return {
          onStartShouldSetResponder: () => true,
          onMoveShouldSetResponder: () => true,
          onResponderGrant: (event: any) => {
            const api = interactionApiRef.current;
            const point = api.getLocalPagePoint(event);
            if (!point) return;

            if (pageIndex !== currentPageIndexRef.current) {
              api.handleSelectPage(pageIndex);
            }

            isPointerDown.current = true;
            pointerPageIndex.current = pageIndex;

            if (toolRef.current === "lasso") {
              if (selectedIdsRef.current.length > 0) api.startMoveSelection(point);
              else api.startLasso(point);
              return;
            }

            if (toolRef.current === "eraser") {
              api.showEraserCursor(point, true);
              eraserDidMutate.current = false;
              lastEraserPoint.current = point;
              api.eraseAtPoint(point);
              return;
            }

            api.startStroke(point);
          },
          onResponderMove: (event: any) => {
            const api = interactionApiRef.current;
            if (!isPointerDown.current) return;
            if (pointerPageIndex.current !== pageIndex) return;
            const point = api.getLocalPagePoint(event);
            if (!point) return;

            if (toolRef.current === "lasso") {
              if (isMovingSelection.current) api.moveSelectionTo(point);
              else api.extendLasso(point);
              return;
            }

            if (toolRef.current === "eraser") {
              api.showEraserCursor(point);
              const previous = lastEraserPoint.current;
              if (previous) api.eraseAlongSegment(previous, point);
              else api.eraseAtPoint(point);
              lastEraserPoint.current = point;
              return;
            }

            api.extendStroke(point);
          },
          onResponderRelease: () => {
            const api = interactionApiRef.current;
            if (!isPointerDown.current) return;
            if (pointerPageIndex.current !== pageIndex) return;
            isPointerDown.current = false;
            pointerPageIndex.current = null;

            if (toolRef.current === "eraser") {
              api.flushQueuedEraser();
              if (eraserDidMutate.current) {
                api.commitCurrentPageHistory(strokesRef.current);
              }
              api.showEraserCursor(null);
              lastEraserPoint.current = null;
              eraserDidMutate.current = false;
              return;
            }

            if (toolRef.current === "lasso") {
              if (isMovingSelection.current) api.endMoveSelection();
              else api.finishLassoAndSelect();
              return;
            }

            api.endStroke();
          },
          onResponderTerminate: () => {
            const api = interactionApiRef.current;
            if (!isPointerDown.current) return;
            if (pointerPageIndex.current !== pageIndex) return;
            isPointerDown.current = false;
            pointerPageIndex.current = null;
            api.flushQueuedEraser();
            if (toolRef.current === "eraser") {
              eraserDidMutate.current = false;
            }
            api.showEraserCursor(null);
            api.clearLasso();
            lassoPoints.current = [];
            api.cancelStroke();
          },
        };
      }),
    [pages, strokesRef],
  );

  return {
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
  };
}
