import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";

import {
  buildSegmentBBoxes,
  bboxOverlap,
  computeBBox,
  dist,
  getCanvasSize,
  getSelectionBounds,
  lerpPoint,
  pointInPoly,
  pointsToSmoothPath,
  smoothTowards,
  splitStrokeByEraserPathPoints,
  transformStroke,
  uid,
} from "@/lib/editorGeometry";
import type { Point, Stroke } from "@/lib/editorTypes";
import type {
  InfiniteBoard,
  PageTemplate,
  ShapePreset,
} from "@/lib/noteDocument";

type Tool =
  | "pen"
  | "highlighter"
  | "shape"
  | "text"
  | "eraser"
  | "lasso"
  | "hand";

export type LivePreviewState = {
  currentPath: string;
  activeColor: string;
  activeWidth: number;
  activeOpacity: number;
  lassoPath: string;
  tool: Tool;
  eraserCursor: Point | null;
  eraserRadius: number;
  pageIsActive: boolean;
};

export type NativeStrokePreviewState = {
  path: null;
  points: { value: Point[] };
  visible: { value: boolean };
};

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
  activeAlphaRef: React.RefObject<number>;
  shapePreset: ShapePreset;
  pageTemplate: PageTemplate;
  snapToGrid: boolean;
  shapeSnapEnabled: boolean;
  gridStep: number;
  onTextPlacement?: (payload: { pageIndex: number; point: Point }) => void;
  zoom?: number;
  zoomRef: React.RefObject<number>;
  canvasSize?: { width: number; height: number };
  canvasSizeRef: React.RefObject<{ width: number; height: number }>;
  isInfiniteCanvas: boolean;
  setBoardSize: React.Dispatch<React.SetStateAction<InfiniteBoard | null>>;
  minDistPx: number;
  minPointsToSave: number;
  strokeSmoothingAlpha: number;
  infiniteEdgeTrigger: number;
  infiniteExpandX: number;
  infiniteExpandY: number;
  onPerfEvent?: (
    event:
      | { type: "eraseBatch"; batchSize: number }
      | { type: "interaction"; active: boolean }
      | { type: "dirtyRect"; area: number }
      | { type: "eraseCandidates"; count: number },
  ) => void;
};

