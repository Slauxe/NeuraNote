import { useCallback, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import type { Point, Stroke } from "@/lib/editorTypes";

type Tool = "pen" | "eraser" | "lasso";

type UseCanvasInteractionsArgs = {
  tool: Tool;
  zoom: number;
  pages: Stroke[][];
  strokes: Stroke[];
  currentPageIndex: number;
  pageWidth: number;
  pageHeight: number;
  minDistPx: number;
  minPointsToSave: number;
  strokeSmoothingAlpha: number;
  activeWidthRef: React.RefObject<number>;
  activeColorRef: React.RefObject<string>;
  strokesRef: React.RefObject<Stroke[]>;
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
  pushHistory: (newStrokes: Stroke[]) => void;
  selectPage: (index: number, beforeSwitch: () => void) => void;
  addPageBelowCurrent: (beforeSwitch: () => void) => void;
  removeCurrentPage: (beforeSwitch: () => void) => void;
  pointsToSmoothPath: (points: Point[]) => string;
  computeBBox: (points: Point[]) => {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  splitStrokeByEraserPathPoints: (
    stroke: Stroke,
    centers: Point[],
    radius: number,
  ) => Stroke[] | null;
  dist: (a: Point, b: Point) => number;
  smoothTowards: (prev: Point, next: Point, alpha: number) => Point;
  lerpPoint: (a: Point, b: Point, t: number) => Point;
  pointInPoly: (pt: Point, poly: Point[]) => boolean;
  bboxOverlap: (
    a: { minX: number; minY: number; maxX: number; maxY: number },
    b: { minX: number; minY: number; maxX: number; maxY: number },
  ) => boolean;
  uid: () => string;
};

export function useCanvasInteractions({
  tool,
  zoom,
  pages,
  strokes,
  currentPageIndex,
  pageWidth,
  pageHeight,
  minDistPx,
  minPointsToSave,
  strokeSmoothingAlpha,
  activeWidthRef,
  activeColorRef,
  strokesRef,
  setStrokes,
  pushHistory,
  selectPage,
  addPageBelowCurrent,
  removeCurrentPage,
  pointsToSmoothPath,
  computeBBox,
  splitStrokeByEraserPathPoints,
  dist,
  smoothTowards,
  lerpPoint,
  pointInPoly,
  bboxOverlap,
  uid,
}: UseCanvasInteractionsArgs) {
  const [currentPath, setCurrentPath] = useState("");
  const [eraserCursor, setEraserCursor] = useState<Point | null>(null);
  const [lassoPath, setLassoPath] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const lastEraserPoint = useRef<Point | null>(null);
  const eraserDidMutate = useRef(false);
  const queuedEraserPoints = useRef<Point[]>([]);
  const eraserRafId = useRef<number | null>(null);
  const isPointerDown = useRef(false);
  const currentPoints = useRef<Point[]>([]);
  const lassoPoints = useRef<Point[]>([]);
  const isMovingSelection = useRef(false);
  const moveStart = useRef<Point | null>(null);
  const moveBase = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const moveDidMutate = useRef(false);
  const pointerPageIndex = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);
  const pending = useRef(false);

  const recomputePath = useCallback(() => {
    if (pending.current) return;

    if (typeof requestAnimationFrame !== "function") {
      setCurrentPath(pointsToSmoothPath(currentPoints.current));
      return;
    }

    pending.current = true;
    rafId.current = requestAnimationFrame(() => {
      pending.current = false;
      setCurrentPath(pointsToSmoothPath(currentPoints.current));
    });
  }, [pointsToSmoothPath]);

  const startStroke = useCallback(
    (p: Point) => {
      currentPoints.current = [p];
      recomputePath();
    },
    [recomputePath],
  );

  const extendStroke = useCallback(
    (p: Point) => {
      const pts = currentPoints.current;
      const last = pts[pts.length - 1];

      if (!last) {
        pts.push(p);
        recomputePath();
        return;
      }

      if (dist(last, p) < minDistPx) return;

      const smoothed = smoothTowards(last, p, strokeSmoothingAlpha);
      const segmentLen = dist(last, smoothed);
      const segmentStep = Math.max(1, minDistPx * 0.75);
      const steps = Math.max(1, Math.ceil(segmentLen / segmentStep));

      for (let i = 1; i <= steps; i++) {
        pts.push(lerpPoint(last, smoothed, i / steps));
      }

      recomputePath();
    },
    [
      dist,
      lerpPoint,
      minDistPx,
      recomputePath,
      smoothTowards,
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
      setCurrentPath("");
      return;
    }

    const pts = currentPoints.current;
    const d = pointsToSmoothPath(pts);
    const bbox = computeBBox(pts);

    if (d.trim().length > 0) {
      const stroke: Stroke = {
        id: uid(),
        points: pts.slice(),
        d,
        w: activeWidthRef.current,
        c: activeColorRef.current,
        dx: 0,
        dy: 0,
        bbox,
      };
      setStrokes((prev) => {
        const updated = [...prev, stroke];
        pushHistory(updated);
        return updated;
      });
    }

    currentPoints.current = [];
    setCurrentPath("");
  }, [
    activeColorRef,
    activeWidthRef,
    computeBBox,
    minPointsToSave,
    pointsToSmoothPath,
    pushHistory,
    setStrokes,
    uid,
  ]);

  const cancelStroke = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
      pending.current = false;
    }
    currentPoints.current = [];
    setCurrentPath("");
  }, []);

  const eraseAtPoints = useCallback(
    (points: Point[]) => {
      if (points.length === 0) return;
      const radius = activeWidthRef.current / 2;

      setStrokes((prev) => {
        let changed = false;
        const out: Stroke[] = [];

        for (const stroke of prev) {
          const replaced = splitStrokeByEraserPathPoints(stroke, points, radius);
          if (replaced === null) out.push(stroke);
          else {
            changed = true;
            out.push(...replaced);
          }
        }

        if (changed) eraserDidMutate.current = true;
        return changed ? out : prev;
      });
    },
    [activeWidthRef, setStrokes, splitStrokeByEraserPathPoints],
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
    (p: Point) => {
      queueEraserPoints([p]);
    },
    [queueEraserPoints],
  );

  const eraseAlongSegment = useCallback(
    (from: Point, to: Point) => {
      const radius = activeWidthRef.current / 2;
      const step = Math.max(1.25, radius * 0.22);

      const d = dist(from, to);
      if (d <= step) {
        eraseAtPoint(to);
        return;
      }

      const n = Math.ceil(d / step);
      const samples: Point[] = [];
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        samples.push({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        });
      }
      queueEraserPoints(samples);
    },
    [activeWidthRef, dist, eraseAtPoint, queueEraserPoints],
  );

  const lassoToPath = useCallback((pts: Point[]) => {
    if (pts.length === 0) return "";
    let d = `M ${pts[0].x} ${pts[0].y} `;
    for (let i = 1; i < pts.length; i++) d += `L ${pts[i].x} ${pts[i].y} `;
    d += "Z";
    return d;
  }, []);

  const startLasso = useCallback(
    (p: Point) => {
      lassoPoints.current = [p];
      setLassoPath(lassoToPath(lassoPoints.current));
    },
    [lassoToPath],
  );

  const extendLasso = useCallback(
    (p: Point) => {
      const pts = lassoPoints.current;
      const last = pts[pts.length - 1];
      if (last && dist(last, p) < 3) return;
      pts.push(p);
      setLassoPath(lassoToPath(pts));
    },
    [dist, lassoToPath],
  );

  const finishLassoAndSelect = useCallback(() => {
    const poly = lassoPoints.current;
    if (poly.length < 3) {
      setLassoPath("");
      lassoPoints.current = [];
      return;
    }

    const pb = computeBBox(poly);

    const hits: string[] = [];
    for (const stroke of strokes) {
      const sb = {
        minX: stroke.bbox.minX + stroke.dx,
        minY: stroke.bbox.minY + stroke.dy,
        maxX: stroke.bbox.maxX + stroke.dx,
        maxY: stroke.bbox.maxY + stroke.dy,
      };
      if (!bboxOverlap(sb, pb)) continue;

      let inside = false;
      for (let i = 0; i < stroke.points.length; i += 2) {
        const p = stroke.points[i];
        const tp = { x: p.x + stroke.dx, y: p.y + stroke.dy };
        if (pointInPoly(tp, poly)) {
          inside = true;
          break;
        }
      }
      if (inside) hits.push(stroke.id);
    }

    setSelectedIds(hits);
    setLassoPath("");
    lassoPoints.current = [];
  }, [bboxOverlap, computeBBox, pointInPoly, strokes]);

  const startMoveSelection = useCallback(
    (p: Point) => {
      if (selectedIds.length === 0) return;
      isMovingSelection.current = true;
      moveStart.current = p;
      moveDidMutate.current = false;
      const base = new Map<string, { dx: number; dy: number }>();
      for (const stroke of strokes) {
        if (selectedSet.has(stroke.id)) {
          base.set(stroke.id, { dx: stroke.dx, dy: stroke.dy });
        }
      }
      moveBase.current = base;
    },
    [selectedIds.length, selectedSet, strokes],
  );

  const moveSelectionTo = useCallback(
    (p: Point) => {
      if (!isMovingSelection.current || !moveStart.current) return;
      const dx = p.x - moveStart.current.x;
      const dy = p.y - moveStart.current.y;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        moveDidMutate.current = true;
      }

      setStrokes((prev) =>
        prev.map((stroke) => {
          if (!selectedSet.has(stroke.id)) return stroke;
          const base = moveBase.current.get(stroke.id);
          if (!base) return stroke;
          return { ...stroke, dx: base.dx + dx, dy: base.dy + dy };
        }),
      );
    },
    [selectedSet, setStrokes],
  );

  const endMoveSelection = useCallback(() => {
    if (isMovingSelection.current && moveDidMutate.current) {
      pushHistory(strokesRef.current);
    }
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
    moveDidMutate.current = false;
  }, [pushHistory, strokesRef]);

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    setStrokes((prev) => {
      const updated = prev.filter((stroke) => !selectedSet.has(stroke.id));
      pushHistory(updated);
      return updated;
    });
    setSelectedIds([]);
  }, [pushHistory, selectedIds.length, selectedSet, setStrokes]);

  const clearPenModeArtifacts = useCallback(() => {
    setSelectedIds([]);
    setLassoPath("");
    lassoPoints.current = [];
    setEraserCursor(null);
    lastEraserPoint.current = null;
  }, []);

  const clearEraserModeArtifacts = useCallback(() => {
    setSelectedIds([]);
    setLassoPath("");
    lassoPoints.current = [];
  }, []);

  const clearLassoModeArtifacts = useCallback(() => {
    setLassoPath("");
    lassoPoints.current = [];
    setEraserCursor(null);
    lastEraserPoint.current = null;
  }, []);

  const resetForPageSwitch = useCallback(() => {
    isPointerDown.current = false;
    cancelStroke();
    flushQueuedEraser();
    setSelectedIds([]);
    setLassoPath("");
    lassoPoints.current = [];
    setEraserCursor(null);
    lastEraserPoint.current = null;
    eraserDidMutate.current = false;
    queuedEraserPoints.current = [];
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
    moveDidMutate.current = false;
  }, [cancelStroke, flushQueuedEraser]);

  const resetCanvasState = useCallback(() => {
    isPointerDown.current = false;
    currentPoints.current = [];
    setCurrentPath("");
    setSelectedIds([]);
    setLassoPath("");
    lassoPoints.current = [];
    setEraserCursor(null);
    lastEraserPoint.current = null;
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
  }, []);

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

  const getLocalPagePoint = useCallback(
    (e: any): Point | null => {
      const ne = e?.nativeEvent ?? {};
      let lx: number | null = null;
      let ly: number | null = null;

      if (Platform.OS === "web") {
        const targetRect = e?.currentTarget?.getBoundingClientRect?.();
        if (
          targetRect &&
          typeof ne.clientX === "number" &&
          typeof ne.clientY === "number"
        ) {
          lx = ne.clientX - targetRect.left;
          ly = ne.clientY - targetRect.top;
        }
      } else {
        lx =
          typeof ne.locationX === "number"
            ? ne.locationX
            : typeof ne.offsetX === "number"
              ? ne.offsetX
              : null;
        ly =
          typeof ne.locationY === "number"
            ? ne.locationY
            : typeof ne.offsetY === "number"
              ? ne.offsetY
              : null;
      }

      if (lx == null || ly == null) return null;

      const x = lx / zoom;
      const y = ly / zoom;
      if (x < 0 || y < 0 || x > pageWidth || y > pageHeight) return null;
      return { x, y };
    },
    [pageHeight, pageWidth, zoom],
  );

  const pageHandlersByPage = useMemo(
    () =>
      pages.map((_, pageIndex) => {
        if (Platform.OS === "web") {
          return {
            onPointerDown: (e: any) => {
              if (e?.nativeEvent?.button != null && e.nativeEvent.button !== 0) {
                return;
              }

              e?.preventDefault?.();
              e?.stopPropagation?.();

              const p = getLocalPagePoint(e);
              if (!p) {
                if (tool === "lasso") setSelectedIds([]);
                return;
              }

              if (pageIndex !== currentPageIndex) handleSelectPage(pageIndex);

              pointerPageIndex.current = pageIndex;
              isPointerDown.current = true;
              e?.nativeEvent?.target?.setPointerCapture?.(
                e.nativeEvent.pointerId,
              );

              if (tool === "lasso") {
                if (selectedIds.length > 0) startMoveSelection(p);
                else startLasso(p);
                return;
              }

              if (tool === "eraser") {
                setEraserCursor(p);
                eraserDidMutate.current = false;
                lastEraserPoint.current = p;
                eraseAtPoint(p);
                return;
              }

              startStroke(p);
            },
            onPointerMove: (e: any) => {
              if (!isPointerDown.current) return;
              if (pointerPageIndex.current !== pageIndex) return;
              e?.preventDefault?.();

              const p = getLocalPagePoint(e);
              if (!p) return;

              if (tool === "lasso") {
                if (isMovingSelection.current) moveSelectionTo(p);
                else extendLasso(p);
                return;
              }

              if (tool === "eraser") {
                setEraserCursor(p);
                const prev = lastEraserPoint.current;
                if (prev) eraseAlongSegment(prev, p);
                else eraseAtPoint(p);
                lastEraserPoint.current = p;
                return;
              }

              extendStroke(p);
            },
            onPointerUp: (e: any) => {
              if (!isPointerDown.current) return;
              if (pointerPageIndex.current !== pageIndex) return;
              e?.preventDefault?.();

              isPointerDown.current = false;
              pointerPageIndex.current = null;

              if (tool === "eraser") {
                flushQueuedEraser();
                if (eraserDidMutate.current) pushHistory(strokesRef.current);
                setEraserCursor(null);
                lastEraserPoint.current = null;
                eraserDidMutate.current = false;
                return;
              }

              if (tool === "lasso") {
                if (isMovingSelection.current) endMoveSelection();
                else finishLassoAndSelect();
                return;
              }

              endStroke();
            },
            onPointerCancel: () => {
              if (!isPointerDown.current) return;
              if (pointerPageIndex.current !== pageIndex) return;
              isPointerDown.current = false;
              pointerPageIndex.current = null;
              flushQueuedEraser();
              setEraserCursor(null);
              lastEraserPoint.current = null;
              eraserDidMutate.current = false;
              endMoveSelection();
              setLassoPath("");
              lassoPoints.current = [];
              cancelStroke();
            },
          } as any;
        }

        return {
          onStartShouldSetResponder: () => true,
          onMoveShouldSetResponder: () => true,

          onResponderGrant: (e: any) => {
            const p = getLocalPagePoint(e);
            if (!p) return;

            if (pageIndex !== currentPageIndex) handleSelectPage(pageIndex);

            isPointerDown.current = true;
            pointerPageIndex.current = pageIndex;

            if (tool === "lasso") {
              if (selectedIds.length > 0) startMoveSelection(p);
              else startLasso(p);
              return;
            }

            if (tool === "eraser") {
              setEraserCursor(p);
              eraserDidMutate.current = false;
              lastEraserPoint.current = p;
              eraseAtPoint(p);
              return;
            }

            startStroke(p);
          },

          onResponderMove: (e: any) => {
            if (!isPointerDown.current) return;
            if (pointerPageIndex.current !== pageIndex) return;
            const p = getLocalPagePoint(e);
            if (!p) return;

            if (tool === "lasso") {
              if (isMovingSelection.current) moveSelectionTo(p);
              else extendLasso(p);
              return;
            }

            if (tool === "eraser") {
              setEraserCursor(p);
              const prev = lastEraserPoint.current;
              if (prev) eraseAlongSegment(prev, p);
              else eraseAtPoint(p);
              lastEraserPoint.current = p;
              return;
            }

            extendStroke(p);
          },

          onResponderRelease: () => {
            if (!isPointerDown.current) return;
            if (pointerPageIndex.current !== pageIndex) return;
            isPointerDown.current = false;
            pointerPageIndex.current = null;

            if (tool === "eraser") {
              flushQueuedEraser();
              if (eraserDidMutate.current) pushHistory(strokesRef.current);
              setEraserCursor(null);
              lastEraserPoint.current = null;
              eraserDidMutate.current = false;
              return;
            }

            if (tool === "lasso") {
              if (isMovingSelection.current) endMoveSelection();
              else finishLassoAndSelect();
              return;
            }

            endStroke();
          },
          onResponderTerminate: () => {
            if (!isPointerDown.current) return;
            if (pointerPageIndex.current !== pageIndex) return;
            isPointerDown.current = false;
            pointerPageIndex.current = null;
            flushQueuedEraser();
            if (tool === "eraser") eraserDidMutate.current = false;
            cancelStroke();
          },
        };
      }),
    [
      cancelStroke,
      currentPageIndex,
      endMoveSelection,
      endStroke,
      eraseAlongSegment,
      eraseAtPoint,
      extendLasso,
      extendStroke,
      finishLassoAndSelect,
      flushQueuedEraser,
      getLocalPagePoint,
      handleSelectPage,
      moveSelectionTo,
      pages,
      pushHistory,
      selectedIds.length,
      startLasso,
      startMoveSelection,
      startStroke,
      strokesRef,
      tool,
    ],
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
