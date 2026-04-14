import {
  Canvas,
  DashPathEffect,
  Group as SkiaGroup,
  Path as SkiaPath,
  Rect as SkiaRect,
  Skia,
} from "@shopify/react-native-skia";
import React, { useEffect, useMemo, useState } from "react";
import { GestureDetector } from "react-native-gesture-handler";
import { Image, Platform, Text, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import PdfPageBackground from "../PdfPageBackground";
import { STUDIO } from "@/components/studio/StudioPrimitives";
import type {
  LivePreviewState,
  NativeStrokePreviewState,
} from "@/hooks/useCanvasInteractions";
import { pointsToSmoothPath } from "@/lib/editorGeometry";
import { getBackgroundAsset } from "@/lib/webBackgroundAssets";
import {
  INFINITE_CANVAS_H,
  INFINITE_CANVAS_W,
  PAGE_H,
  PAGE_W,
  type PageBackground,
  type Point,
  type Stroke,
} from "@/lib/editorTypes";
import type {
  InfiniteBoardBackgroundStyle,
  NoteKind,
  NoteTextItem,
  PageTemplate,
} from "@/lib/noteDocument";

const IS_WEB = Platform.OS === "web";
const DASH_INTERVALS = [6, 6];
const PAGE_BG = "#FFFDF8";
const PAGE_BORDER = "rgba(71,51,33,0.16)";
const NATIVE_CANVAS_AREA_LIMIT = 4_000_000;
const NATIVE_LIVE_OVERLAY_AREA_LIMIT = 5_500_000;

function getEventScreenPoint(event: any) {
  const native = event?.nativeEvent ?? event;
  const x = native?.pageX ?? native?.clientX;
  const y = native?.pageY ?? native?.clientY;

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Number(x), y: Number(y) };
}

function widthHeightArea(width: number, height: number) {
  return Math.max(0, width) * Math.max(0, height);
}

const TextItemOverlay = React.memo(function TextItemOverlay({
  item,
  zoom,
  pageWidth,
  pageHeight,
  canDrag,
  onMove,
}: {
  item: NoteTextItem;
  zoom: number;
  pageWidth: number;
  pageHeight: number;
  canDrag: boolean;
  onMove?: (itemId: string, point: Point) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragStart = React.useRef<{
    pointerId?: number;
    screenX: number;
    screenY: number;
    x: number;
    y: number;
  } | null>(null);

  const clampPoint = React.useCallback(
    (x: number, y: number) => ({
      x: Math.max(0, Math.min(pageWidth - 24, x)),
      y: Math.max(0, Math.min(pageHeight - 24, y)),
    }),
    [pageHeight, pageWidth],
  );

  const beginDrag = React.useCallback(
    (event: any) => {
      if (!canDrag || !onMove) return;
      const screenPoint = getEventScreenPoint(event);
      if (!screenPoint) return;

      dragStart.current = {
        pointerId: event?.nativeEvent?.pointerId,
        screenX: screenPoint.x,
        screenY: screenPoint.y,
        x: item.x,
        y: item.y,
      };
      setDragging(true);
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.nativeEvent?.target?.setPointerCapture?.(event.nativeEvent.pointerId);
    },
    [canDrag, item.x, item.y, onMove],
  );

  const moveDrag = React.useCallback(
    (event: any) => {
      if (!dragStart.current || !onMove) return;
      const screenPoint = getEventScreenPoint(event);
      if (!screenPoint) return;

      const nextPoint = clampPoint(
        dragStart.current.x + (screenPoint.x - dragStart.current.screenX) / zoom,
        dragStart.current.y + (screenPoint.y - dragStart.current.screenY) / zoom,
      );
      onMove(item.id, nextPoint);
      event?.preventDefault?.();
      event?.stopPropagation?.();
    },
    [clampPoint, item.id, onMove, zoom],
  );

  const endDrag = React.useCallback((event?: any) => {
    if (!dragStart.current) return;
    dragStart.current = null;
    setDragging(false);
    event?.preventDefault?.();
    event?.stopPropagation?.();
  }, []);

  return (
    <View
      pointerEvents={canDrag ? "auto" : "none"}
      onStartShouldSetResponder={() => !IS_WEB && canDrag}
      onMoveShouldSetResponder={() => !IS_WEB && canDrag}
      onResponderGrant={beginDrag}
      onResponderMove={moveDrag}
      onResponderRelease={endDrag}
      onResponderTerminate={endDrag}
      onPointerDown={IS_WEB ? beginDrag : undefined}
      onPointerMove={IS_WEB ? moveDrag : undefined}
      onPointerUp={IS_WEB ? endDrag : undefined}
      onPointerCancel={IS_WEB ? endDrag : undefined}
      style={{
        position: "absolute",
        left: item.x,
        top: item.y,
        zIndex: 3,
        touchAction: "none" as any,
      }}
    >
      <Text
        style={{
          color: item.color ?? "#1E2329",
          fontSize: item.fontSize ?? 18,
          fontWeight: "700",
          backgroundColor: dragging
            ? "rgba(255,248,236,0.92)"
            : "rgba(255,255,255,0.72)",
          paddingHorizontal: 4,
          paddingVertical: 2,
          borderRadius: 6,
          userSelect: "none" as any,
        }}
      >
        {item.text}
      </Text>
    </View>
  );
});

const AxisRotateHandleOverlay = React.memo(function AxisRotateHandleOverlay({
  origin,
  handle,
  zoom,
  label,
  onRotateStart,
  onRotate,
  onRotateEnd,
}: {
  origin: Point;
  handle: Point;
  zoom: number;
  label: string;
  onRotateStart: () => void;
  onRotate: (point: Point) => void;
  onRotateEnd: () => void;
}) {
  const dragStart = React.useRef<{ screenX: number; screenY: number } | null>(null);
  const handleStart = React.useRef<Point>({ ...handle });
  const dx = handle.x - origin.x;
  const dy = handle.y - origin.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const controlCenter = {
    x: handle.x + ux * 26,
    y: handle.y + uy * 26,
  };
  const labelOffsetX = ux >= 0 ? 16 : -92;
  const labelOffsetY = uy >= 0 ? -8 : -20;

  useEffect(() => {
    handleStart.current = handle;
  }, [handle]);

  const beginDrag = React.useCallback(
    (event: any) => {
      const screenPoint = getEventScreenPoint(event);
      if (!screenPoint) return;
      dragStart.current = {
        screenX: screenPoint.x,
        screenY: screenPoint.y,
      };
      handleStart.current = handle;
      onRotateStart();
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.nativeEvent?.target?.setPointerCapture?.(event.nativeEvent.pointerId);
    },
    [handle, onRotateStart],
  );

  const moveDrag = React.useCallback(
    (event: any) => {
      if (!dragStart.current) return;
      const screenPoint = getEventScreenPoint(event);
      if (!screenPoint) return;
      onRotate({
        x: handleStart.current.x + (screenPoint.x - dragStart.current.screenX) / zoom,
        y: handleStart.current.y + (screenPoint.y - dragStart.current.screenY) / zoom,
      });
      event?.preventDefault?.();
      event?.stopPropagation?.();
    },
    [onRotate, zoom],
  );

  const endDrag = React.useCallback(
    (event?: any) => {
      if (!dragStart.current) return;
      dragStart.current = null;
      onRotateEnd();
      event?.preventDefault?.();
      event?.stopPropagation?.();
    },
    [onRotateEnd],
  );

  return (
    <>
      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        style={{ position: "absolute", left: 0, top: 0, zIndex: 4 }}
      >
        <Path
          d={`M ${handle.x} ${handle.y} L ${controlCenter.x} ${controlCenter.y}`}
          stroke="rgba(35,52,70,0.42)"
          strokeWidth={2.5}
          strokeDasharray="8 6"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: controlCenter.x + labelOffsetX,
          top: controlCenter.y + labelOffsetY,
          zIndex: 5,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: "rgba(255,249,241,0.96)",
          borderWidth: 1,
          borderColor: "rgba(35,52,70,0.18)",
        }}
      >
        <Text
          style={{
            color: STUDIO.accent,
            fontSize: 11,
            fontWeight: "900",
            letterSpacing: 0.4,
          }}
        >
          {label}
        </Text>
      </View>
      <View
        pointerEvents="auto"
        onStartShouldSetResponder={() => !IS_WEB}
        onMoveShouldSetResponder={() => !IS_WEB}
        onResponderGrant={beginDrag}
        onResponderMove={moveDrag}
        onResponderRelease={endDrag}
        onResponderTerminate={endDrag}
        onPointerDown={IS_WEB ? beginDrag : undefined}
        onPointerMove={IS_WEB ? moveDrag : undefined}
        onPointerUp={IS_WEB ? endDrag : undefined}
        onPointerCancel={IS_WEB ? endDrag : undefined}
        style={{
          position: "absolute",
          left: controlCenter.x - 18,
          top: controlCenter.y - 18,
          width: 36,
          height: 36,
          borderRadius: 999,
          backgroundColor: "#FFF9F2",
          borderWidth: 3,
          borderColor: STUDIO.accent,
          zIndex: 5,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          boxShadow: "0 8px 18px rgba(56,42,26,0.14)",
          touchAction: "none" as any,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            borderWidth: 3,
            borderColor: STUDIO.accent,
            backgroundColor: "rgba(35,52,70,0.10)",
          }}
        />
      </View>
    </>
  );
});