const EMPTY_SELECTION = new Set<string>();
const ERASER_MAX_QUEUED_POINTS = 48;
type AxisRotateHandle = {
  groupId: string;
  shapePreset: "axis-2d" | "axis-3d";
  axisRole: "x" | "y" | "z";
  origin: Point;
  handle: Point;
};

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
  activeAlphaRef,
  shapePreset,
  pageTemplate,
  snapToGrid,
  shapeSnapEnabled,
  gridStep,
  onTextPlacement,
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
  const [isInteracting] = useState(false);
  const [selectionPreviewOffset, setSelectionPreviewOffset] = useState({
    dx: 0,
    dy: 0,
  });
  const livePreviewStateRef = useRef<LivePreviewState>({
    currentPath: "",
    activeColor: activeColorRef.current,
    activeWidth: activeWidthRef.current,
    activeOpacity: activeAlphaRef.current,
    lassoPath: "",
    tool,
    eraserCursor: null,
    eraserRadius: activeWidthRef.current / 2,
    pageIsActive: false,
  });
  const nativeStrokePreview = useMemo<NativeStrokePreviewState>(
    () => ({
      path: null,
      points: { value: [] },
      visible: { value: false },
    }),
    [],
  );
  const selectedSet = useMemo(
    () => (selectedIds.length > 0 ? new Set(selectedIds) : EMPTY_SELECTION),
    [selectedIds],
  );
  const selectionBounds =
    selectedIds.length > 0
      ? getSelectionBounds(
          strokesRef.current
            .filter((stroke) => selectedSet.has(stroke.id))
            .map((stroke) => ({
              ...stroke,
              dx: stroke.dx + selectionPreviewOffset.dx,
              dy: stroke.dy + selectionPreviewOffset.dy,
            })),
        )
      : null;
  const axisRotateState = useRef<{
    active: boolean;
    groupId: string | null;
    axisRole: "x" | "y" | "z" | null;
    origin: Point | null;
    baseHandle: Point | null;
    baseStrokes: Map<string, Stroke>;
    didMutate: boolean;
  }>({
    active: false,
    groupId: null,
    axisRole: null,
    origin: null,
    baseHandle: null,
    baseStrokes: new Map(),
    didMutate: false,
  });
  const activeAxisRotateHandles =
    selectedIds.length > 0
      ? (() => {
          const selection = strokesRef.current.filter((stroke) =>
            selectedSet.has(stroke.id),
          );
          if (selection.length === 0) return null;
          const first = selection.find(
            (stroke) =>
              stroke.groupId &&
              (stroke.shapePreset === "axis-2d" ||
                stroke.shapePreset === "axis-3d") &&
              stroke.axisOrigin,
          );
          if (
            !first ||
            !first.groupId ||
            !first.shapePreset ||
            !first.axisOrigin
          ) {
            return null;
          }
          if (
            first.shapePreset !== "axis-2d" &&
            first.shapePreset !== "axis-3d"
          ) {
            return null;
          }
          const groupStrokes = strokesRef.current.filter(
            (stroke) =>
              stroke.groupId === first.groupId &&
              stroke.shapePreset === first.shapePreset,
          );
          if (groupStrokes.length === 0) return null;
          const positiveStrokes = groupStrokes.filter(
            (stroke) =>
              stroke.axisRole &&
              stroke.axisOrigin &&
              stroke.axisHandle &&
              stroke.dashed !== true,
          );
          if (positiveStrokes.length === 0) return null;
          return positiveStrokes.map((stroke) => ({
            groupId: first.groupId!,
            shapePreset: first.shapePreset!,
            axisRole: stroke.axisRole!,
            origin: {
              x: stroke.axisOrigin!.x + stroke.dx,
              y: stroke.axisOrigin!.y + stroke.dy,
            },
            handle: {
              x: stroke.axisHandle!.x + stroke.dx,
              y: stroke.axisHandle!.y + stroke.dy,
            },
          })) satisfies AxisRotateHandle[];
        })()
      : null;

  const toolRef = useRef(tool);
  const shapePresetRef = useRef(shapePreset);
  const pageTemplateRef = useRef(pageTemplate);
  const snapToGridRef = useRef(snapToGrid);
  const shapeSnapEnabledRef = useRef(shapeSnapEnabled);
  const gridStepRef = useRef(gridStep);
  const currentPageIndexRef = useRef(currentPageIndex);
  const selectedIdsRef = useRef(selectedIds);
  const selectedSetRef = useRef(selectedSet);
  const isInfiniteCanvasRef = useRef(isInfiniteCanvas);

  const isPointerDown = useRef(false);
  const pointerPageIndex = useRef<number | null>(null);
  const currentPoints = useRef<Point[]>([]);
  const currentPreviewPoints = useRef<Point[]>([]);
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
  const selectionClipboard = useRef<Stroke[]>([]);
  const [hasClipboard, setHasClipboard] = useState(false);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    shapePresetRef.current = shapePreset;
  }, [shapePreset]);
  useEffect(() => {
    pageTemplateRef.current = pageTemplate;
    snapToGridRef.current = snapToGrid;
    shapeSnapEnabledRef.current = shapeSnapEnabled;
    gridStepRef.current = gridStep;
  }, [gridStep, pageTemplate, shapeSnapEnabled, snapToGrid]);

  const snapPoint = useCallback((point: Point, force = false) => {
    const template = pageTemplateRef.current;
    const shouldSnap =
      force ||
      (snapToGridRef.current &&
        (template === "grid" ||
          template === "dots" ||
          template === "graph-fine" ||
          template === "graph-coarse" ||
          template === "isometric"));
    if (!shouldSnap) return point;
    const step = Math.max(8, gridStepRef.current);
    return {
      x: Math.round(point.x / step) * step,
      y: Math.round(point.y / step) * step,
    };
  }, []);

  const buildShapeDraft = useCallback(
    (rawStart: Point, rawEnd: Point) => {
      const start = shapeSnapEnabledRef.current
        ? snapPoint(rawStart, true)
        : rawStart;
      let end = shapeSnapEnabledRef.current ? snapPoint(rawEnd, true) : rawEnd;
      if (
        shapePresetRef.current === "line" ||
        shapePresetRef.current === "axis" ||
        shapePresetRef.current === "axis-2d" ||
        shapePresetRef.current === "axis-3d"
      ) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const angle = Math.atan2(dy, dx);
        const snapAngle = Math.PI / 12;
        const snapped = Math.round(angle / snapAngle) * snapAngle;
        const length = Math.max(8, Math.hypot(dx, dy));
        end = {
          x: start.x + Math.cos(snapped) * length,
          y: start.y + Math.sin(snapped) * length,
        };
        if (shapeSnapEnabledRef.current) {
          end = snapPoint(end, true);
        }
      }
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const bottom = Math.max(start.y, end.y);
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      const rx = width / 2;
      const ry = height / 2;
      const preset = shapePresetRef.current;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dirX = dx >= 0 ? 1 : -1;
      const dirY = dy >= 0 ? 1 : -1;
      const absWidth = Math.max(24, Math.abs(dx));
      const absHeight = Math.max(24, Math.abs(dy));
      const origin = start;
      const xEnd = { x: origin.x + dirX * absWidth, y: origin.y };
      const yEnd = { x: origin.x, y: origin.y + dirY * absHeight };
      const negativeX = {
        x: origin.x - dirX * Math.max(20, absWidth * 0.4),
        y: origin.y,
      };
      const negativeY = {
        x: origin.x,
        y: origin.y - dirY * Math.max(20, absHeight * 0.4),
      };
      const arrowHead = (from: Point, to: Point, size = 12) => {
        const vx = to.x - from.x;
        const vy = to.y - from.y;
        const len = Math.max(1, Math.hypot(vx, vy));
        const ux = vx / len;
        const uy = vy / len;
        const px = -uy;
        const py = ux;
        const leftPoint = {
          x: to.x - ux * size + px * (size * 0.45),
          y: to.y - uy * size + py * (size * 0.45),
        };
        const rightPoint = {
          x: to.x - ux * size - px * (size * 0.45),
          y: to.y - uy * size - py * (size * 0.45),
        };
        return `M ${to.x} ${to.y} L ${leftPoint.x} ${leftPoint.y} M ${to.x} ${to.y} L ${rightPoint.x} ${rightPoint.y}`;
      };
      const dragLength = Math.max(24, Math.hypot(dx, dy));
      const primaryUnit = {
        x: (end.x - start.x) / dragLength,
        y: (end.y - start.y) / dragLength,
      };
      const secondaryUnit = {
        x: -primaryUnit.y,
        y: primaryUnit.x,
      };
      const axisPoint = (unit: Point, length: number): Point => ({
        x: origin.x + unit.x * length,
        y: origin.y + unit.y * length,
      });

      if (preset === "line") {
        return {
          d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
          points: [start, end],
          strokes: null,
        };
      }

      if (preset === "vector") {
        return {
          d: `M ${start.x} ${start.y} L ${end.x} ${end.y} ${arrowHead(start, end, 16)}`,
          points: [start, end],
          strokes: null,
        };
      }

      if (preset === "rectangle") {
        return {
          d: `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`,
          points: [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom },
            { x: left, y: top },
          ],
          strokes: null,
        };
      }

      if (preset === "triangle") {
        const apex = { x: (left + right) / 2, y: top };
        const baseLeft = { x: left, y: bottom };
        const baseRight = { x: right, y: bottom };
        return {
          d: `M ${baseLeft.x} ${baseLeft.y} L ${apex.x} ${apex.y} L ${baseRight.x} ${baseRight.y} Z`,
          points: [baseLeft, apex, baseRight, baseLeft],
          strokes: null,
        };
      }

      if (preset === "ellipse") {
        const samples = 32;
        const points = Array.from({ length: samples + 1 }, (_, index) => {
          const theta = (index / samples) * Math.PI * 2;
          return {
            x: centerX + Math.cos(theta) * rx,
            y: centerY + Math.sin(theta) * ry,
          };
        });
        const d =
          points
            .map(
              (point, index) =>
                `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
            )
            .join(" ") + " Z";
        return { d, points, strokes: null };
      }

      if (preset === "angle") {
        const marker = Math.min(
          Math.max(12, Math.min(absWidth, absHeight) * 0.32),
          28,
        );
        return {
          d: `M ${origin.x} ${origin.y} L ${xEnd.x} ${origin.y} M ${origin.x} ${origin.y} L ${origin.x} ${yEnd.y} M ${origin.x + dirX * marker} ${origin.y} L ${origin.x + dirX * marker} ${origin.y + dirY * marker} L ${origin.x} ${origin.y + dirY * marker}`,
          points: [origin, xEnd, origin, yEnd],
          strokes: null,
        };
      }

      if (preset === "dimension") {
        const tick = 8;
        return {
          d: `M ${start.x} ${start.y} L ${end.x} ${end.y} M ${start.x - tick} ${start.y - tick} L ${start.x + tick} ${start.y + tick} M ${end.x - tick} ${end.y - tick} L ${end.x + tick} ${end.y + tick}`,
          points: [start, end],
          strokes: null,
        };
      }

      if (preset === "axis") {
        const negativeStroke = {
          points: [negativeX, origin],
          d: `M ${negativeX.x} ${negativeX.y} L ${origin.x} ${origin.y}`,
          dashed: true,
        };
        const positiveStroke = {
          points: [origin, xEnd],
          d: `M ${origin.x} ${origin.y} L ${xEnd.x} ${xEnd.y} ${arrowHead(origin, xEnd)}`,
          dashed: false,
        };
        return {
          d: `${negativeStroke.d} ${positiveStroke.d}`,
          points: [negativeX, origin, xEnd],
          strokes: [negativeStroke, positiveStroke],
        };
      }

      if (preset === "axis-2d") {
        const mainLength = Math.max(36, dragLength);
        const crossLength = Math.max(28, dragLength * 0.82);
        const positiveX = axisPoint(primaryUnit, mainLength);
        const negativeXOriented = axisPoint(primaryUnit, -mainLength * 0.35);
        const positiveY = axisPoint(secondaryUnit, crossLength);
        const negativeYOriented = axisPoint(secondaryUnit, -crossLength * 0.35);
        const xNegativeStroke = {
          points: [negativeXOriented, origin],
          d: `M ${negativeXOriented.x} ${negativeXOriented.y} L ${origin.x} ${origin.y}`,
          dashed: true,
        };
        const yNegativeStroke = {
          points: [negativeYOriented, origin],
          d: `M ${negativeYOriented.x} ${negativeYOriented.y} L ${origin.x} ${origin.y}`,
          dashed: true,
        };
        const xPositiveStroke = {
          points: [origin, positiveX],
          d: `M ${origin.x} ${origin.y} L ${positiveX.x} ${positiveX.y} ${arrowHead(origin, positiveX)}`,
          dashed: false,
        };
        const yPositiveStroke = {
          points: [origin, positiveY],
          d: `M ${origin.x} ${origin.y} L ${positiveY.x} ${positiveY.y} ${arrowHead(origin, positiveY)}`,
          dashed: false,
        };
        return {
          d: `${xNegativeStroke.d} ${yNegativeStroke.d} ${xPositiveStroke.d} ${yPositiveStroke.d}`,
          points: [
            negativeXOriented,
            origin,
            positiveX,
            negativeYOriented,
            origin,
            positiveY,
          ],
          strokes: [
            {
              ...xNegativeStroke,
              shapePreset: "axis-2d" as const,
              axisRole: "x" as const,
              axisOrigin: { ...origin },
              axisHandle: { ...positiveX },
            },
            {
              ...yNegativeStroke,
              shapePreset: "axis-2d" as const,
              axisRole: "y" as const,
              axisOrigin: { ...origin },
              axisHandle: { ...positiveX },
            },
            {
              ...xPositiveStroke,
              shapePreset: "axis-2d" as const,
              axisRole: "x" as const,
              axisOrigin: { ...origin },
              axisHandle: { ...positiveX },
            },
            {
              ...yPositiveStroke,
              shapePreset: "axis-2d" as const,
              axisRole: "y" as const,
              axisOrigin: { ...origin },
              axisHandle: { ...positiveY },
            },
          ],
        };
      }

      if (preset === "table") {
        const col1 = left + width / 3;
        const col2 = left + (width / 3) * 2;
        const row1 = top + height / 3;
        const row2 = top + (height / 3) * 2;
        return {
          d: `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z M ${col1} ${top} L ${col1} ${bottom} M ${col2} ${top} L ${col2} ${bottom} M ${left} ${row1} L ${right} ${row1} M ${left} ${row2} L ${right} ${row2}`,
          points: [
            { x: left, y: top },
            { x: right, y: bottom },
          ],
          strokes: null,
        };
      }

      const zUnit = {
        x: primaryUnit.x * 0.64 - secondaryUnit.x * 0.64,
        y: primaryUnit.y * 0.64 - secondaryUnit.y * 0.64,
      };
      const zUnitLength = Math.max(1, Math.hypot(zUnit.x, zUnit.y));
      const normalizedZUnit = {
        x: zUnit.x / zUnitLength,
        y: zUnit.y / zUnitLength,
      };
      const xPositive = axisPoint(primaryUnit, Math.max(36, dragLength));
      const xNegativeOriented = axisPoint(
        primaryUnit,
        -Math.max(20, dragLength * 0.35),
      );
      const yPositive = axisPoint(
        secondaryUnit,
        Math.max(32, dragLength * 0.84),
      );
      const yNegativeOriented = axisPoint(
        secondaryUnit,
        -Math.max(18, dragLength * 0.28),
      );
      const zPositive = axisPoint(
        normalizedZUnit,
        Math.max(28, dragLength * 0.72),
      );
      const zNegativeOriented = axisPoint(
        normalizedZUnit,
        -Math.max(16, dragLength * 0.22),
      );
      const xNegativeStroke = {
        points: [xNegativeOriented, origin],
        d: `M ${xNegativeOriented.x} ${xNegativeOriented.y} L ${origin.x} ${origin.y}`,
        dashed: true,
      };
      const yNegativeStroke = {
        points: [yNegativeOriented, origin],
        d: `M ${yNegativeOriented.x} ${yNegativeOriented.y} L ${origin.x} ${origin.y}`,
        dashed: true,
      };
      const zNegativeStroke = {
        points: [zNegativeOriented, origin],
        d: `M ${zNegativeOriented.x} ${zNegativeOriented.y} L ${origin.x} ${origin.y}`,
        dashed: true,
      };
      const xPositiveStroke = {
        points: [origin, xPositive],
        d: `M ${origin.x} ${origin.y} L ${xPositive.x} ${xPositive.y} ${arrowHead(origin, xPositive)}`,
        dashed: false,
      };
      const yPositiveStroke = {
        points: [origin, yPositive],
        d: `M ${origin.x} ${origin.y} L ${yPositive.x} ${yPositive.y} ${arrowHead(origin, yPositive)}`,
        dashed: false,
      };
      const zPositiveStroke = {
        points: [origin, zPositive],
        d: `M ${origin.x} ${origin.y} L ${zPositive.x} ${zPositive.y} ${arrowHead(origin, zPositive)}`,
        dashed: false,
      };
      return {
        d: `${xNegativeStroke.d} ${yNegativeStroke.d} ${zNegativeStroke.d} ${xPositiveStroke.d} ${yPositiveStroke.d} ${zPositiveStroke.d}`,
        points: [
          xNegativeOriented,
          origin,
          xPositive,
          yNegativeOriented,
          origin,
          yPositive,
          zNegativeOriented,
          origin,
          zPositive,
        ],
        strokes: [
          {
            ...xNegativeStroke,
            shapePreset: "axis-3d" as const,
            axisRole: "x" as const,
            axisOrigin: { ...origin },
            axisHandle: { ...xPositive },
          },
          {
            ...yNegativeStroke,
            shapePreset: "axis-3d" as const,
            axisRole: "y" as const,
            axisOrigin: { ...origin },
            axisHandle: { ...yPositive },
          },
          {
            ...zNegativeStroke,
            shapePreset: "axis-3d" as const,
            axisRole: "z" as const,
            axisOrigin: { ...origin },
            axisHandle: { ...zPositive },
          },
          {
            ...xPositiveStroke,
            shapePreset: "axis-3d" as const,
            axisRole: "x" as const,
            axisOrigin: { ...origin },
            axisHandle: { ...xPositive },
          },
          {
            ...yPositiveStroke,
            shapePreset: "axis-3d" as const,
            axisRole: "y" as const,
            axisOrigin: { ...origin },
            axisHandle: { ...yPositive },
          },
          {
            ...zPositiveStroke,
            shapePreset: "axis-3d" as const,
            axisRole: "z" as const,
            axisOrigin: { ...origin },
            axisHandle: { ...zPositive },
          },
        ],
      };
    },
    [snapPoint],
  );

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

  const commitEraserCursor = useCallback(
    (point: Point | null, immediate = false) => {
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
    },
    [],
  );

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

  const previewPointStep = useCallback(
    () => Math.max(3.5, minDistPx * 2),
    [minDistPx],
  );

  const rebuildPreviewPath = useCallback(() => {
    currentPathDraft.current = pointsToSmoothPath(currentPreviewPoints.current);
  }, []);

  const startStroke = useCallback(
    (point: Point) => {
      ensureInfiniteCanvasRoom(point);
      currentPoints.current = [point];
      currentPreviewPoints.current = [point];
      rebuildPreviewPath();
      setCurrentPath(currentPathDraft.current);
    },
    [ensureInfiniteCanvasRoom, rebuildPreviewPath],
  );

  const extendStroke = useCallback(
    (point: Point) => {
      ensureInfiniteCanvasRoom(point);
      const points = currentPoints.current;
      const last = points[points.length - 1];

      if (!last) {
        points.push(point);
        currentPreviewPoints.current.push(point);
        rebuildPreviewPath();
        recomputePath();
        return;
      }

      if (toolRef.current === "shape") {
        currentPoints.current = [points[0], point];
        currentPathDraft.current = buildShapeDraft(points[0], point).d;
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
        const previewPoints = currentPreviewPoints.current;
        const previewLast = previewPoints[previewPoints.length - 1];
        if (
          !previewLast ||
          dist(previewLast, nextPoint) >= previewPointStep()
        ) {
          previewPoints.push(nextPoint);
        }
      }

      const previewPoints = currentPreviewPoints.current;
      const finalPreviewPoint = previewPoints[previewPoints.length - 1];
      const lastResolvedPoint = points[points.length - 1];
      if (
        lastResolvedPoint &&
        (!finalPreviewPoint ||
          dist(finalPreviewPoint, lastResolvedPoint) > 0.01)
      ) {
        previewPoints.push(lastResolvedPoint);
      }

      rebuildPreviewPath();
      recomputePath();
    },
    [
      ensureInfiniteCanvasRoom,
      minDistPx,
      previewPointStep,
      recomputePath,
      rebuildPreviewPath,
      strokeSmoothingAlpha,
    ],
  );

  const endStroke = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
      pending.current = false;
    }

    const requiredPointCount =
      toolRef.current === "shape" ? 2 : minPointsToSave;
    if (currentPoints.current.length < requiredPointCount) {
      currentPoints.current = [];
      currentPreviewPoints.current = [];
      currentPathDraft.current = "";
      setCurrentPath("");
      return;
    }

    const points = currentPoints.current;
    const shapeDraft =
      toolRef.current === "shape"
        ? buildShapeDraft(points[0], points[points.length - 1])
        : null;
    const resolvedPoints = shapeDraft?.points ?? points;
    const d = shapeDraft?.d ?? pointsToSmoothPath(resolvedPoints);
    const bbox = computeBBox(resolvedPoints);

    if (d.trim().length > 0) {
      if (shapeDraft?.strokes?.length) {
        const shapeStrokes: Stroke[] = shapeDraft.strokes.map(
          (segment: any) => ({
            id: uid(),
            points: segment.points.slice(),
            segmentBBoxes: buildSegmentBBoxes(segment.points),
            d: segment.d,
            w: activeWidthRef.current,
            c: activeColorRef.current,
            a: activeAlphaRef.current,
            dashed: segment.dashed,
            shapePreset: segment.shapePreset,
            axisRole: segment.axisRole,
            axisOrigin: segment.axisOrigin,
            axisHandle: segment.axisHandle,
            dx: 0,
            dy: 0,
            bbox: computeBBox(segment.points),
          }),
        );
        const axisGroupId = shapeStrokes.some(
          (stroke: Stroke) => stroke.shapePreset,
        )
          ? uid()
          : null;
        const finalizedShapeStrokes =
          axisGroupId == null
            ? shapeStrokes
            : shapeStrokes.map((stroke) => ({
                ...stroke,
                groupId: axisGroupId,
              }));
        commitCurrentPageStrokes((prev) => [...prev, ...finalizedShapeStrokes]);
      } else {
        const stroke: Stroke = {
          id: uid(),
          points: resolvedPoints.slice(),
          segmentBBoxes: buildSegmentBBoxes(resolvedPoints),
          d,
          w: activeWidthRef.current,
          c: activeColorRef.current,
          a: activeAlphaRef.current,
          dashed: false,
          dx: 0,
          dy: 0,
          bbox,
        };
        commitCurrentPageStrokes((prev) => [...prev, stroke]);
      }
    }

    currentPoints.current = [];
    currentPreviewPoints.current = [];
    currentPathDraft.current = "";
    setCurrentPath("");
  }, [
    activeColorRef,
    activeAlphaRef,
    activeWidthRef,
    buildShapeDraft,
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
    currentPreviewPoints.current = [];
    currentPathDraft.current = "";
    setCurrentPath("");
  }, []);

  const eraseAtPoints = useCallback(
    (points: Point[]) => {
      if (points.length === 0) return;
      const radius = activeWidthRef.current / 2;
      const centersBounds = computeBBox(points);
      const eraserBounds = {
        minX: centersBounds.minX - radius,
        minY: centersBounds.minY - radius,
        maxX: centersBounds.maxX + radius,
        maxY: centersBounds.maxY + radius,
      };

      updateCurrentPageStrokes((prev) => {
        let changed = false;
        const next: Stroke[] = [];

        for (const stroke of prev) {
          const strokeBounds = {
            minX: stroke.bbox.minX + stroke.dx,
            minY: stroke.bbox.minY + stroke.dy,
            maxX: stroke.bbox.maxX + stroke.dx,
            maxY: stroke.bbox.maxY + stroke.dy,
          };
          if (!bboxOverlap(strokeBounds, eraserBounds)) {
            next.push(stroke);
            continue;
          }

          const relevantPoints: Point[] = [];
          for (const point of points) {
            if (
              bboxOverlap(strokeBounds, {
                minX: point.x - radius,
                minY: point.y - radius,
                maxX: point.x + radius,
                maxY: point.y + radius,
              })
            ) {
              relevantPoints.push(point);
            }
          }
          if (relevantPoints.length === 0) {
            next.push(stroke);
            continue;
          }

          const replaced = splitStrokeByEraserPathPoints(
            stroke,
            relevantPoints,
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
      const queue = queuedEraserPoints.current;
      const radius = activeWidthRef.current / 2;
      const minQueueGap = Math.max(3, radius * 0.35);
      for (const point of points) {
        const previous = queue[queue.length - 1];
        if (previous && dist(previous, point) < minQueueGap) continue;
        queue.push(point);
      }

      if (queue.length >= ERASER_MAX_QUEUED_POINTS) {
        flushQueuedEraser();
        return;
      }

      if (eraserRafId.current != null) return;

      // Use MessageChannel for more immediate processing when needed
      if (typeof MessageChannel !== "undefined") {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          eraserRafId.current = null;
          flushQueuedEraser();
        };
        eraserRafId.current = channel.port2 as any;
        channel.port2.postMessage(null);
      } else if (typeof requestAnimationFrame !== "function") {
        flushQueuedEraser();
      } else {
        eraserRafId.current = requestAnimationFrame(() => {
          eraserRafId.current = null;
          flushQueuedEraser();
        });
      }
    },
    [activeWidthRef, flushQueuedEraser],
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
      const step = Math.max(5, radius * 0.55);
      const distance = dist(from, to);

      if (distance <= step) {
        return;
      }

      const sampleCount = Math.min(18, Math.ceil(distance / step));
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
    [activeWidthRef, queueEraserPoints],
  );

  const lassoToPath = useCallback((points: Point[]) => {
    if (points.length === 0) return "";
    let d = `M ${points[0].x} ${points[0].y} `;
    for (let i = 1; i < points.length; i++)
      d += `L ${points[i].x} ${points[i].y} `;
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
        const translatedPoint = {
          x: point.x + stroke.dx,
          y: point.y + stroke.dy,
        };
        if (pointInPoly(translatedPoint, polygon)) {
          inside = true;
          break;
        }
      }
      if (inside) hits.push(stroke.id);
    }

    const expandedHits = new Set(hits);
    for (const stroke of strokesRef.current) {
      if (!stroke.groupId || !expandedHits.has(stroke.id)) continue;
      for (const sibling of strokesRef.current) {
        if (sibling.groupId === stroke.groupId) expandedHits.add(sibling.id);
      }
    }

    setSelectedIds([...expandedHits]);
    commitLassoPath("");
    lassoPoints.current = [];
  }, [commitLassoPath, strokesRef]);

  const startMoveSelection = useCallback(
    (point: Point) => {
      if (selectedIdsRef.current.length === 0) return;
      isMovingSelection.current = true;
      moveStart.current = point;
      moveDidMutate.current = false;
      setSelectionPreviewOffset({ dx: 0, dy: 0 });

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
      setSelectionPreviewOffset({ dx, dy });
    },
    [ensureInfiniteCanvasRoom],
  );

  const endMoveSelection = useCallback(() => {
    if (isMovingSelection.current && moveDidMutate.current) {
      const { dx, dy } = selectionPreviewOffset;
      const nextSnapshot = updateCurrentPageStrokes((prev) =>
        prev.map((stroke) => {
          if (!selectedSetRef.current.has(stroke.id)) return stroke;
          const base = moveBase.current.get(stroke.id);
          if (!base) return stroke;
          return { ...stroke, dx: base.dx + dx, dy: base.dy + dy };
        }),
      );
      commitCurrentPageHistory(nextSnapshot);
    }
    isMovingSelection.current = false;
    moveStart.current = null;
    moveBase.current = new Map();
    moveDidMutate.current = false;
    setSelectionPreviewOffset({ dx: 0, dy: 0 });
  }, [
    commitCurrentPageHistory,
    selectionPreviewOffset,
    updateCurrentPageStrokes,
  ]);

  const deleteSelection = useCallback(() => {
    if (selectedIdsRef.current.length === 0) return;
    commitCurrentPageStrokes((prev) =>
      prev.filter((stroke) => !selectedSetRef.current.has(stroke.id)),
    );
    setSelectedIds([]);
  }, [commitCurrentPageStrokes]);

  const selectAll = useCallback(() => {
    setSelectedIds(strokesRef.current.map((stroke) => stroke.id));
  }, [strokesRef]);

  const copySelection = useCallback(() => {
    if (selectedIdsRef.current.length === 0) return;
    selectionClipboard.current = strokesRef.current
      .filter((stroke) => selectedSetRef.current.has(stroke.id))
      .map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
        bbox: { ...stroke.bbox },
      }));
    setHasClipboard(selectionClipboard.current.length > 0);
  }, [strokesRef]);

  const pasteSelection = useCallback(() => {
    if (selectionClipboard.current.length === 0) return;
    const pasted = selectionClipboard.current.map((stroke) =>
      transformStroke(
        {
          ...stroke,
          points: stroke.points.map((point) => ({ ...point })),
          bbox: { ...stroke.bbox },
        },
        (point) => ({ x: point.x + 28, y: point.y + 28 }),
      ),
    );
    commitCurrentPageStrokes((prev) => [...prev, ...pasted]);
    setSelectedIds(pasted.map((stroke) => stroke.id));
  }, [commitCurrentPageStrokes]);

  const duplicateSelection = useCallback(() => {
    copySelection();
    pasteSelection();
  }, [copySelection, pasteSelection]);

  const transformSelection = useCallback(
    (
      transformPoint: (
        point: Point,
        bounds: ReturnType<typeof getSelectionBounds>,
      ) => Point,
    ) => {
      const selection = strokesRef.current.filter((stroke) =>
        selectedSetRef.current.has(stroke.id),
      );
      if (selection.length === 0) return;
      const bounds = getSelectionBounds(selection);
      const nextIds: string[] = [];
      commitCurrentPageStrokes((prev) =>
        prev.map((stroke) => {
          if (!selectedSetRef.current.has(stroke.id)) return stroke;
          const nextStroke = transformStroke(stroke, (point) =>
            transformPoint(point, bounds),
          );
          nextIds.push(nextStroke.id);
          return nextStroke;
        }),
      );
      setSelectedIds(nextIds);
    },
    [commitCurrentPageStrokes, strokesRef],
  );

  const scaleSelection = useCallback(
    (factor: number) => {
      transformSelection((point, bounds) => ({
        x: bounds.centerX + (point.x - bounds.centerX) * factor,
        y: bounds.centerY + (point.y - bounds.centerY) * factor,
      }));
    },
    [transformSelection],
  );

  const rotateSelection = useCallback(
    (degrees: number) => {
      const radians = (degrees * Math.PI) / 180;
      const sin = Math.sin(radians);
      const cos = Math.cos(radians);
      transformSelection((point, bounds) => {
        const x = point.x - bounds.centerX;
        const y = point.y - bounds.centerY;
        return {
          x: bounds.centerX + x * cos - y * sin,
          y: bounds.centerY + x * sin + y * cos,
        };
      });
    },
    [transformSelection],
  );

  const startAxisRotation = useCallback(
    (handle: AxisRotateHandle) => {
      const selection = strokesRef.current.filter(
        (stroke) =>
          stroke.groupId === handle.groupId &&
          stroke.axisRole === handle.axisRole,
      );
      axisRotateState.current = {
        active: true,
        groupId: handle.groupId,
        axisRole: handle.axisRole,
        origin: handle.origin,
        baseHandle: handle.handle,
        baseStrokes: new Map(
          selection.map((stroke) => [
            stroke.id,
            {
              ...stroke,
              points: stroke.points.map((point) => ({ ...point })),
              axisOrigin: stroke.axisOrigin
                ? { ...stroke.axisOrigin }
                : undefined,
              axisHandle: stroke.axisHandle
                ? { ...stroke.axisHandle }
                : undefined,
              bbox: { ...stroke.bbox },
            },
          ]),
        ),
        didMutate: false,
      };
    },
    [strokesRef],
  );

  const rotateAxisToPoint = useCallback(
    (point: Point) => {
      const state = axisRotateState.current;
      if (
        !state.active ||
        !state.groupId ||
        !state.axisRole ||
        !state.origin ||
        !state.baseHandle ||
        state.baseStrokes.size === 0
      ) {
        return;
      }

      const baseAngle = Math.atan2(
        state.baseHandle.y - state.origin.y,
        state.baseHandle.x - state.origin.x,
      );
      const nextAngle = Math.atan2(
        point.y - state.origin.y,
        point.x - state.origin.x,
      );
      const delta = nextAngle - baseAngle;
      const sin = Math.sin(delta);
      const cos = Math.cos(delta);

      updateCurrentPageStrokes((prev) =>
        prev.map((stroke) => {
          if (
            stroke.groupId !== state.groupId ||
            stroke.axisRole !== state.axisRole
          ) {
            return stroke;
          }
          const baseStroke = state.baseStrokes.get(stroke.id);
          if (!baseStroke) return stroke;
          return transformStroke(
            baseStroke,
            (current) => {
              const tx = current.x - state.origin!.x;
              const ty = current.y - state.origin!.y;
              return {
                x: state.origin!.x + tx * cos - ty * sin,
                y: state.origin!.y + tx * sin + ty * cos,
              };
            },
            baseStroke.id,
          );
        }),
      );
      axisRotateState.current.didMutate = true;
    },
    [updateCurrentPageStrokes],
  );

  const endAxisRotation = useCallback(() => {
    if (axisRotateState.current.active && axisRotateState.current.didMutate) {
      commitCurrentPageHistory(strokesRef.current);
    }
    axisRotateState.current = {
      active: false,
      groupId: null,
      axisRole: null,
      origin: null,
      baseHandle: null,
      baseStrokes: new Map(),
      didMutate: false,
    };
  }, [commitCurrentPageHistory, strokesRef]);

  const alignSelectionToGrid = useCallback(() => {
    const selection = strokesRef.current.filter((stroke) =>
      selectedSetRef.current.has(stroke.id),
    );
    if (selection.length === 0) return;
    const bounds = getSelectionBounds(selection);
    const snappedCenter = snapPoint(
      { x: bounds.centerX, y: bounds.centerY },
      true,
    );
    const offsetX = snappedCenter.x - bounds.centerX;
    const offsetY = snappedCenter.y - bounds.centerY;
    commitCurrentPageStrokes((prev) =>
      prev.map((stroke) =>
        selectedSetRef.current.has(stroke.id)
          ? { ...stroke, dx: stroke.dx + offsetX, dy: stroke.dy + offsetY }
          : stroke,
      ),
    );
  }, [commitCurrentPageStrokes, snapPoint, strokesRef]);

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
    currentPreviewPoints.current = [];
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
    setSelectionPreviewOffset({ dx: 0, dy: 0 });
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
    setSelectionPreviewOffset({ dx: 0, dy: 0 });
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

  const beginCanvasInteraction = useCallback(
    (pageIndex: number, point: Point | null) => {
      const api = interactionApiRef.current;

      if (!point) {
        if (toolRef.current === "lasso") api.clearSelection();
        return;
      }

      if (toolRef.current === "hand") {
        if (pageIndex !== currentPageIndexRef.current) {
          api.handleSelectPage(pageIndex);
        }
        return;
      }

      if (toolRef.current === "text") {
        if (pageIndex !== currentPageIndexRef.current) {
          api.handleSelectPage(pageIndex);
        }
        onTextPlacement?.({
          pageIndex,
          point: snapPoint(point, true),
        });
        return;
      }

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
    [onTextPlacement, snapPoint],
  );

  const moveCanvasInteraction = useCallback(
    (pageIndex: number, point: Point | null) => {
      const api = interactionApiRef.current;
      if (!isPointerDown.current) return;
      if (pointerPageIndex.current !== pageIndex) return;
      if (!point) return;

      if (toolRef.current === "lasso") {
        if (isMovingSelection.current) api.moveSelectionTo(point);
        else api.extendLasso(point);
        return;
      }

      if (toolRef.current === "eraser") {
        api.showEraserCursor(point);
        const previous = lastEraserPoint.current;
        const radius = activeWidthRef.current / 2;
        const minGap = Math.max(4, radius * 0.5);
        if (previous) {
          if (dist(previous, point) < minGap) return;
          api.eraseAlongSegment(previous, point);
        } else {
          api.eraseAtPoint(point);
        }
        lastEraserPoint.current = point;
        return;
      }

      api.extendStroke(point);
    },
    [],
  );

  const endCanvasInteraction = useCallback(
    (pageIndex: number) => {
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
    [strokesRef],
  );

  const cancelCanvasInteraction = useCallback((pageIndex: number) => {
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
  }, []);

  const toNativeGesturePoint = useCallback(
    (x: number, y: number): Point | null => {
      const point = {
        x: x / zoomRef.current,
        y: y / zoomRef.current,
      };
      const canvasSize = canvasSizeRef.current;
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > canvasSize.width ||
        point.y > canvasSize.height
      ) {
        return null;
      }
      return point;
    },
    [canvasSizeRef, zoomRef],
  );

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

              if (toolRef.current === "hand") {
                if (pageIndex !== currentPageIndexRef.current) {
                  api.handleSelectPage(pageIndex);
                }
                return;
              }

              event?.preventDefault?.();
              event?.stopPropagation?.();
              event?.nativeEvent?.target?.setPointerCapture?.(
                event.nativeEvent.pointerId,
              );
              beginCanvasInteraction(pageIndex, api.getLocalPagePoint(event));
            },
            onPointerMove: (event: any) => {
              const api = interactionApiRef.current;
              event?.preventDefault?.();
              moveCanvasInteraction(pageIndex, api.getLocalPagePoint(event));
            },
            onPointerUp: (event: any) => {
              event?.preventDefault?.();
              endCanvasInteraction(pageIndex);
            },
            onPointerCancel: () => {
              cancelCanvasInteraction(pageIndex);
            },
          } as any;
        }

        return {
          nativeGesture: Gesture.Pan()
            .runOnJS(true)
            .minDistance(0)
            .onStart((event) => {
              beginCanvasInteraction(
                pageIndex,
                toNativeGesturePoint(event.x, event.y),
              );
            })
            .onUpdate((event) => {
              moveCanvasInteraction(
                pageIndex,
                toNativeGesturePoint(event.x, event.y),
              );
            })
            .onEnd(() => {
              endCanvasInteraction(pageIndex);
            })
            .onFinalize(() => {
              cancelCanvasInteraction(pageIndex);
            }),
        };
      }),
    [
      beginCanvasInteraction,
      cancelCanvasInteraction,
      endCanvasInteraction,
      moveCanvasInteraction,
      pages,
      toNativeGesturePoint,
    ],
  );

  const acknowledgeActivePageRender = useCallback(
    (_renderedStrokes?: Stroke[]) => {
      return;
    },
    [],
  );

  return {
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
    selectAll,
    copySelection,
    pasteSelection,
    duplicateSelection,
    scaleSelection,
    rotateSelection,
    alignSelectionToGrid,
    canPaste: hasClipboard,
    activeAxisRotateHandles,
    startAxisRotation,
    rotateAxisToPoint,
    endAxisRotation,
    resetCanvasState,
    handleSelectPage,
    handleAddPageBelowCurrent,
    handleRemoveCurrentPage,
    clearPenModeArtifacts,
    clearEraserModeArtifacts,
    clearLassoModeArtifacts,
  };
}
