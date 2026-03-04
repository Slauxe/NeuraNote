import Slider from "@react-native-community/slider";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Eraser,
  LassoSelect,
  MoreVertical,
  Palette,
  PenLine,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
// perfect-freehand provides a variable-width stroke polygon generator
// we import it here and generate a filled polygon path for new strokes.
// Note: you still need to `npm install perfect-freehand` or `yarn add perfect-freehand`.
import getStroke from "perfect-freehand";

import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { createNote, loadNote, saveNote } from "../../lib/notesStorage";

type Point = { x: number; y: number };

type Stroke = {
  id: string;
  points: Point[];
  d: string;
  // optional filled polygon path from perfect-freehand
  pf?: string;
  w: number;
  c: string;
  dx: number;
  dy: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

// Theme
const WORKSPACE_BG = "#0B1026"; // deep violet/blue
const TOPBAR_BG = "rgba(15, 22, 56, 0.92)";
const TOPBAR_BORDER = "rgba(255,255,255,0.10)";
const BTN_BG = "rgba(255,255,255,0.10)";
const BTN_BG_ACTIVE = "#FFFFFF";
const BTN_BORDER = "rgba(255,255,255,0.14)";

const PAGE_BG = "#ffffff";
const PAGE_BORDER = "rgba(255,255,255,0.12)";

const ERASER_MULT = 10;

const MIN_DIST_PX = 2;
const MIN_POINTS_TO_SAVE = 3;

// Letter page in "page units"
const PAGE_W = 850; // 8.5 * 100
const PAGE_H = 1100; // 11 * 100

const SIZE_OPTIONS: Array<{ label: string; width: number }> = [
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

/**
 * Convert a list of `Point` to a filled polygon SVG path using perfect-freehand.
 * Returns an empty string on failure.
 */
function getPfPath(points: Point[], size: number) {
  try {
    if (!points || points.length === 0) return "";
    const input = points.map((p) => [p.x, p.y]);
    // generate the variable-width polygon (array of [x,y])
    const stroke = getStroke(input as any, { size });
    if (!stroke || stroke.length === 0) return "";
    let d = `M ${stroke[0][0]} ${stroke[0][1]}`;
    for (let i = 1; i < stroke.length; i++) {
      d += ` L ${stroke[i][0]} ${stroke[i][1]}`;
    }
    d += " Z";
    return d;
  } catch (e) {
    return "";
  }
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

function colorFromHue(h: number) {
  return `hsl(${Math.round(h)}, 100%, 50%)`;
}

function HueBar({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#ff0000" />
          <Stop offset="16.6%" stopColor="#ffff00" />
          <Stop offset="33.3%" stopColor="#00ff00" />
          <Stop offset="50%" stopColor="#00ffff" />
          <Stop offset="66.6%" stopColor="#0000ff" />
          <Stop offset="83.3%" stopColor="#ff00ff" />
          <Stop offset="100%" stopColor="#ff0000" />
        </LinearGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx={height / 2}
        fill="url(#hue)"
      />
    </Svg>
  );
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

    const outsideIntervals: Array<{ t0: number; t1: number }> = [];
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

// Small icon-only button
function IconButton({
  onPress,
  disabled,
  active,
  children,
  bgOverride,
  borderOverride,
}: {
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  bgOverride?: string;
  borderOverride?: string;
}) {
  const bg = bgOverride ?? (active ? BTN_BG_ACTIVE : BTN_BG);
  const border = borderOverride ?? BTN_BORDER;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 46,
        height: 46,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </Pressable>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeNoteId(x: unknown): string | null {
  if (typeof x === "string" && x.trim()) return x;
  if (Array.isArray(x) && typeof x[0] === "string" && x[0].trim()) return x[0];
  return null;
}

function sanitizeStroke(raw: any): Stroke | null {
  if (!raw) return null;
  const points = Array.isArray(raw.points) ? raw.points : [];
  if (points.length < 1) return null;

  const safePoints: Point[] = points
    .map((p: any) => ({ x: Number(p?.x), y: Number(p?.y) }))
    .filter((p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (safePoints.length < 1) return null;

  const d =
    typeof raw.d === "string" && raw.d.trim().length > 0
      ? raw.d
      : pointsToSmoothPath(safePoints);

  const bbox =
    raw.bbox &&
    Number.isFinite(raw.bbox.minX) &&
    Number.isFinite(raw.bbox.minY) &&
    Number.isFinite(raw.bbox.maxX) &&
    Number.isFinite(raw.bbox.maxY)
      ? raw.bbox
      : computeBBox(safePoints);

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    points: safePoints,
    d,
    w: Number.isFinite(raw.w) ? raw.w : 4,
    c: typeof raw.c === "string" ? raw.c : "#111111",
    dx: Number.isFinite(raw.dx) ? raw.dx : 0,
    dy: Number.isFinite(raw.dy) ? raw.dy : 0,
    bbox,
  };
}

function normalizeDocToPages(rawDoc: any): {
  pages: Stroke[][];
  currentPageIndex: number;
} {
  const rawPages = Array.isArray(rawDoc?.pages) ? rawDoc.pages : null;

  let pages: Stroke[][] = [];
  if (rawPages && rawPages.length > 0) {
    pages = rawPages.map(
      (pg: any) =>
        (Array.isArray(pg?.strokes) ? pg.strokes : [])
          .map(sanitizeStroke)
          .filter(Boolean) as Stroke[],
    );
  } else {
    const rawStrokes =
      (rawDoc && Array.isArray(rawDoc.strokes) && rawDoc.strokes) || [];
    pages = [rawStrokes.map(sanitizeStroke).filter(Boolean) as Stroke[]];
  }

  if (pages.length === 0) pages = [[]];

  const rawIndex = Number(rawDoc?.currentPageIndex);
  const currentPageIndex = Number.isFinite(rawIndex)
    ? Math.max(0, Math.min(pages.length - 1, Math.trunc(rawIndex)))
    : 0;

  return { pages, currentPageIndex };
}

function buildDocFromPages(pages: Stroke[][], currentPageIndex: number) {
  const safePages = pages.length > 0 ? pages : [[]];
  const clampedIndex = Math.max(
    0,
    Math.min(safePages.length - 1, currentPageIndex),
  );
  return {
    strokes: safePages[clampedIndex] ?? [],
    pages: safePages.map((p, i) => ({ id: `page-${i + 1}`, strokes: p })),
    currentPageIndex: clampedIndex,
  };
}

function PageThumbnail({
  strokes,
  selected,
  label,
}: {
  strokes: Stroke[];
  selected: boolean;
  label: string;
}) {
  const TW = 92;
  const TH = Math.round((PAGE_H / PAGE_W) * TW);
  const scale = TW / PAGE_W;

  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: TW + 8,
          height: TH + 8,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: selected ? "#fff" : "rgba(255,255,255,0.20)",
          backgroundColor: selected
            ? "rgba(255,255,255,0.14)"
            : "rgba(255,255,255,0.06)",
        }}
      >
        <Svg width={TW} height={TH}>
          <Rect x={0} y={0} width={TW} height={TH} rx={7} fill="#fff" />
          <G transform={`scale(${scale})`}>
            {strokes.map((s) => (
              <G key={s.id} transform={`translate(${s.dx} ${s.dy})`}>
                <Path d={s.d} stroke={s.c} strokeWidth={s.w} fill="none" />
              </G>
            ))}
          </G>
        </Svg>
      </View>
      <Text
        style={{
          color: selected ? "#fff" : "rgba(255,255,255,0.80)",
          fontSize: 11,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function Index() {
  // ---- STEP 3: note routing + persistence
  // ---- STEP 3: note routing + persistence
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeNoteId = normalizeNoteId((params as any)?.noteId);

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // Prevent autosave while we are loading a note
  const [hydrating, setHydrating] = useState(false);

  // Debounced autosave timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tool
  const [tool, setTool] = useState<"pen" | "eraser" | "lasso">("pen");

  // Keep activeNoteId synced with the route param
  useEffect(() => {
    if (routeNoteId) setActiveNoteId(routeNoteId);
  }, [routeNoteId]);

  // Toolbar drag + orientation
  const [toolbarOrientation, setToolbarOrientation] = useState<
    "horizontal" | "vertical"
  >("horizontal");
  const [isToolbarModeOpen, setIsToolbarModeOpen] = useState(false);

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [toolbarSize, setToolbarSize] = useState({ w: 0, h: 0 });

  // toolbar position (absolute)
  const [toolbarPos, setToolbarPos] = useState({ x: 12, y: 12 });

  const toolbarPosRef = useRef(toolbarPos);
  useEffect(() => {
    toolbarPosRef.current = toolbarPos;
  }, [toolbarPos]);

  // double-tap on the 3-dot handle
  const lastHandleTapMs = useRef<number>(0);
  const movedDuringDrag = useRef(false);
  const toolbarDragStart = useRef<{ x: number; y: number } | null>(null);
  const pointerPageIndex = useRef<number | null>(null);

  // Shared size
  const [sizeIndex, setSizeIndex] = useState(0);
  const penWidth = SIZE_OPTIONS[sizeIndex].width;
  const [isSizeModalOpen, setIsSizeModalOpen] = useState(false);

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
  const activeWidth = tool === "eraser" ? penWidth * ERASER_MULT : penWidth;
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
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [pages, setPages] = useState<Stroke[][]>([[]]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

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

  // Undo/Redo history
  const [history, setHistory] = useState<Stroke[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushHistory = (newStrokes: Stroke[]) => {
    const newIndex = historyIndex + 1;
    setHistory((prev) => [...prev.slice(0, newIndex), newStrokes]);
    setHistoryIndex(newIndex);
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

  // --- Load strokes when we open/switch notes
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!activeNoteId) return;

      setHydrating(true);

      try {
        const data = await loadNote(activeNoteId);
        if (cancelled) return;

        const normalized = normalizeDocToPages(data?.doc);
        const loadedStrokes =
          normalized.pages[normalized.currentPageIndex] ?? [];
        setPages(normalized.pages);
        setCurrentPageIndex(normalized.currentPageIndex);
        setStrokes(loadedStrokes);
        setHistory([loadedStrokes]);
        setHistoryIndex(0);

        // Reset transient UI state when switching notes
        setSelectedIds([]);
        setLassoPath("");
        lassoPoints.current = [];
        setCurrentPath("");
        currentPoints.current = [];
        setEraserCursor(null);
        lastEraserPoint.current = null;
        isPointerDown.current = false;
      } finally {
        if (!cancelled) setHydrating(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [activeNoteId]);

  // --- Autosave strokes (debounced)
  useEffect(() => {
    if (!activeNoteId) return;
    if (hydrating) return;

    // Optional: avoid saving mid-stroke
    if (isPointerDown.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      const doc = buildDocFromPages(pages, currentPageIndex);
      saveNote(activeNoteId, { doc }).catch(() => {});
    }, 450);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activeNoteId, strokes, hydrating, pages, currentPageIndex]);

  // Eraser cursor (outline)
  const [eraserCursor, setEraserCursor] = useState<Point | null>(null);
  const lastEraserPoint = useRef<Point | null>(null);
  const eraserSessionStart = useRef<Stroke[] | null>(null);

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
  const moveSessionStart = useRef<Stroke[] | null>(null);

  // rAF throttling (web)
  const rafId = useRef<number | null>(null);
  const pending = useRef(false);

  // ---- Toolbar constraints
  const clampToolbarPos = (x: number, y: number) => {
    const maxX = Math.max(0, containerSize.w - toolbarSize.w);
    const maxY = Math.max(0, containerSize.h - toolbarSize.h);
    return { x: clamp(x, 0, maxX), y: clamp(y, 0, maxY) };
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

  // ---- STEP 3: load note when noteId changes (and auto-create if missing)
  useEffect(() => {
    let cancelled = false;

    const resetCanvasState = () => {
      // stop any in-flight draw
      isPointerDown.current = false;
      currentPoints.current = [];
      setCurrentPath("");

      // clear selection/lasso/eraser preview
      setSelectedIds([]);
      setLassoPath("");
      lassoPoints.current = [];
      setEraserCursor(null);
      lastEraserPoint.current = null;
      isMovingSelection.current = false;
      moveStart.current = null;
      moveBase.current = new Map();
    };

    const run = async () => {
      // If no noteId in route, create one and replace route
      if (!routeNoteId) {
        try {
          const newId = await createNote("No name");
          if (cancelled) return;
          router.replace({
            pathname: "/(tabs)",
            params: { noteId: newId },
          });
        } catch {
          // If create fails, just stay
        }
        return;
      }

      // flush any pending save from previous note
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      setActiveNoteId(routeNoteId);
      setHydrating(true);

      // Clear immediately so you don't see previous note while loading
      resetCanvasState();
      setStrokes([]);

      try {
        const data: any = await loadNote(routeNoteId);
        if (cancelled) return;

        const normalized = normalizeDocToPages(data?.doc);
        const pageStrokes = normalized.pages[normalized.currentPageIndex] ?? [];
        setPages(normalized.pages);
        setCurrentPageIndex(normalized.currentPageIndex);
        setStrokes(pageStrokes);
        setHistory([pageStrokes]);
        setHistoryIndex(0);
      } catch {
        // If load fails, keep it empty
        if (!cancelled) {
          setPages([[]]);
          setCurrentPageIndex(0);
          setStrokes([]);
          setHistory([[]]);
          setHistoryIndex(0);
        }
      } finally {
        setHydrating(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [routeNoteId, router]);

  // ---- STEP 3: autosave strokes (debounced)
  useEffect(() => {
    if (!activeNoteId) return;
    if (hydrating) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      // Don’t save if we’re mid-stroke (optional)
      // If you want to save mid-stroke too, remove this guard.
      if (hydrating) return;

      const doc = buildDocFromPages(pages, currentPageIndex);
      saveNote(activeNoteId, { doc }).catch(() => {});
    }, 450);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [strokes, activeNoteId, hydrating, pages, currentPageIndex]);

  const getLocalPagePoint = (e: any): Point | null => {
    const ne = e?.nativeEvent ?? {};
    let lx =
      typeof ne.locationX === "number"
        ? ne.locationX
        : typeof ne.offsetX === "number"
          ? ne.offsetX
          : null;
    let ly =
      typeof ne.locationY === "number"
        ? ne.locationY
        : typeof ne.offsetY === "number"
          ? ne.offsetY
          : null;

    if ((lx == null || ly == null) && Platform.OS === "web") {
      const targetRect = e?.currentTarget?.getBoundingClientRect?.();
      if (
        targetRect &&
        typeof ne.clientX === "number" &&
        typeof ne.clientY === "number"
      ) {
        lx = ne.clientX - targetRect.left;
        ly = ne.clientY - targetRect.top;
      }
    }

    if (lx == null || ly == null) return null;

    const x = lx / zoom;
    const y = ly / zoom;
    if (x < 0 || y < 0 || x > PAGE_W || y > PAGE_H) return null;
    return { x, y };
  };

  const recomputePath = () => {
    if (Platform.OS === "web") {
      if (pending.current) return;
      pending.current = true;
      rafId.current = requestAnimationFrame(() => {
        pending.current = false;
        setCurrentPath(pointsToSmoothPath(currentPoints.current));
      });
      return;
    }
    setCurrentPath(pointsToSmoothPath(currentPoints.current));
  };

  const startStroke = (p: Point) => {
    currentPoints.current = [p];
    recomputePath();
  };

  const extendStroke = (p: Point) => {
    const pts = currentPoints.current;
    const last = pts[pts.length - 1];
    if (last && dist(last, p) < MIN_DIST_PX) return;
    pts.push(p);
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

      return changed ? out : prev;
    });
  };

  const eraseAtPoint = (p: Point) => {
    eraseAtPoints([p]);
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
    eraseAtPoints(samples);
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
    moveSessionStart.current = strokes.map((s) => ({ ...s }));
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
    if (isMovingSelection.current && moveSessionStart.current) {
      setStrokes((prev) => {
        if (JSON.stringify(prev) !== JSON.stringify(moveSessionStart.current)) {
          pushHistory(prev);
        }
        return prev;
      });
    }
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
    moveSessionStart.current = null;
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
    setSelectedIds([]);
    setLassoPath("");
    lassoPoints.current = [];
    setEraserCursor(null);
    lastEraserPoint.current = null;
    eraserSessionStart.current = null;
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
    moveSessionStart.current = null;
  };

  const selectPage = (index: number) => {
    const safePages = pages.length > 0 ? pages : [[]];
    const nextIndex = Math.max(0, Math.min(safePages.length - 1, index));
    const nextStrokes = safePages[nextIndex] ?? [];

    resetForPageSwitch();
    setCurrentPageIndex(nextIndex);
    setStrokes(nextStrokes);
    setHistory([nextStrokes]);
    setHistoryIndex(0);
  };

  const addPageBelowCurrent = () => {
    const safePages = pages.length > 0 ? pages : [[]];
    const insertAt = Math.max(
      0,
      Math.min(safePages.length, currentPageIndex + 1),
    );
    const nextPages = [
      ...safePages.slice(0, insertAt),
      [],
      ...safePages.slice(insertAt),
    ];

    resetForPageSwitch();
    setPages(nextPages);
    setCurrentPageIndex(insertAt);
    setStrokes([]);
    setHistory([[]]);
    setHistoryIndex(0);
  };

  const removeCurrentPage = () => {
    const safePages = pages.length > 0 ? pages : [[]];

    if (safePages.length <= 1) {
      resetForPageSwitch();
      setPages([[]]);
      setCurrentPageIndex(0);
      setStrokes([]);
      setHistory([[]]);
      setHistoryIndex(0);
      return;
    }

    const nextPages = safePages.filter((_, i) => i !== currentPageIndex);
    const nextIndex = Math.max(
      0,
      Math.min(nextPages.length - 1, currentPageIndex),
    );
    const nextStrokes = nextPages[nextIndex] ?? [];

    resetForPageSwitch();
    setPages(nextPages);
    setCurrentPageIndex(nextIndex);
    setStrokes(nextStrokes);
    setHistory([nextStrokes]);
    setHistoryIndex(0);
  };

  const movePage = (from: number, delta: -1 | 1) => {
    const safePages = pages.length > 0 ? pages : [[]];
    const to = from + delta;
    if (from < 0 || from >= safePages.length) return;
    if (to < 0 || to >= safePages.length) return;

    const nextPages = safePages.slice();
    const [moved] = nextPages.splice(from, 1);
    nextPages.splice(to, 0, moved);

    let nextCurrentIndex = currentPageIndex;
    if (currentPageIndex === from) nextCurrentIndex = to;
    else if (from < currentPageIndex && to >= currentPageIndex)
      nextCurrentIndex = currentPageIndex - 1;
    else if (from > currentPageIndex && to <= currentPageIndex)
      nextCurrentIndex = currentPageIndex + 1;

    setPages(nextPages);
    setCurrentPageIndex(nextCurrentIndex);
  };

  // Pointer/responder handlers scoped to one physical page
  const getPageHandlers = (pageIndex: number) => {
    if (Platform.OS === "web") {
      return {
        onPointerDown: (e: any) => {
          if (e?.nativeEvent?.button != null && e.nativeEvent.button !== 0)
            return;

          e?.preventDefault?.();
          e?.stopPropagation?.();

          const p = getLocalPagePoint(e);
          if (!p) {
            if (tool === "lasso") setSelectedIds([]);
            return;
          }

          if (pageIndex !== currentPageIndex) selectPage(pageIndex);

          pointerPageIndex.current = pageIndex;
          isPointerDown.current = true;
          e?.nativeEvent?.target?.setPointerCapture?.(e.nativeEvent.pointerId);

          if (tool === "lasso") {
            if (selectedIds.length > 0) startMoveSelection(p);
            else startLasso(p);
            return;
          }

          if (tool === "eraser") {
            setEraserCursor(p);
            eraserSessionStart.current = strokes.map((s) => ({ ...s }));
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
            if (
              eraserSessionStart.current &&
              JSON.stringify(strokes) !==
                JSON.stringify(eraserSessionStart.current)
            ) {
              pushHistory(strokes);
            }
            setEraserCursor(null);
            lastEraserPoint.current = null;
            eraserSessionStart.current = null;
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
          setEraserCursor(null);
          lastEraserPoint.current = null;
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

        if (pageIndex !== currentPageIndex) selectPage(pageIndex);

        isPointerDown.current = true;
        pointerPageIndex.current = pageIndex;

        if (tool === "lasso") {
          if (selectedIds.length > 0) startMoveSelection(p);
          else startLasso(p);
          return;
        }

        if (tool === "eraser") {
          setEraserCursor(p);
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
          setEraserCursor(null);
          lastEraserPoint.current = null;
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
        cancelStroke();
      },
    };
  };

  const iconOn = "#0B1026";
  const iconOff = "rgba(255,255,255,0.92)";

  const toolbarRow =
    toolbarOrientation === "horizontal"
      ? ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        } as any)
      : ({
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        } as any);

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
      {/* Floating, draggable toolbar */}
      <View
        style={{
          position: "absolute",
          left: toolbarPos.x,
          top: toolbarPos.y,
          zIndex: 50,
        }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setToolbarSize({ w: width, h: height });
          // clamp in case size changed
          setToolbarPos((p) => clampToolbarPos(p.x, p.y));
        }}
        pointerEvents="box-none"
      >
        <View
          style={[
            {
              padding: 10,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: TOPBAR_BORDER,
              backgroundColor: TOPBAR_BG,
            },
            toolbarRow,
          ]}
        >
          {/* 3-dot drag handle (drag to move, double-tap to open mode modal) */}
          <View
            {...handlePanResponder.panHandlers}
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <MoreVertical size={20} color={iconOff} />
          </View>

          <IconButton
            onPress={() => {
              setTool("pen");
              setSelectedIds([]);
              setLassoPath("");
              setEraserCursor(null);
              lastEraserPoint.current = null;
            }}
            active={tool === "pen"}
          >
            <PenLine size={20} color={tool === "pen" ? iconOn : iconOff} />
          </IconButton>

          <IconButton
            onPress={() => {
              setTool("eraser");
              setSelectedIds([]);
              setLassoPath("");
            }}
            active={tool === "eraser"}
          >
            <Eraser size={20} color={tool === "eraser" ? iconOn : iconOff} />
          </IconButton>

          <IconButton
            onPress={() => {
              setTool("lasso");
              setLassoPath("");
              lassoPoints.current = [];
              setEraserCursor(null);
              lastEraserPoint.current = null;
            }}
            active={tool === "lasso"}
          >
            <LassoSelect
              size={20}
              color={tool === "lasso" ? iconOn : iconOff}
            />
          </IconButton>

          <IconButton onPress={() => setIsSizeModalOpen(true)}>
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              <SlidersHorizontal size={20} color={iconOff} />
              <View
                style={{
                  position: "absolute",
                  right: -10,
                  top: -10,
                  minWidth: 22,
                  height: 22,
                  paddingHorizontal: 6,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.18)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.20)",
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 12, fontWeight: "900" }}
                >
                  {SIZE_OPTIONS[sizeIndex].label}
                </Text>
              </View>
            </View>
          </IconButton>

          <IconButton
            onPress={() => setIsColorModalOpen(true)}
            disabled={tool === "eraser"}
            bgOverride={penColor}
            borderOverride={"rgba(255,255,255,0.30)"}
          >
            <Palette size={20} color={"#ffffff"} />
          </IconButton>

          <IconButton onPress={() => setIsPagesModalOpen(true)}>
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              <Text
                style={{
                  color: iconOff,
                  fontWeight: "900",
                  fontSize: 12,
                  lineHeight: 14,
                }}
              >
                Pages
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.75)",
                  fontSize: 10,
                  lineHeight: 12,
                }}
              >
                {currentPageIndex + 1}/{Math.max(1, pages.length)}
              </Text>
            </View>
          </IconButton>

          {tool === "lasso" && (
            <IconButton
              onPress={deleteSelection}
              disabled={selectedIds.length === 0}
              bgOverride={selectedIds.length === 0 ? BTN_BG : "#ff3b30"}
              borderOverride={
                selectedIds.length === 0 ? BTN_BORDER : "rgba(255,255,255,0.22)"
              }
            >
              <Trash2
                size={20}
                color={selectedIds.length === 0 ? iconOff : "#fff"}
              />
            </IconButton>
          )}

          {/* Zoom controls (compact) */}
          <View
            style={
              toolbarOrientation === "horizontal"
                ? ({ flexDirection: "row", gap: 8, marginLeft: 6 } as any)
                : ({ flexDirection: "column", gap: 8, marginTop: 6 } as any)
            }
          >
            <Pressable
              onPress={() => setZoom((z) => clampZoom(z - 0.1))}
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: BTN_BG,
                borderWidth: 1,
                borderColor: BTN_BORDER,
              }}
            >
              <Text style={{ color: iconOff, fontWeight: "900", fontSize: 18 }}>
                −
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setZoom(1)}
              style={{
                height: 46,
                paddingHorizontal: 14,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: BTN_BG,
                borderWidth: 1,
                borderColor: BTN_BORDER,
              }}
            >
              <Text style={{ color: iconOff, fontWeight: "900" }}>
                {Math.round(zoom * 100)}%
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setZoom((z) => clampZoom(z + 0.1))}
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: BTN_BG,
                borderWidth: 1,
                borderColor: BTN_BORDER,
              }}
            >
              <Text style={{ color: iconOff, fontWeight: "900", fontSize: 18 }}>
                +
              </Text>
            </Pressable>
          </View>

          {/* Undo/Redo controls */}
          <View
            style={
              toolbarOrientation === "horizontal"
                ? ({ flexDirection: "row", gap: 8, marginLeft: 6 } as any)
                : ({ flexDirection: "column", gap: 8, marginTop: 6 } as any)
            }
          >
            <IconButton onPress={undo} disabled={historyIndex <= 0}>
              <RotateCcw
                size={20}
                color={historyIndex > 0 ? iconOff : "rgba(255,255,255,0.4)"}
              />
            </IconButton>

            <IconButton
              onPress={redo}
              disabled={historyIndex >= history.length - 1}
            >
              <RotateCw
                size={20}
                color={
                  historyIndex < history.length - 1
                    ? iconOff
                    : "rgba(255,255,255,0.4)"
                }
              />
            </IconButton>
          </View>
        </View>
      </View>

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
            return (
              <View
                key={`page-${pageIndex}`}
                style={
                  {
                    width: PAGE_W * zoom,
                    height: PAGE_H * zoom,
                    backgroundColor: PAGE_BG,
                    borderWidth: pageIsActive ? 2 : 1,
                    borderColor: pageIsActive ? "#9EC5FF" : PAGE_BORDER,
                    borderRadius: 10,
                    overflow: "hidden",
                    shadowColor: "#000",
                    shadowOpacity: 0.25,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 10 },
                    boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
                    touchAction: "none",
                    userSelect: "none",
                  } as any
                }
                {...(getPageHandlers(pageIndex) as any)}
              >
                <View
                  style={
                    {
                      width: PAGE_W,
                      height: PAGE_H,
                      transform: [{ scale: zoom }],
                      transformOrigin: "top left",
                    } as any
                  }
                >
                  <Svg width={PAGE_W} height={PAGE_H} pointerEvents="none">
                    {renderStrokes.map((s) => {
                      const selected = pageIsActive && selectedSet.has(s.id);
                      return (
                        <G key={s.id} transform={`translate(${s.dx} ${s.dy})`}>
                          {selected ? (
                            <Path
                              d={s.d}
                              stroke="rgba(0,122,255,0.35)"
                              strokeWidth={s.w + 6}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              vectorEffect="non-scaling-stroke"
                            />
                          ) : null}
                          <Path
                            d={s.d}
                            stroke={s.c}
                            strokeWidth={s.w}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        </G>
                      );
                    })}

                    {pageIsActive && currentPath ? (
                      <Path
                        d={currentPath}
                        stroke={activeColor}
                        strokeWidth={activeWidth}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}

                    {pageIsActive && lassoPath ? (
                      <Path
                        d={lassoPath}
                        stroke="rgba(0,0,0,0.65)"
                        strokeWidth={2}
                        fill="rgba(0,0,0,0.05)"
                        strokeDasharray="6 6"
                      />
                    ) : null}

                    {pageIsActive && tool === "eraser" && eraserCursor ? (
                      <Circle
                        cx={eraserCursor.x}
                        cy={eraserCursor.y}
                        r={eraserRadius}
                        stroke="rgba(0,0,0,0.45)"
                        strokeWidth={2}
                        fill="rgba(255,255,255,0.18)"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                  </Svg>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Toolbar mode modal (opened by double-tap on 3-dot handle) */}
      <Modal
        visible={isToolbarModeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsToolbarModeOpen(false)}
      >
        <Pressable
          onPress={() => setIsToolbarModeOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              alignSelf: "center",
              width: 320,
              maxWidth: "100%",
              backgroundColor: "#0F1638",
              borderRadius: 18,
              padding: 16,
              gap: 12,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#fff" }}>
              Toolbar layout
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  setToolbarOrientation("horizontal");
                  setIsToolbarModeOpen(false);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor:
                    toolbarOrientation === "horizontal"
                      ? "#fff"
                      : "rgba(255,255,255,0.18)",
                  backgroundColor:
                    toolbarOrientation === "horizontal"
                      ? "rgba(255,255,255,0.14)"
                      : "rgba(255,255,255,0.06)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  Horizontal
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setToolbarOrientation("vertical");
                  setIsToolbarModeOpen(false);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor:
                    toolbarOrientation === "vertical"
                      ? "#fff"
                      : "rgba(255,255,255,0.18)",
                  backgroundColor:
                    toolbarOrientation === "vertical"
                      ? "rgba(255,255,255,0.14)"
                      : "rgba(255,255,255,0.06)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  Vertical
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setIsToolbarModeOpen(false)}
              style={{
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.10)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pages modal */}
      <Modal
        visible={isPagesModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPagesModalOpen(false)}
      >
        <Pressable
          onPress={() => setIsPagesModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: "#0F1638",
              borderRadius: 18,
              padding: 16,
              gap: 12,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              alignSelf: "center",
              width: 420,
              maxWidth: "100%",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#fff" }}>
              Pages
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
              Current page {currentPageIndex + 1} of {Math.max(1, pages.length)}
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={addPageBelowCurrent}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.20)",
                  backgroundColor: "rgba(255,255,255,0.10)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  Add Below
                </Text>
              </Pressable>

              <Pressable
                onPress={removeCurrentPage}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.20)",
                  backgroundColor:
                    pages.length <= 1 ? "rgba(255,255,255,0.06)" : "#ff3b30",
                  alignItems: "center",
                  opacity: pages.length <= 1 ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  Remove Current
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 360 }}
              contentContainerStyle={{ gap: 10, paddingBottom: 2 }}
            >
              {pages.map((pg, idx) => {
                const selected = idx === currentPageIndex;
                return (
                  <View
                    key={`page-row-${idx}`}
                    style={{
                      flexDirection: "row",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <Pressable
                      onPress={() => selectPage(idx)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: selected
                          ? "#fff"
                          : "rgba(255,255,255,0.18)",
                        backgroundColor: selected
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(255,255,255,0.06)",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <PageThumbnail
                          strokes={pg}
                          selected={selected}
                          label={`Page ${idx + 1}`}
                        />
                        <Text style={{ color: "#fff", fontWeight: "800" }}>
                          {selected ? "Current" : "Select"}
                        </Text>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => movePage(idx, -1)}
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.18)",
                        backgroundColor:
                          idx === 0
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(255,255,255,0.08)",
                        opacity: idx === 0 ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "900" }}>
                        ↑
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => movePage(idx, 1)}
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.18)",
                        backgroundColor:
                          idx === pages.length - 1
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(255,255,255,0.08)",
                        opacity: idx === pages.length - 1 ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "900" }}>
                        ↓
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => setIsPagesModalOpen(false)}
              style={{
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.10)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Size modal */}
      <Modal
        visible={isSizeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSizeModalOpen(false)}
      >
        <Pressable
          onPress={() => setIsSizeModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: "#0F1638",
              borderRadius: 18,
              padding: 16,
              gap: 12,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#fff" }}>
              Select size (Pen/Eraser)
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              {SIZE_OPTIONS.map((opt, idx) => {
                const selected = idx === sizeIndex;
                return (
                  <Pressable
                    key={opt.label}
                    onPress={() => {
                      setSizeIndex(idx);
                      setIsSizeModalOpen(false);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: selected ? "#fff" : "rgba(255,255,255,0.18)",
                      backgroundColor: selected
                        ? "rgba(255,255,255,0.14)"
                        : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900" }}>
                      {opt.label}
                    </Text>
                    <Text
                      style={{ color: "rgba(255,255,255,0.70)", fontSize: 12 }}
                    >
                      Pen {opt.width}px • Erase{" "}
                      {Math.round(opt.width * ERASER_MULT)}px
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => setIsSizeModalOpen(false)}
              style={{
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.10)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Color modal (Hue slider + slots) */}
      <Modal
        visible={isColorModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsColorModalOpen(false)}
      >
        <Pressable
          onPress={() => setIsColorModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            alignItems: "flex-end",
            justifyContent: "flex-start",
            paddingTop: 60,
            paddingRight: 16,
            paddingLeft: 16,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: 340,
              maxWidth: "100%",
              backgroundColor: "#141414",
              borderRadius: 18,
              padding: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>
                Color
              </Text>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => {
                    const firstEmpty = colorSlots.findIndex((c) => !c);
                    const target = firstEmpty === -1 ? 0 : firstEmpty;
                    setColorSlots((prev) => {
                      const next = [...prev];
                      next[target] = penColor;
                      return next;
                    });
                    setActiveSlotIndex(target);
                  }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}
                  >
                    +
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setIsColorModalOpen(false)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}
                  >
                    ×
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
                  Hue
                </Text>

                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: penColor,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.25)",
                  }}
                />
              </View>

              <View
                style={{
                  height: 28,
                  borderRadius: 14,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                  }}
                >
                  <HueBar width={340 - 28} height={28} />
                </View>

                <Slider
                  minimumValue={0}
                  maximumValue={360}
                  step={1}
                  value={hue}
                  onValueChange={(v) => {
                    const h = typeof v === "number" ? v : Number(v);
                    setHue(h);
                    const c = colorFromHue(h);
                    setPenColor(c);
                    setActiveSlotIndex(null);
                    if (tool !== "pen") setTool("pen");
                  }}
                  minimumTrackTintColor="transparent"
                  maximumTrackTintColor="transparent"
                  thumbTintColor="#ffffff"
                />
              </View>

              <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                Tap a slot to use • Long-press to save
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {colorSlots.map((c, idx) => {
                  const selected = idx === activeSlotIndex;
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        if (!c) return;
                        setPenColor(c);
                        setActiveSlotIndex(idx);
                        if (tool !== "pen") setTool("pen");
                      }}
                      onLongPress={() => {
                        setColorSlots((prev) => {
                          const next = [...prev];
                          next[idx] = penColor;
                          return next;
                        });
                        setActiveSlotIndex(idx);
                      }}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        backgroundColor: c || "rgba(255,255,255,0.06)",
                        borderWidth: selected ? 3 : 1,
                        borderColor: selected
                          ? "#fff"
                          : "rgba(255,255,255,0.18)",
                      }}
                    />
                  );
                })}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