function useResolvedBackgroundUrl(pageBackground: PageBackground) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(
    pageBackground.dataUrl,
  );

  useEffect(() => {
    let cancelled = false;

    if (pageBackground.dataUrl) {
      setResolvedUrl(pageBackground.dataUrl);
      return () => {
        cancelled = true;
      };
    }

    if (Platform.OS !== "web" || !pageBackground.assetId) {
      setResolvedUrl(null);
      return () => {
        cancelled = true;
      };
    }

    getBackgroundAsset(pageBackground.assetId)
      .then((url) => {
        if (!cancelled) setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pageBackground.assetId, pageBackground.dataUrl]);

  return resolvedUrl;
}

function StrokePathNode({
  d,
  color,
  strokeWidth,
  translateX = 0,
  translateY = 0,
  fillColor,
  dashed = false,
  opacity = 1,
}: {
  d: string;
  color: string;
  strokeWidth?: number;
  translateX?: number;
  translateY?: number;
  fillColor?: string;
  dashed?: boolean;
  opacity?: number;
}) {
  const path = useMemo(() => Skia.Path.MakeFromSVGString(d), [d]);

  if (!path) return null;

  return (
    <SkiaGroup transform={[{ translateX }, { translateY }]}>
      {fillColor ? <SkiaPath path={path} color={fillColor} style="fill" /> : null}
      <SkiaPath
        path={path}
        color={color}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeCap="round"
        strokeJoin="round"
        opacity={opacity}
      >
        {dashed ? <DashPathEffect intervals={DASH_INTERVALS} /> : null}
      </SkiaPath>
    </SkiaGroup>
  );
}

function EraserCursorNode({
  point,
  radius,
}: {
  point: Point;
  radius: number;
}) {
  const path = useMemo(() => {
    const next = Skia.Path.Make();
    next.addCircle(point.x, point.y, radius);
    return next;
  }, [point.x, point.y, radius]);

  return (
    <>
      <SkiaPath path={path} color="rgba(20,26,34,0.18)" style="fill" />
      <SkiaPath
        path={path}
        color="rgba(0,0,0,0.45)"
        style="stroke"
        strokeWidth={2}
      />
    </>
  );
}

const SkiaStrokeLayer = React.memo(
  function SkiaStrokeLayer({
    strokes,
    showSelection,
    selectedSet,
    selectionPreviewOffset,
  }: {
    strokes: Stroke[];
    showSelection: boolean;
    selectedSet: Set<string>;
    selectionPreviewOffset?: { dx: number; dy: number };
  }) {
    return (
      <>
        {strokes.map((s) => {
          const selected = showSelection && selectedSet.has(s.id);
          const previewDx = selected ? selectionPreviewOffset?.dx ?? 0 : 0;
          const previewDy = selected ? selectionPreviewOffset?.dy ?? 0 : 0;
          return (
            <React.Fragment key={s.id}>
              {selected ? (
                <StrokePathNode
                  d={s.d}
                  color="rgba(0,122,255,0.35)"
                  strokeWidth={s.w + 6}
                  translateX={s.dx + previewDx}
                  translateY={s.dy + previewDy}
                />
              ) : null}
              <StrokePathNode
                d={s.d}
                color={s.c}
                strokeWidth={s.w}
                translateX={s.dx + previewDx}
                translateY={s.dy + previewDy}
                opacity={s.a ?? 1}
                dashed={s.dashed === true}
              />
            </React.Fragment>
          );
        })}
      </>
    );
  },
  (prev, next) =>
    prev.strokes === next.strokes &&
    prev.showSelection === next.showSelection &&
    prev.selectedSet === next.selectedSet &&
    prev.selectionPreviewOffset === next.selectionPreviewOffset,
);

const SvgStrokeLayer = React.memo(
  function SvgStrokeLayer({
    strokes,
    showSelection,
    selectedSet,
    selectionPreviewOffset,
  }: {
    strokes: Stroke[];
    showSelection: boolean;
    selectedSet: Set<string>;
    selectionPreviewOffset?: { dx: number; dy: number };
  }) {
    return (
      <>
        {strokes.map((s) => {
          const selected = showSelection && selectedSet.has(s.id);
          const previewDx = selected ? selectionPreviewOffset?.dx ?? 0 : 0;
          const previewDy = selected ? selectionPreviewOffset?.dy ?? 0 : 0;
          return (
            <G key={s.id} transform={`translate(${s.dx + previewDx} ${s.dy + previewDy})`}>
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
                strokeOpacity={s.a ?? 1}
                strokeDasharray={s.dashed ? "6 6" : undefined}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </G>
          );
        })}
      </>
    );
  },
  (prev, next) =>
    prev.strokes === next.strokes &&
    prev.showSelection === next.showSelection &&
    prev.selectedSet === next.selectedSet &&
    prev.selectionPreviewOffset === next.selectionPreviewOffset,
);

const StaticStrokeSurface = React.memo(
  function StaticStrokeSurface({
    width,
    height,
    strokes,
    showSelection,
    selectedSet,
    selectionPreviewOffset,
    preferSvg = false,
  }: {
    width: number;
    height: number;
    strokes: Stroke[];
    showSelection: boolean;
    selectedSet: Set<string>;
    selectionPreviewOffset?: { dx: number; dy: number };
    preferSvg?: boolean;
  }) {
    if (IS_WEB || preferSvg) {
      return (
        <Svg
          width={width}
          height={height}
          pointerEvents="none"
          style={{ position: "absolute", left: 0, top: 0, zIndex: 2 }}
        >
          <SvgStrokeLayer
            strokes={strokes}
            showSelection={showSelection}
            selectedSet={selectedSet}
            selectionPreviewOffset={selectionPreviewOffset}
          />
        </Svg>
      );
    }

    return (
      <Canvas
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          zIndex: 2,
          width,
          height,
        }}
      >
        <SkiaStrokeLayer
          strokes={strokes}
          showSelection={showSelection}
          selectedSet={selectedSet}
          selectionPreviewOffset={selectionPreviewOffset}
        />
      </Canvas>
    );
  },
  (prev, next) =>
    prev.width === next.width &&
    prev.height === next.height &&
    prev.strokes === next.strokes &&
    prev.showSelection === next.showSelection &&
    prev.selectedSet === next.selectedSet &&
    prev.selectionPreviewOffset === next.selectionPreviewOffset,
);

