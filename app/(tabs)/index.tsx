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
import { PagesModal } from "@/components/editor/modals/PagesModal";
import { SizeModal } from "@/components/editor/modals/SizeModal";
import { ToolbarLayoutModal } from "@/components/editor/modals/ToolbarLayoutModal";
import { useEditorPageState } from "@/hooks/useEditorPageState";
import { useNotePersistence } from "@/hooks/useNotePersistence";
import { exportNoteAsPdf } from "@/lib/editorExport";
import {
  EMPTY_PAGE_BACKGROUND,
  PAGE_H,
  PAGE_W,
  type Point,
  type Stroke,
} from "@/lib/editorTypes";
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

function dist(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Smooth path using quadratic curves through midpoints (signature-pad style).
 */
function pointsToSmoothPath(points: Point[]) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y + 0.01}`;
  }
  if (points.length === 2) {
    const [p0, p1] = points;
    return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
  }

  let d = "";
  const p0 = points[0];
  d += `M ${p0.x} ${p0.y} `;

  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const m = mid(p1, p2);
    d += `Q ${p1.x} ${p1.y} ${m.x} ${m.y} `;
  }

  const secondLast = points[points.length - 2];
  const last = points[points.length - 1];
  d += `Q ${secondLast.x} ${secondLast.y} ${last.x} ${last.y}`;

  return d;
}

function computeBBox(points: Point[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) minX = minY = maxX = maxY = 0;
  return { minX, minY, maxX, maxY };
}

/** Point in polygon (ray casting). */
function pointInPoly(pt: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

/** Quick reject: bbox overlap */
function bboxOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
) {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function pointAt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function smoothTowards(prev: Point, next: Point, alpha: number): Point {
  return {
    x: prev.x + (next.x - prev.x) * alpha,
    y: prev.y + (next.y - prev.y) * alpha,
  };
}

function segmentCircleTs(a: Point, b: Point, center: Point, radius: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - center.x;
  const fy = a.y - center.y;

  const A = dx * dx + dy * dy;
  if (A < 1e-9) return [] as number[];

  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [] as number[];

  const out: number[] = [];
  const root = Math.sqrt(Math.max(0, disc));
  const t1 = (-B - root) / (2 * A);
  const t2 = (-B + root) / (2 * A);
  if (t1 >= 0 && t1 <= 1) out.push(t1);
  if (t2 >= 0 && t2 <= 1) out.push(t2);
  out.sort((x, y) => x - y);

  if (out.length <= 1) return out;

  const deduped = [out[0]];
  for (let i = 1; i < out.length; i++) {
    if (Math.abs(out[i] - deduped[deduped.length - 1]) > 1e-5) {
      deduped.push(out[i]);
    }
  }
  return deduped;
}

/**
 * Real eraser: split a stroke into runs of points that are OUTSIDE the eraser circle.
 * Returns:
 * - null if untouched
 * - [] if fully erased
 * - [ ...newStrokes ] if partially erased (may split)
 */
function splitStrokeByEraserCircle(s: Stroke, center: Point, radius: number) {
  // Quick bbox check in page coords
  const sb = {
    minX: s.bbox.minX + s.dx,
    minY: s.bbox.minY + s.dy,
    maxX: s.bbox.maxX + s.dx,
    maxY: s.bbox.maxY + s.dy,
  };
  const eb = {
    minX: center.x - radius,
    minY: center.y - radius,
    maxX: center.x + radius,
    maxY: center.y + radius,
  };
  if (!bboxOverlap(sb, eb)) return null;

  let anyErased = false;
  const runs: Point[][] = [];
  let cur: Point[] = [];

  if (s.points.length === 0) return null;

  const pagePoints = s.points.map((p) => ({ x: p.x + s.dx, y: p.y + s.dy }));

  for (let i = 0; i < pagePoints.length - 1; i++) {
    const a = pagePoints[i];
    const b = pagePoints[i + 1];
    const roots = segmentCircleTs(a, b, center, radius);
    const cuts = [0, ...roots, 1];

    const outsideIntervals: { t0: number; t1: number }[] = [];
    for (let j = 0; j < cuts.length - 1; j++) {
      const t0 = cuts[j];
      const t1 = cuts[j + 1];
      if (t1 - t0 < 1e-6) continue;
      const tm = (t0 + t1) / 2;
      const m = pointAt(a, b, tm);
      const mdx = m.x - center.x;
      const mdy = m.y - center.y;
      const outside = mdx * mdx + mdy * mdy > radius * radius;
      if (outside) outsideIntervals.push({ t0, t1 });
      else anyErased = true;
    }

    if (outsideIntervals.length === 0) {
      if (cur.length > 0) {
        runs.push(cur);
        cur = [];
      }
      continue;
    }

    if (cur.length > 0 && outsideIntervals[0].t0 > 1e-6) {
      runs.push(cur);
      cur = [];
    }

    for (let j = 0; j < outsideIntervals.length; j++) {
      const { t0, t1 } = outsideIntervals[j];
      const start = pointAt(a, b, t0);
      const end = pointAt(a, b, t1);
      const startLocal = { x: start.x - s.dx, y: start.y - s.dy };
      const endLocal = { x: end.x - s.dx, y: end.y - s.dy };

      if (cur.length === 0) cur.push(startLocal);
      else if (dist(cur[cur.length - 1], startLocal) > 1e-4) {
        runs.push(cur);
        cur = [startLocal];
      }

      if (dist(cur[cur.length - 1], endLocal) > 1e-4) cur.push(endLocal);

      if (t1 < 1 - 1e-6) {
        runs.push(cur);
        cur = [];
      }
    }
  }

  const lastPage = pagePoints[pagePoints.length - 1];
  const ldx = lastPage.x - center.x;
  const ldy = lastPage.y - center.y;
  const lastOutside = ldx * ldx + ldy * ldy > radius * radius;
  if (lastOutside) {
    const lastLocal = { x: lastPage.x - s.dx, y: lastPage.y - s.dy };
    if (cur.length === 0) cur.push(lastLocal);
    else if (dist(cur[cur.length - 1], lastLocal) > 1e-4) cur.push(lastLocal);
  } else {
    anyErased = true;
    if (cur.length > 0) {
      runs.push(cur);
      cur = [];
    }
  }

  if (cur.length > 0) runs.push(cur);

  if (!anyErased) return null;

  const next: Stroke[] = [];
  for (const pts of runs) {
    if (pts.length < MIN_POINTS_TO_SAVE) continue;

    const d = pointsToSmoothPath(pts);
    if (!d.trim()) continue;

    next.push({
      ...s,
      id: uid(),
      points: pts,
      d,
      bbox: computeBBox(pts),
    });
  }

  return next;
}

function splitStrokeByEraserPathPoints(
  s: Stroke,
  centers: Point[],
  radius: number,
) {
  if (centers.length === 0) return null;

  let parts: Stroke[] = [s];
  let changed = false;

  for (const center of centers) {
    if (parts.length === 0) break;

    const nextParts: Stroke[] = [];
    for (const part of parts) {
      const replaced = splitStrokeByEraserCircle(part, center, radius);
      if (replaced === null) nextParts.push(part);
      else {
        changed = true;
        nextParts.push(...replaced);
      }
    }
    parts = nextParts;
  }

  return changed ? parts : null;
}

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
  const pointerPageIndex = useRef<number | null>(null);
  const ctrlWheelAccum = useRef(0);

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
  const clampZoom = (z: number) => Math.max(0.5, Math.min(2.5, z));

  // Strokes + current stroke
  const [currentPath, setCurrentPath] = useState("");
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

  // Eraser cursor (outline)
  const [eraserCursor, setEraserCursor] = useState<Point | null>(null);
  const lastEraserPoint = useRef<Point | null>(null);
  const eraserDidMutate = useRef(false);
  const queuedEraserPoints = useRef<Point[]>([]);
  const eraserRafId = useRef<number | null>(null);

  // Lasso UI
  const [lassoPath, setLassoPath] = useState("");
  const lassoPoints = useRef<Point[]>([]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Drawing refs
  const isPointerDown = useRef(false);
  const currentPoints = useRef<Point[]>([]);

  // Move selection refs
  const isMovingSelection = useRef(false);
  const moveStart = useRef<Point | null>(null);
  const moveBase = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const moveDidMutate = useRef(false);

  // rAF throttling
  const rafId = useRef<number | null>(null);
  const pending = useRef(false);

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

  useNotePersistence({
    routeNoteId,
    router,
    isPointerDownRef: isPointerDown,
    pages,
    pageBackgrounds,
    currentPageIndex,
    strokes,
    emptyBackground: EMPTY_PAGE_BACKGROUND,
    resetCanvasState,
    setPages,
    setPageBackgrounds,
    setCurrentPageIndex,
    setStrokes,
    setHistory,
    setHistoryIndex,
  });

  const getLocalPagePoint = (e: any): Point | null => {
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
    if (x < 0 || y < 0 || x > PAGE_W || y > PAGE_H) return null;
    return { x, y };
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey) return;

      // Stop browser/page zoom so only note-page zoom changes.
      ev.preventDefault();

      const dy = Number(ev.deltaY ?? 0);
      if (!Number.isFinite(dy) || dy === 0) return;

      ctrlWheelAccum.current += dy;
      const stepTrigger = 48;

      while (ctrlWheelAccum.current <= -stepTrigger) {
        setZoom((z) => clampZoom(z + 0.1));
        ctrlWheelAccum.current += stepTrigger;
      }
      while (ctrlWheelAccum.current >= stepTrigger) {
        setZoom((z) => clampZoom(z - 0.1));
        ctrlWheelAccum.current -= stepTrigger;
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel as any);
    };
  }, []);

  const recomputePath = () => {
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
  };

  const startStroke = (p: Point) => {
    currentPoints.current = [p];
    recomputePath();
  };

  const extendStroke = (p: Point) => {
    const pts = currentPoints.current;
    const last = pts[pts.length - 1];

    if (!last) {
      pts.push(p);
      recomputePath();
      return;
    }

    if (dist(last, p) < MIN_DIST_PX) return;

    const smoothed = smoothTowards(last, p, STROKE_SMOOTHING_ALPHA);
    const segmentLen = dist(last, smoothed);
    const segmentStep = Math.max(1, MIN_DIST_PX * 0.75);
    const steps = Math.max(1, Math.ceil(segmentLen / segmentStep));

    for (let i = 1; i <= steps; i++) {
      pts.push(lerpPoint(last, smoothed, i / steps));
    }

    recomputePath();
  };

  const endStroke = () => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
      pending.current = false;
    }

    if (currentPoints.current.length < MIN_POINTS_TO_SAVE) {
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
  };

  const cancelStroke = () => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
      pending.current = false;
    }
    currentPoints.current = [];
    setCurrentPath("");
  };

  const eraseAtPoints = (points: Point[]) => {
    if (points.length === 0) return;
    const radius = activeWidthRef.current / 2;

    setStrokes((prev) => {
      let changed = false;
      const out: Stroke[] = [];

      for (const s of prev) {
        const replaced = splitStrokeByEraserPathPoints(s, points, radius);
        if (replaced === null) out.push(s);
        else {
          changed = true;
          out.push(...replaced);
        }
      }

      if (changed) eraserDidMutate.current = true;
      return changed ? out : prev;
    });
  };

  const flushQueuedEraser = () => {
    if (eraserRafId.current != null) {
      cancelAnimationFrame(eraserRafId.current);
      eraserRafId.current = null;
    }

    if (queuedEraserPoints.current.length === 0) return;
    const points = queuedEraserPoints.current.slice();
    queuedEraserPoints.current = [];
    eraseAtPoints(points);
  };

  const queueEraserPoints = (points: Point[]) => {
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
  };

  const eraseAtPoint = (p: Point) => {
    queueEraserPoints([p]);
  };

  // Make eraser continuous between pointer events (precision without jagginess)
  const eraseAlongSegment = (from: Point, to: Point) => {
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
  };

  const lassoToPath = (pts: Point[]) => {
    if (pts.length === 0) return "";
    let d = `M ${pts[0].x} ${pts[0].y} `;
    for (let i = 1; i < pts.length; i++) d += `L ${pts[i].x} ${pts[i].y} `;
    d += "Z";
    return d;
  };

  const startLasso = (p: Point) => {
    lassoPoints.current = [p];
    setLassoPath(lassoToPath(lassoPoints.current));
  };

  const extendLasso = (p: Point) => {
    const pts = lassoPoints.current;
    const last = pts[pts.length - 1];
    if (last && dist(last, p) < 3) return;
    pts.push(p);
    setLassoPath(lassoToPath(pts));
  };

  const finishLassoAndSelect = () => {
    const poly = lassoPoints.current;
    if (poly.length < 3) {
      setLassoPath("");
      lassoPoints.current = [];
      return;
    }

    const pb = computeBBox(poly);

    const hits: string[] = [];
    for (const s of strokes) {
      const sb = {
        minX: s.bbox.minX + s.dx,
        minY: s.bbox.minY + s.dy,
        maxX: s.bbox.maxX + s.dx,
        maxY: s.bbox.maxY + s.dy,
      };
      if (!bboxOverlap(sb, pb)) continue;

      let inside = false;
      for (let i = 0; i < s.points.length; i += 2) {
        const p = s.points[i];
        const tp = { x: p.x + s.dx, y: p.y + s.dy };
        if (pointInPoly(tp, poly)) {
          inside = true;
          break;
        }
      }
      if (inside) hits.push(s.id);
    }

    setSelectedIds(hits);
    setLassoPath("");
    lassoPoints.current = [];
  };

  const startMoveSelection = (p: Point) => {
    if (selectedIds.length === 0) return;
    isMovingSelection.current = true;
    moveStart.current = p;
    moveDidMutate.current = false;
    const base = new Map<string, { dx: number; dy: number }>();
    for (const s of strokes) {
      if (selectedSet.has(s.id)) base.set(s.id, { dx: s.dx, dy: s.dy });
    }
    moveBase.current = base;
  };

  const moveSelectionTo = (p: Point) => {
    if (!isMovingSelection.current || !moveStart.current) return;
    const dx = p.x - moveStart.current.x;
    const dy = p.y - moveStart.current.y;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01)
      moveDidMutate.current = true;

    setStrokes((prev) =>
      prev.map((s) => {
        if (!selectedSet.has(s.id)) return s;
        const b = moveBase.current.get(s.id);
        if (!b) return s;
        return { ...s, dx: b.dx + dx, dy: b.dy + dy };
      }),
    );
  };

  const endMoveSelection = () => {
    if (isMovingSelection.current && moveDidMutate.current) {
      pushHistory(strokesRef.current);
    }
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
    moveDidMutate.current = false;
  };

  const deleteSelection = () => {
    if (selectedIds.length === 0) return;
    setStrokes((prev) => {
      const updated = prev.filter((s) => !selectedSet.has(s.id));
      pushHistory(updated);
      return updated;
    });
    setSelectedIds([]);
  };

  const resetForPageSwitch = () => {
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
  };

  const handleSelectPage = (index: number) => {
    selectPage(index, resetForPageSwitch);
  };

  const handleAddPageBelowCurrent = () => {
    addPageBelowCurrent(resetForPageSwitch);
  };

  const handleRemoveCurrentPage = () => {
    removeCurrentPage(resetForPageSwitch);
  };

  const exportAsPdf = () => {
    exportNoteAsPdf({
      pages,
      pageBackgrounds,
      currentPageIndex,
      activePageStrokes: strokes,
    });
  };

  // Intentionally memoized around state that changes handler behavior. This avoids
  // recreating page handler objects during render-only updates like currentPath.
  const pageHandlersByPage = useMemo(
    () =>
      pages.map((_, pageIndex) => {
        if (Platform.OS === "web") {
          return {
            onPointerDown: (e: any) => {
              if (
                e?.nativeEvent?.button != null &&
                e.nativeEvent.button !== 0
              ) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages, tool, selectedIds, currentPageIndex, zoom, strokes, selectedSet],
  );

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
        currentPageIndex={currentPageIndex}
        pageCount={pages.length}
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
            setSelectedIds([]);
            setLassoPath("");
            setEraserCursor(null);
            lastEraserPoint.current = null;
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
            setSelectedIds([]);
            setLassoPath("");
          }
          lastEraserTapMs.current = now;
        }}
        onLassoPress={() => {
          setTool("lasso");
          setLassoPath("");
          lassoPoints.current = [];
          setEraserCursor(null);
          lastEraserPoint.current = null;
        }}
        onColorPress={() => setIsColorModalOpen(true)}
        onPagesPress={() => setIsPagesModalOpen(true)}
        onExportPdf={exportAsPdf}
        onDeleteSelection={deleteSelection}
        onZoomOut={() => setZoom((z) => clampZoom(z - 0.1))}
        onZoomReset={() => setZoom(1)}
        onZoomIn={() => setZoom((z) => clampZoom(z + 0.1))}
        onUndo={undo}
        onRedo={redo}
      />

      {/* Workspace: stacked physical pages */}
      <View
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
          style={
            Platform.OS === "web"
              ? ({
                  minHeight: "100%",
                  minWidth: "100%",
                  padding: 24,
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  gap: 26,
                } as any)
              : {
                  minHeight: "100%",
                  padding: 24,
                  justifyContent: "flex-start",
                  alignItems: "center",
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
                pageBackground={pageBackground}
                renderStrokes={renderStrokes}
                selectedSet={selectedSet}
                currentPath={currentPath}
                activeColor={activeColor}
                activeWidth={activeWidth}
                lassoPath={lassoPath}
                tool={tool}
                eraserCursor={eraserCursor}
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
