import Slider from "@react-native-community/slider";
import React, { useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

type Point = { x: number; y: number };

type Stroke = {
  id: string;
  points: Point[];
  d: string;
  w: number;
  c: string;
  dx: number;
  dy: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

const WORKSPACE_BG = "#e9e9e9";
const PAGE_BG = "#ffffff";
const PAGE_BORDER = "rgba(0,0,0,0.10)";

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

export default function Index() {
  const [tool, setTool] = useState<"pen" | "eraser" | "lasso">("pen");

  // Shared size
  const [sizeIndex, setSizeIndex] = useState(0);
  const penWidth = SIZE_OPTIONS[sizeIndex].width;
  const [isSizeModalOpen, setIsSizeModalOpen] = useState(false);

  // Pen color
  const [hue, setHue] = useState(0);
  const [penColor, setPenColor] = useState<string>(colorFromHue(0));
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);

  // Saved slots
  const [colorSlots, setColorSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);

  // Effective settings depend on tool
  const activeColor = tool === "eraser" ? PAGE_BG : penColor;
  const activeWidth = tool === "eraser" ? penWidth * ERASER_MULT : penWidth;

  // Zoom
  const [zoom, setZoom] = useState(1);
  const clampZoom = (z: number) => Math.max(0.5, Math.min(2.5, z));

  // Strokes + current stroke
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentPath, setCurrentPath] = useState("");

  // Lasso UI
  const [lassoPath, setLassoPath] = useState("");
  const lassoPoints = useRef<Point[]>([]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Geometry refs
  const pageRef = useRef<any>(null);
  const pageRect = useRef<{ left: number; top: number } | null>(null);

  // Drawing refs
  const isPointerDown = useRef(false);
  const currentPoints = useRef<Point[]>([]);

  // Move selection refs
  const isMovingSelection = useRef(false);
  const moveStart = useRef<Point | null>(null);
  const moveBase = useRef<Map<string, { dx: number; dy: number }>>(new Map());

  // rAF throttling (web)
  const rafId = useRef<number | null>(null);
  const pending = useRef(false);

  const refreshPageRect = () => {
    const el = pageRef.current as any;
    if (el?.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      pageRect.current = { left: r.left, top: r.top };
    } else {
      pageRect.current = { left: 0, top: 0 };
    }
  };

  const getPagePointWeb = (e: any): Point | null => {
    const ne = e?.nativeEvent;
    const clientX = ne?.clientX ?? 0;
    const clientY = ne?.clientY ?? 0;
    const rect = pageRect.current;
    if (!rect) return null;

    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;

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
        w: activeWidth,
        c: activeColor,
        dx: 0,
        dy: 0,
        bbox,
      };
      setStrokes((prev) => [...prev, stroke]);
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
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
  };

  const deleteSelection = () => {
    if (selectedIds.length === 0) return;
    setStrokes((prev) => prev.filter((s) => !selectedSet.has(s.id)));
    setSelectedIds([]);
  };

  // Web pointer handlers on the page
  const webHandlers = useMemo(() => {
    if (Platform.OS !== "web") return {};

    return {
      onPointerDown: (e: any) => {
        if (e?.nativeEvent?.button != null && e.nativeEvent.button !== 0)
          return;

        e?.preventDefault?.();
        e?.stopPropagation?.();

        refreshPageRect();

        const p = getPagePointWeb(e);
        if (!p) {
          if (tool === "lasso") setSelectedIds([]);
          return;
        }

        isPointerDown.current = true;
        e?.nativeEvent?.target?.setPointerCapture?.(e.nativeEvent.pointerId);

        if (tool === "lasso") {
          if (selectedIds.length > 0) startMoveSelection(p);
          else startLasso(p);
          return;
        }

        startStroke(p);
      },

      onPointerMove: (e: any) => {
        if (!isPointerDown.current) return;
        e?.preventDefault?.();

        const p = getPagePointWeb(e);
        if (!p) return;

        if (tool === "lasso") {
          if (isMovingSelection.current) moveSelectionTo(p);
          else extendLasso(p);
          return;
        }

        extendStroke(p);
      },

      onPointerUp: (e: any) => {
        if (!isPointerDown.current) return;
        e?.preventDefault?.();

        isPointerDown.current = false;

        if (tool === "lasso") {
          if (isMovingSelection.current) endMoveSelection();
          else finishLassoAndSelect();
          return;
        }

        endStroke();
      },

      onPointerCancel: () => {
        if (!isPointerDown.current) return;
        isPointerDown.current = false;
        endMoveSelection();
        setLassoPath("");
        lassoPoints.current = [];
        cancelStroke();
      },
    };
  }, [tool, zoom, strokes, selectedIds, selectedSet]);

  // Mobile responder handlers on the page
  const mobileResponderHandlers = useMemo(() => {
    if (Platform.OS === "web") return {};

    return {
      onStartShouldSetResponder: () => true,
      onMoveShouldSetResponder: () => true,

      onResponderGrant: (e: any) => {
        const { locationX, locationY } = e.nativeEvent;
        const x = locationX / zoom;
        const y = locationY / zoom;
        if (x < 0 || y < 0 || x > PAGE_W || y > PAGE_H) return;

        isPointerDown.current = true;
        const p = { x, y };

        if (tool === "lasso") {
          if (selectedIds.length > 0) startMoveSelection(p);
          else startLasso(p);
          return;
        }

        startStroke(p);
      },

      onResponderMove: (e: any) => {
        if (!isPointerDown.current) return;
        const { locationX, locationY } = e.nativeEvent;
        const x = locationX / zoom;
        const y = locationY / zoom;
        if (x < 0 || y < 0 || x > PAGE_W || y > PAGE_H) return;

        const p = { x, y };

        if (tool === "lasso") {
          if (isMovingSelection.current) moveSelectionTo(p);
          else extendLasso(p);
          return;
        }

        extendStroke(p);
      },

      onResponderRelease: () => {
        if (!isPointerDown.current) return;
        isPointerDown.current = false;

        if (tool === "lasso") {
          if (isMovingSelection.current) endMoveSelection();
          else finishLassoAndSelect();
          return;
        }

        endStroke();
      },
    };
  }, [tool, zoom, selectedIds, selectedSet, strokes]);

  return (
    <View style={{ flex: 1, backgroundColor: WORKSPACE_BG }}>
      {/* Top bar */}
      <View
        style={{
          paddingTop: 14,
          paddingHorizontal: 12,
          paddingBottom: 10,
          flexDirection: "row",
          gap: 10,
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(0,0,0,0.08)",
          backgroundColor: "#fff",
        }}
      >
        <Pressable
          onPress={() => {
            setTool("pen");
            setSelectedIds([]);
            setLassoPath("");
          }}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: tool === "pen" ? "#111" : "#f2f2f2",
          }}
        >
          <Text
            style={{
              color: tool === "pen" ? "#fff" : "#111",
              fontWeight: "800",
            }}
          >
            Pen
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setTool("eraser");
            setSelectedIds([]);
            setLassoPath("");
          }}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: tool === "eraser" ? "#111" : "#f2f2f2",
          }}
        >
          <Text
            style={{
              color: tool === "eraser" ? "#fff" : "#111",
              fontWeight: "800",
            }}
          >
            Erase
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setTool("lasso");
            setLassoPath("");
            lassoPoints.current = [];
          }}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: tool === "lasso" ? "#111" : "#f2f2f2",
          }}
        >
          <Text
            style={{
              color: tool === "lasso" ? "#fff" : "#111",
              fontWeight: "800",
            }}
          >
            Lasso
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setStrokes([]);
            setSelectedIds([]);
            setCurrentPath("");
            setLassoPath("");
            currentPoints.current = [];
            lassoPoints.current = [];
          }}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: "#f2f2f2",
          }}
        >
          <Text style={{ color: "#111", fontWeight: "800" }}>Clear</Text>
        </Pressable>

        <Pressable
          onPress={() => setIsSizeModalOpen(true)}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: "#f2f2f2",
          }}
        >
          <Text style={{ color: "#111", fontWeight: "800" }}>
            Size: {SIZE_OPTIONS[sizeIndex].label}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setIsColorModalOpen(true)}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: penColor,
            borderWidth: 1,
            borderColor: "#ddd",
            opacity: tool === "eraser" ? 0.5 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>Color</Text>
        </Pressable>

        <Pressable
          onPress={deleteSelection}
          disabled={selectedIds.length === 0}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: selectedIds.length === 0 ? "#f2f2f2" : "#ff3b30",
            opacity: selectedIds.length === 0 ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              color: selectedIds.length === 0 ? "#111" : "#fff",
              fontWeight: "900",
            }}
          >
            Delete
          </Text>
        </Pressable>

        {/* Zoom controls */}
        <View
          style={{ flexDirection: "row", gap: 8, marginLeft: "auto" as any }}
        >
          <Pressable
            onPress={() => setZoom((z) => clampZoom(z - 0.1))}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: "#f2f2f2",
            }}
          >
            <Text style={{ color: "#111", fontWeight: "900" }}>−</Text>
          </Pressable>

          <Pressable
            onPress={() => setZoom(1)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: "#f2f2f2",
            }}
          >
            <Text style={{ color: "#111", fontWeight: "900" }}>
              {Math.round(zoom * 100)}%
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setZoom((z) => clampZoom(z + 0.1))}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: "#f2f2f2",
            }}
          >
            <Text style={{ color: "#111", fontWeight: "900" }}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* Workspace: WEB uses native overflow scrolling (wheel works) */}
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
                } as any)
              : {
                  flex: 1,
                  padding: 24,
                  justifyContent: "flex-start",
                  alignItems: "center",
                }
          }
        >
          {/* Page (scaled) */}
          <View
            ref={pageRef}
            style={
              {
                width: PAGE_W * zoom,
                height: PAGE_H * zoom,
                backgroundColor: PAGE_BG,
                borderWidth: 1,
                borderColor: PAGE_BORDER,
                borderRadius: 6,
                overflow: "hidden",
                shadowColor: "#000",
                shadowOpacity: 0.12,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                touchAction: "none",
                userSelect: "none",
              } as any
            }
            {...(Platform.OS === "web"
              ? (webHandlers as any)
              : (mobileResponderHandlers as any))}
          >
            {/* Inner content stays in PAGE coords, then scaled */}
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
                {strokes.map((s) => {
                  const selected = selectedSet.has(s.id);
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

                {currentPath ? (
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

                {lassoPath ? (
                  <Path
                    d={lassoPath}
                    stroke="rgba(0,0,0,0.65)"
                    strokeWidth={2}
                    fill="rgba(0,0,0,0.05)"
                    strokeDasharray="6 6"
                  />
                ) : null}
              </Svg>
            </View>
          </View>
        </View>
      </View>

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
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "900" }}>
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
                      borderColor: selected ? "#111" : "#ddd",
                      backgroundColor: selected ? "#111" : "#fff",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? "#fff" : "#111",
                        fontWeight: "900",
                      }}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={{
                        color: selected ? "#fff" : "#666",
                        fontSize: 12,
                      }}
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
                backgroundColor: "#f2f2f2",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#111", fontWeight: "900" }}>Cancel</Text>
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
            backgroundColor: "rgba(0,0,0,0.25)",
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