const CommittedPageLayer = React.memo(
  function CommittedPageLayer({
    zoom,
    noteKind,
    pageWidth,
    pageHeight,
    boardBackgroundStyle,
    pageTemplate,
    pageBackground,
    renderStrokes,
    textItems,
    pageIsActive,
    selectedSet,
    selectionPreviewOffset,
    hideInteractiveOverlays,
    textMoveEnabled,
    onMoveTextItem,
  }: {
    zoom: number;
    noteKind: NoteKind;
    pageWidth: number;
    pageHeight: number;
    boardBackgroundStyle: InfiniteBoardBackgroundStyle;
    pageTemplate: PageTemplate;
    pageBackground: PageBackground;
    renderStrokes: Stroke[];
    textItems: NoteTextItem[];
    pageIsActive: boolean;
    selectedSet: Set<string>;
    selectionPreviewOffset: { dx: number; dy: number };
    hideInteractiveOverlays: boolean;
    textMoveEnabled: boolean;
    onMoveTextItem?: (itemId: string, point: Point) => void;
  }) {
    const isInfiniteCanvas = noteKind === "infinite";
    const preferSvgSurface =
      isInfiniteCanvas || widthHeightArea(pageWidth, pageHeight) > NATIVE_CANVAS_AREA_LIMIT;
    const showBoardPattern =
      isInfiniteCanvas &&
      !pageBackground.dataUrl &&
      !pageBackground.assetId &&
      !pageBackground.pdfUri &&
      pageWidth >= INFINITE_CANVAS_W &&
      pageHeight >= INFINITE_CANVAS_H;
    const resolvedBackgroundUrl = useResolvedBackgroundUrl(pageBackground);

    const boardPatternStyle =
      boardBackgroundStyle === "blank"
        ? null
        : boardBackgroundStyle === "dots"
          ? ({
              position: "absolute",
              inset: 0,
              backgroundColor: "#F2EBE1",
              backgroundImage:
                "radial-gradient(circle, rgba(154,92,55,0.18) 1.1px, transparent 1.4px)",
              backgroundSize: "24px 24px",
              backgroundPosition: "12px 12px",
            } as any)
          : ({
              position: "absolute",
              inset: 0,
              backgroundColor: "#F2EBE1",
              backgroundImage: [
                "linear-gradient(rgba(124,102,79,0.10) 1px, transparent 1px)",
                "linear-gradient(90deg, rgba(124,102,79,0.10) 1px, transparent 1px)",
                "linear-gradient(rgba(154,92,55,0.07) 1px, transparent 1px)",
                "linear-gradient(90deg, rgba(154,92,55,0.07) 1px, transparent 1px)",
              ].join(", "),
              backgroundSize: "30px 30px, 30px 30px, 150px 150px, 150px 150px",
            } as any);
    const pageTemplateStyle =
      pageTemplate === "ruled"
        ? ({
            position: "absolute",
            inset: 0,
            backgroundColor: PAGE_BG,
            backgroundImage:
              "linear-gradient(transparent 31px, rgba(35,52,70,0.10) 32px)",
            backgroundSize: "100% 32px",
          } as any)
        : pageTemplate === "dots"
          ? ({
              position: "absolute",
              inset: 0,
              backgroundColor: PAGE_BG,
              backgroundImage:
                "radial-gradient(circle, rgba(154,92,55,0.18) 1px, transparent 1.3px)",
              backgroundSize: "22px 22px",
              backgroundPosition: "11px 11px",
            } as any)
          : pageTemplate === "grid" || pageTemplate === "graph-coarse"
            ? ({
                position: "absolute",
                inset: 0,
                backgroundColor: PAGE_BG,
                backgroundImage: [
                  "linear-gradient(rgba(124,102,79,0.10) 1px, transparent 1px)",
                  "linear-gradient(90deg, rgba(124,102,79,0.10) 1px, transparent 1px)",
                ].join(", "),
                backgroundSize:
                  pageTemplate === "graph-coarse"
                    ? "32px 32px, 32px 32px"
                    : "28px 28px, 28px 28px",
              } as any)
            : pageTemplate === "graph-fine"
              ? ({
                  position: "absolute",
                  inset: 0,
                  backgroundColor: PAGE_BG,
                  backgroundImage: [
                    "linear-gradient(rgba(124,102,79,0.09) 1px, transparent 1px)",
                    "linear-gradient(90deg, rgba(124,102,79,0.09) 1px, transparent 1px)",
                  ].join(", "),
                  backgroundSize: "20px 20px, 20px 20px",
                } as any)
              : pageTemplate === "polar"
                ? ({
                    position: "absolute",
                    inset: 0,
                    backgroundColor: PAGE_BG,
                    backgroundImage:
                      "radial-gradient(circle at center, rgba(124,102,79,0.10) 1px, transparent 1px), repeating-radial-gradient(circle at center, transparent 0 39px, rgba(124,102,79,0.10) 39px 40px), repeating-conic-gradient(from 0deg, rgba(124,102,79,0.10) 0deg 1deg, transparent 1deg 15deg)",
                  } as any)
                : pageTemplate === "isometric"
                  ? ({
                      position: "absolute",
                      inset: 0,
                      backgroundColor: PAGE_BG,
                      backgroundImage: [
                        "linear-gradient(30deg, rgba(124,102,79,0.10) 1px, transparent 1px)",
                        "linear-gradient(150deg, rgba(124,102,79,0.10) 1px, transparent 1px)",
                        "linear-gradient(90deg, rgba(124,102,79,0.06) 1px, transparent 1px)",
                      ].join(", "),
                      backgroundSize: "28px 28px, 28px 28px, 28px 28px",
                    } as any)
                  : null;

    return (
      <>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: pageWidth,
            height: pageHeight,
            zIndex: 0,
            backgroundColor: isInfiniteCanvas ? "#F5EFE6" : undefined,
          }}
        >
          {showBoardPattern && boardPatternStyle ? (
            <View style={boardPatternStyle} />
          ) : null}
          {!isInfiniteCanvas && pageTemplateStyle ? (
            <View style={pageTemplateStyle} />
          ) : null}
          {resolvedBackgroundUrl ? (
            <Image
              source={{ uri: resolvedBackgroundUrl }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: pageWidth,
                height: pageHeight,
              }}
              resizeMode="cover"
            />
          ) : null}
          {!resolvedBackgroundUrl &&
          pageBackground.pdfUri &&
          pageBackground.pdfPageNumber ? (
            <PdfPageBackground
              uri={pageBackground.pdfUri}
              pageNumber={pageBackground.pdfPageNumber}
              width={pageWidth}
              height={pageHeight}
            />
          ) : null}
        </View>

        <StaticStrokeSurface
          width={pageWidth}
          height={pageHeight}
          strokes={renderStrokes}
          showSelection={pageIsActive && !hideInteractiveOverlays}
          selectedSet={selectedSet}
          selectionPreviewOffset={selectionPreviewOffset}
          preferSvg={preferSvgSurface}
        />

        {textItems.map((item) => (
          <TextItemOverlay
            key={item.id}
            item={item}
            zoom={zoom}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            canDrag={pageIsActive && textMoveEnabled}
            onMove={onMoveTextItem}
          />
        ))}
      </>
    );
  },
  (prev, next) =>
    prev.zoom === next.zoom &&
    prev.noteKind === next.noteKind &&
    prev.pageWidth === next.pageWidth &&
    prev.pageHeight === next.pageHeight &&
    prev.boardBackgroundStyle === next.boardBackgroundStyle &&
    prev.pageTemplate === next.pageTemplate &&
    prev.pageBackground === next.pageBackground &&
    prev.renderStrokes === next.renderStrokes &&
    prev.textItems === next.textItems &&
    prev.pageIsActive === next.pageIsActive &&
    prev.selectedSet === next.selectedSet &&
    prev.selectionPreviewOffset === next.selectionPreviewOffset &&
    prev.hideInteractiveOverlays === next.hideInteractiveOverlays &&
    prev.textMoveEnabled === next.textMoveEnabled &&
    prev.onMoveTextItem === next.onMoveTextItem,
);

const LiveOverlay = React.memo(
  function LiveOverlay({
    width,
    height,
    pageIsActive,
    currentPath,
    activeColor,
    activeWidth,
    activeOpacity = 1,
    lassoPath,
    tool,
    eraserCursor,
    eraserRadius,
    preferSvg = false,
    nativeStrokePreview,
  }: {
    width: number;
    height: number;
    pageIsActive: boolean;
    currentPath: string;
    activeColor: string;
    activeWidth: number;
    activeOpacity?: number;
    lassoPath: string;
    tool: "pen" | "highlighter" | "shape" | "text" | "eraser" | "lasso" | "hand";
    eraserCursor: Point | null;
    eraserRadius: number;
    preferSvg?: boolean;
    nativeStrokePreview?: NativeStrokePreviewState;
  }) {
    const [nativeSvgPath, setNativeSvgPath] = useState("");

    useEffect(() => {
      if (IS_WEB || !preferSvg || !nativeStrokePreview) return;

      let frameId: number | null = null;
      let lastSignature = "";

      const tick = () => {
        const points = nativeStrokePreview.points.value;
        const visible = nativeStrokePreview.visible.value;
        const signature = `${visible ? 1 : 0}:${points.length}`;

        if (signature !== lastSignature) {
          lastSignature = signature;
          setNativeSvgPath(
            visible && points.length > 0 ? pointsToSmoothPath(points) : "",
          );
        }

        frameId = requestAnimationFrame(tick);
      };

      frameId = requestAnimationFrame(tick);
      return () => {
        if (frameId != null) cancelAnimationFrame(frameId);
        setNativeSvgPath("");
      };
    }, [nativeStrokePreview, preferSvg]);

    const resolvedCurrentPath =
      !IS_WEB && preferSvg && nativeStrokePreview ? nativeSvgPath : currentPath;

    if (
      !pageIsActive ||
      (!resolvedCurrentPath && !lassoPath && !(tool === "eraser" && eraserCursor))
    ) {
      return null;
    }

    if (!IS_WEB && !preferSvg) {
      return (
        <Canvas
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 3,
            width,
            height,
          }}
        >
          {currentPath ? (
            <StrokePathNode
              d={currentPath}
              color={activeColor}
              strokeWidth={activeWidth}
              opacity={activeOpacity}
            />
          ) : null}

          {lassoPath ? (
            <StrokePathNode
              d={lassoPath}
              color="rgba(0,0,0,0.65)"
              strokeWidth={2}
              dashed
              fillColor="rgba(0,0,0,0.05)"
            />
          ) : null}

          {tool === "eraser" && eraserCursor ? (
            <EraserCursorNode point={eraserCursor} radius={eraserRadius} />
          ) : null}
        </Canvas>
      );
    }

    return (
      <Svg
        width={width}
        height={height}
        pointerEvents="none"
        style={{ position: "absolute", left: 0, top: 0, zIndex: 3 }}
      >
        {resolvedCurrentPath ? (
          <Path
            d={resolvedCurrentPath}
            stroke={activeColor}
            strokeWidth={activeWidth}
            strokeOpacity={activeOpacity}
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
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {tool === "eraser" && eraserCursor ? (
          <Circle
            cx={eraserCursor.x}
            cy={eraserCursor.y}
            r={eraserRadius}
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={2}
            fill="rgba(20,26,34,0.18)"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </Svg>
    );
  },
  (prev, next) =>
    prev.width === next.width &&
    prev.height === next.height &&
    prev.pageIsActive === next.pageIsActive &&
    prev.currentPath === next.currentPath &&
    prev.activeColor === next.activeColor &&
    prev.activeWidth === next.activeWidth &&
    prev.activeOpacity === next.activeOpacity &&
    prev.lassoPath === next.lassoPath &&
    prev.tool === next.tool &&
    prev.eraserCursor === next.eraserCursor &&
    prev.eraserRadius === next.eraserRadius &&
    prev.preferSvg === next.preferSvg &&
    prev.nativeStrokePreview === next.nativeStrokePreview,
);

const HIDDEN_PATH = "M 0 0";

const NativeLiveOverlay = React.memo(function NativeLiveOverlay({
  width,
  height,
  pageIsActive,
  activeColor,
  activeWidth,
  activeOpacity,
  livePreviewStateRef,
  nativeStrokePreview,
}: {
  width: number;
  height: number;
  pageIsActive: boolean;
  activeColor: string;
  activeWidth: number;
  activeOpacity?: number;
  livePreviewStateRef: React.RefObject<LivePreviewState>;
  nativeStrokePreview?: NativeStrokePreviewState;
}) {
  const lassoRef = React.useRef<any>(null);
  const eraserRef = React.useRef<any>(null);
  const frameRef = React.useRef<number | null>(null);
  const lastPreviewRef = React.useRef<LivePreviewState | null>(null);
  const emptyStrokePath = useMemo(() => Skia.Path.Make(), []);
  useEffect(() => {
    const tick = () => {
      const preview = livePreviewStateRef.current;
      if (preview) {
        const lastPreview = lastPreviewRef.current;
        if (
          !lastPreview ||
          lastPreview.currentPath !== preview.currentPath ||
          lastPreview.activeColor !== preview.activeColor ||
          lastPreview.activeWidth !== preview.activeWidth ||
          lastPreview.activeOpacity !== preview.activeOpacity ||
          lastPreview.lassoPath !== preview.lassoPath ||
          lastPreview.tool !== preview.tool ||
          lastPreview.eraserCursor !== preview.eraserCursor ||
          lastPreview.eraserRadius !== preview.eraserRadius ||
          lastPreview.pageIsActive !== preview.pageIsActive
        ) {
          lastPreviewRef.current = preview;
          const showLasso = preview.pageIsActive && preview.lassoPath.length > 0;
          const showEraser =
            preview.pageIsActive &&
            preview.tool === "eraser" &&
            preview.eraserCursor != null;

          lassoRef.current?.setNativeProps?.({
            d: showLasso ? preview.lassoPath : HIDDEN_PATH,
            strokeOpacity: showLasso ? 1 : 0,
            fillOpacity: showLasso ? 1 : 0,
          });
          eraserRef.current?.setNativeProps?.({
            cx: preview.eraserCursor?.x ?? 0,
            cy: preview.eraserCursor?.y ?? 0,
            r: showEraser ? preview.eraserRadius : 0,
            strokeOpacity: showEraser ? 1 : 0,
            fillOpacity: showEraser ? 1 : 0,
          });
        }
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [livePreviewStateRef]);

  return (
    <>
      <Canvas
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          zIndex: 3,
          width,
          height,
        }}
      >
        {pageIsActive ? (
          <SkiaPath
            path={nativeStrokePreview?.path ?? emptyStrokePath}
            color={activeColor}
            style="stroke"
            strokeWidth={activeWidth}
            strokeCap="round"
            strokeJoin="round"
            opacity={activeOpacity ?? 1}
          />
        ) : null}
      </Canvas>
      <Svg
        width={width}
        height={height}
        pointerEvents="none"
        style={{ position: "absolute", left: 0, top: 0, zIndex: 4 }}
      >
        <Path
          ref={lassoRef}
          d={HIDDEN_PATH}
          stroke="rgba(0,0,0,0.65)"
          strokeWidth={2}
          fill="rgba(0,0,0,0.05)"
          fillOpacity={0}
          strokeOpacity={0}
          strokeDasharray="6 6"
          vectorEffect="non-scaling-stroke"
        />
        <Circle
          ref={eraserRef}
          cx={0}
          cy={0}
          r={0}
          stroke="rgba(0,0,0,0.45)"
          strokeOpacity={0}
          strokeWidth={2}
          fill="rgba(20,26,34,0.18)"
          fillOpacity={0}
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </>
  );
});

const InteractivePageLayer = React.memo(
  function InteractivePageLayer({
    zoom,
    pageWidth,
    pageHeight,
    pageIsActive,
    currentPath,
    activeColor,
    activeWidth,
    activeOpacity,
    lassoPath,
    tool,
    eraserCursor,
    eraserRadius,
    hideInteractiveOverlays,
    livePreviewStateRef,
    nativeStrokePreview,
    noteKind,
    axisRotateHandles,
    onAxisRotateStart,
    onAxisRotate,
    onAxisRotateEnd,
  }: {
    zoom: number;
    pageWidth: number;
    pageHeight: number;
    pageIsActive: boolean;
    currentPath: string;
    activeColor: string;
    activeWidth: number;
    activeOpacity?: number;
    lassoPath: string;
    tool: "pen" | "highlighter" | "shape" | "text" | "eraser" | "lasso" | "hand";
    eraserCursor: Point | null;
    eraserRadius: number;
    hideInteractiveOverlays: boolean;
    livePreviewStateRef: React.RefObject<LivePreviewState>;
    nativeStrokePreview?: NativeStrokePreviewState;
    noteKind: NoteKind;
    axisRotateHandles?: {
      groupId: string;
      axisRole: "x" | "y" | "z";
      origin: Point;
      handle: Point;
    }[] | null;
    onAxisRotateStart?: (axisRole: "x" | "y" | "z") => void;
    onAxisRotate?: (point: Point) => void;
    onAxisRotateEnd?: () => void;
  }) {
    const preferSvgLiveOverlay =
      widthHeightArea(pageWidth, pageHeight) > NATIVE_LIVE_OVERLAY_AREA_LIMIT;
    const canUseNativeLiveOverlay =
      !IS_WEB &&
      !preferSvgLiveOverlay &&
      nativeStrokePreview != null &&
      nativeStrokePreview.path != null;
    return (
      <>
        {pageIsActive &&
        !hideInteractiveOverlays &&
        axisRotateHandles &&
        axisRotateHandles.length > 0 &&
        onAxisRotateStart &&
        onAxisRotate &&
        onAxisRotateEnd ? (
          axisRotateHandles.map((axisHandle) => (
            <AxisRotateHandleOverlay
              key={`${axisHandle.groupId}-${axisHandle.axisRole}`}
              origin={axisHandle.origin}
              handle={axisHandle.handle}
              zoom={zoom}
              label={`Rotate ${axisHandle.axisRole.toUpperCase()}`}
              onRotateStart={() => onAxisRotateStart(axisHandle.axisRole)}
              onRotate={onAxisRotate}
              onRotateEnd={onAxisRotateEnd}
            />
          ))
        ) : null}

        {canUseNativeLiveOverlay ? (
          <NativeLiveOverlay
            width={pageWidth}
            height={pageHeight}
            pageIsActive={pageIsActive}
            activeColor={activeColor}
            activeWidth={activeWidth}
            activeOpacity={activeOpacity}
            livePreviewStateRef={livePreviewStateRef}
            nativeStrokePreview={nativeStrokePreview}
          />
        ) : (
          <LiveOverlay
            width={pageWidth}
            height={pageHeight}
            pageIsActive={pageIsActive}
            currentPath={currentPath}
            activeColor={activeColor}
            activeWidth={activeWidth}
            activeOpacity={activeOpacity}
            lassoPath={lassoPath}
            tool={tool}
            eraserCursor={eraserCursor}
            eraserRadius={eraserRadius}
            preferSvg={preferSvgLiveOverlay}
            nativeStrokePreview={nativeStrokePreview}
          />
        )}
      </>
    );
  },
  (prev, next) =>
    prev.zoom === next.zoom &&
    prev.pageWidth === next.pageWidth &&
    prev.pageHeight === next.pageHeight &&
    prev.pageIsActive === next.pageIsActive &&
    prev.currentPath === next.currentPath &&
    prev.activeColor === next.activeColor &&
    prev.activeWidth === next.activeWidth &&
    prev.activeOpacity === next.activeOpacity &&
    prev.lassoPath === next.lassoPath &&
    prev.tool === next.tool &&
    prev.eraserCursor === next.eraserCursor &&
    prev.eraserRadius === next.eraserRadius &&
    prev.hideInteractiveOverlays === next.hideInteractiveOverlays &&
    prev.livePreviewStateRef === next.livePreviewStateRef &&
    prev.nativeStrokePreview === next.nativeStrokePreview &&
    prev.noteKind === next.noteKind &&
    prev.axisRotateHandles === next.axisRotateHandles &&
    prev.onAxisRotateStart === next.onAxisRotateStart &&
    prev.onAxisRotate === next.onAxisRotate &&
    prev.onAxisRotateEnd === next.onAxisRotateEnd,
);

export const PageThumbnail = React.memo(function PageThumbnail({
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
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: selected ? "rgba(71,51,33,0.24)" : "rgba(71,51,33,0.12)",
          backgroundColor: selected
            ? "rgba(255,249,241,0.92)"
            : "rgba(255,249,241,0.66)",
        }}
      >
        {IS_WEB ? (
          <Svg width={TW} height={TH}>
            <Rect x={0} y={0} width={TW} height={TH} rx={12} fill="#FFFDF8" />
            <G transform={`scale(${scale})`}>
              {strokes.map((s) => (
                <G key={s.id} transform={`translate(${s.dx} ${s.dy})`}>
                  <Path d={s.d} stroke={s.c} strokeWidth={s.w} fill="none" />
                </G>
              ))}
            </G>
          </Svg>
        ) : (
          <Canvas style={{ width: TW, height: TH }}>
            <SkiaRect x={0} y={0} width={TW} height={TH} color="#fff" />
            <SkiaGroup transform={[{ scale }]}>
              {strokes.map((s) => (
                <StrokePathNode
                  key={s.id}
                  d={s.d}
                  color={s.c}
                  strokeWidth={s.w}
                  translateX={s.dx}
                  translateY={s.dy}
                  opacity={s.a ?? 1}
                  dashed={s.dashed === true}
                />
              ))}
            </SkiaGroup>
          </Canvas>
        )}
      </View>
      <Text
        style={{
          color: selected ? "#3B2D21" : "rgba(59,45,33,0.80)",
          fontSize: 11,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </View>
  );
});

type PageCanvasProps = {
  zoom: number;
  pageIndex: number;
  pageIsActive: boolean;
  noteKind: NoteKind;
  pageWidth: number;
  pageHeight: number;
  boardBackgroundStyle: InfiniteBoardBackgroundStyle;
  pageTemplate: PageTemplate;
  pageBackground: PageBackground;
  renderStrokes: Stroke[];
  textItems: NoteTextItem[];
  selectedSet: Set<string>;
  selectionPreviewOffset: { dx: number; dy: number };
  selectionBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    centerX: number;
    centerY: number;
  } | null;
  selectionMenu?: React.ReactNode;
  currentPath: string;
  activeColor: string;
  activeWidth: number;
  activeOpacity?: number;
  lassoPath: string;
  tool: "pen" | "highlighter" | "shape" | "text" | "eraser" | "lasso" | "hand";
  eraserCursor: Point | null;
  eraserRadius: number;
  pageHandlers: any;
  textMoveEnabled?: boolean;
  onMoveTextItem?: (itemId: string, point: Point) => void;
  axisRotateHandles?: {
    groupId: string;
    axisRole: "x" | "y" | "z";
    origin: Point;
    handle: Point;
  }[] | null;
  onAxisRotateStart?: (axisRole: "x" | "y" | "z") => void;
  onAxisRotate?: (point: Point) => void;
  onAxisRotateEnd?: () => void;
  hideInteractiveOverlays?: boolean;
  onActivePageRender?: (renderStrokes: Stroke[]) => void;
  livePreviewStateRef: React.RefObject<LivePreviewState>;
  nativeStrokePreview?: NativeStrokePreviewState;
};

function PageCanvasInner({
  zoom,
  pageIndex,
  pageIsActive,
  noteKind,
  pageWidth,
  pageHeight,
  boardBackgroundStyle,
  pageTemplate,
  pageBackground,
  renderStrokes,
  textItems,
  selectedSet,
  selectionPreviewOffset,
  selectionBounds,
  selectionMenu,
  currentPath,
  activeColor,
  activeWidth,
  activeOpacity,
  lassoPath,
  tool,
  eraserCursor,
  eraserRadius,
  pageHandlers,
  textMoveEnabled = false,
  onMoveTextItem,
  axisRotateHandles,
  onAxisRotateStart,
  onAxisRotate,
  onAxisRotateEnd,
  hideInteractiveOverlays = false,
  onActivePageRender,
  livePreviewStateRef,
  nativeStrokePreview,
}: PageCanvasProps) {
  useEffect(() => {
    if (!pageIsActive) return;
    onActivePageRender?.(renderStrokes);
  }, [onActivePageRender, pageIsActive, renderStrokes]);

  const isInfiniteCanvas = noteKind === "infinite";
  const isAndroidInfiniteCanvas = Platform.OS === "android" && isInfiniteCanvas;

  const pageContent = (
    <View
      key={`page-${pageIndex}`}
      style={
        {
          width: pageWidth * zoom,
          height: pageHeight * zoom,
          backgroundColor: isInfiniteCanvas ? "#F5EFE6" : PAGE_BG,
          borderWidth: 1,
          borderColor: isInfiniteCanvas
            ? "rgba(154,92,55,0.12)"
            : PAGE_BORDER,
          borderRadius: isAndroidInfiniteCanvas ? 0 : isInfiniteCanvas ? 30 : 22,
          overflow: isAndroidInfiniteCanvas ? "visible" : "hidden",
          shadowColor: isAndroidInfiniteCanvas ? undefined : "#000",
          shadowOpacity: isAndroidInfiniteCanvas ? 0 : 0.12,
          shadowRadius: isAndroidInfiniteCanvas ? 0 : 24,
          shadowOffset: isAndroidInfiniteCanvas ? undefined : { width: 0, height: 14 },
          boxShadow: isAndroidInfiniteCanvas
            ? "none"
            : "0 22px 40px rgba(56,42,26,0.16)",
          touchAction: tool === "hand" ? "pan-x pan-y" : "none",
          userSelect: "none",
        } as any
      }
      {...(IS_WEB ? pageHandlers : undefined)}
    >
      <View
        style={
          {
            width: pageWidth,
            height: pageHeight,
            transform: [{ scale: zoom }],
            transformOrigin: "top left",
          } as any
        }
      >
        <CommittedPageLayer
          zoom={zoom}
          noteKind={noteKind}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          boardBackgroundStyle={boardBackgroundStyle}
          pageTemplate={pageTemplate}
          pageBackground={pageBackground}
          renderStrokes={renderStrokes}
          textItems={textItems}
          pageIsActive={pageIsActive}
          selectedSet={selectedSet}
          selectionPreviewOffset={selectionPreviewOffset}
          hideInteractiveOverlays={hideInteractiveOverlays}
          textMoveEnabled={textMoveEnabled}
          onMoveTextItem={onMoveTextItem}
        />

        <InteractivePageLayer
          zoom={zoom}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          pageIsActive={pageIsActive}
          noteKind={noteKind}
          currentPath={currentPath}
          activeColor={activeColor}
          activeWidth={activeWidth}
          activeOpacity={activeOpacity}
          lassoPath={lassoPath}
          tool={tool}
          eraserCursor={eraserCursor}
          eraserRadius={eraserRadius}
          hideInteractiveOverlays={hideInteractiveOverlays}
          livePreviewStateRef={livePreviewStateRef}
          nativeStrokePreview={nativeStrokePreview}
          axisRotateHandles={axisRotateHandles}
          onAxisRotateStart={onAxisRotateStart}
          onAxisRotate={onAxisRotate}
          onAxisRotateEnd={onAxisRotateEnd}
        />
      </View>

      {pageIsActive &&
      !hideInteractiveOverlays &&
      selectionBounds &&
      selectionMenu ? (
        <View
          style={{
            position: "absolute",
            left: Math.max(
              8,
              Math.min(
                pageWidth * zoom - 160,
                selectionBounds.maxX * zoom + 18,
              ),
            ),
            top: Math.max(
              8,
              Math.min(
                pageHeight * zoom - 220,
                selectionBounds.centerY * zoom - 90,
              ),
            ),
            zIndex: 4,
          }}
        >
          {selectionMenu}
        </View>
      ) : null}
    </View>
  );

  if (!IS_WEB && pageHandlers?.nativeGesture) {
    return (
      <GestureDetector gesture={pageHandlers.nativeGesture}>
        {pageContent}
      </GestureDetector>
    );
  }

  return pageContent;
}

function arePageCanvasPropsEqual(prev: PageCanvasProps, next: PageCanvasProps) {
  if (
    prev.zoom !== next.zoom ||
    prev.pageIndex !== next.pageIndex ||
    prev.pageIsActive !== next.pageIsActive ||
    prev.noteKind !== next.noteKind ||
    prev.pageWidth !== next.pageWidth ||
    prev.pageHeight !== next.pageHeight ||
    prev.boardBackgroundStyle !== next.boardBackgroundStyle ||
    prev.pageBackground !== next.pageBackground ||
    prev.renderStrokes !== next.renderStrokes ||
    prev.textItems !== next.textItems ||
    prev.selectionPreviewOffset !== next.selectionPreviewOffset ||
    prev.selectionBounds !== next.selectionBounds ||
    prev.selectionMenu !== next.selectionMenu ||
    prev.activeColor !== next.activeColor ||
    prev.activeWidth !== next.activeWidth ||
    prev.activeOpacity !== next.activeOpacity ||
    prev.tool !== next.tool ||
    prev.eraserRadius !== next.eraserRadius ||
    prev.pageHandlers !== next.pageHandlers ||
    prev.textMoveEnabled !== next.textMoveEnabled ||
    prev.onMoveTextItem !== next.onMoveTextItem ||
    prev.axisRotateHandles !== next.axisRotateHandles ||
    prev.onAxisRotateStart !== next.onAxisRotateStart ||
    prev.onAxisRotate !== next.onAxisRotate ||
    prev.onAxisRotateEnd !== next.onAxisRotateEnd ||
    prev.hideInteractiveOverlays !== next.hideInteractiveOverlays ||
    prev.onActivePageRender !== next.onActivePageRender ||
    prev.livePreviewStateRef !== next.livePreviewStateRef ||
    prev.nativeStrokePreview !== next.nativeStrokePreview
  ) {
    return false;
  }

  if (!next.pageIsActive) {
    return true;
  }

  return (
    prev.selectedSet === next.selectedSet &&
    prev.currentPath === next.currentPath &&
    prev.lassoPath === next.lassoPath &&
    prev.eraserCursor === next.eraserCursor
  );
}

export const PageCanvas = React.memo(PageCanvasInner, arePageCanvasPropsEqual);








