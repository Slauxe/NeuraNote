import {
  Canvas,
  DashPathEffect,
  Group as SkiaGroup,
  Path as SkiaPath,
  Rect as SkiaRect,
  Skia,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { Image, Platform, Text, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import PdfPageBackground from "../PdfPageBackground";
import {
  INFINITE_CANVAS_H,
  INFINITE_CANVAS_W,
  PAGE_H,
  PAGE_W,
  type PageBackground,
  type Point,
  type Stroke,
} from "@/lib/editorTypes";
import type { InfiniteBoardBackgroundStyle, NoteKind } from "@/lib/noteDocument";

const IS_WEB = Platform.OS === "web";
const DASH_INTERVALS = [6, 6];
const PAGE_BG = "#ffffff";
const PAGE_BORDER = "rgba(20,26,34,0.18)";

function StrokePathNode({
  d,
  color,
  strokeWidth,
  translateX = 0,
  translateY = 0,
  fillColor,
  dashed = false,
}: {
  d: string;
  color: string;
  strokeWidth?: number;
  translateX?: number;
  translateY?: number;
  fillColor?: string;
  dashed?: boolean;
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
      >
        {dashed ? <DashPathEffect intervals={DASH_INTERVALS} /> : null}
      </SkiaPath>
    </SkiaGroup>
  );
}

const SkiaStrokeLayer = React.memo(
  function SkiaStrokeLayer({
    strokes,
    showSelection,
    selectedSet,
  }: {
    strokes: Stroke[];
    showSelection: boolean;
    selectedSet: Set<string>;
  }) {
    return (
      <>
        {strokes.map((s) => {
          const selected = showSelection && selectedSet.has(s.id);
          return (
            <React.Fragment key={s.id}>
              {selected ? (
                <StrokePathNode
                  d={s.d}
                  color="rgba(0,122,255,0.35)"
                  strokeWidth={s.w + 6}
                  translateX={s.dx}
                  translateY={s.dy}
                />
              ) : null}
              <StrokePathNode
                d={s.d}
                color={s.c}
                strokeWidth={s.w}
                translateX={s.dx}
                translateY={s.dy}
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
    prev.selectedSet === next.selectedSet,
);

const SvgStrokeLayer = React.memo(
  function SvgStrokeLayer({
    strokes,
    showSelection,
    selectedSet,
  }: {
    strokes: Stroke[];
    showSelection: boolean;
    selectedSet: Set<string>;
  }) {
    return (
      <>
        {strokes.map((s) => {
          const selected = showSelection && selectedSet.has(s.id);
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
      </>
    );
  },
  (prev, next) =>
    prev.strokes === next.strokes &&
    prev.showSelection === next.showSelection &&
    prev.selectedSet === next.selectedSet,
);

const StaticStrokeSurface = React.memo(
  function StaticStrokeSurface({
    width,
    height,
    strokes,
    showSelection,
    selectedSet,
  }: {
    width: number;
    height: number;
    strokes: Stroke[];
    showSelection: boolean;
    selectedSet: Set<string>;
  }) {
    if (IS_WEB) {
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
        />
      </Canvas>
    );
  },
  (prev, next) =>
    prev.width === next.width &&
    prev.height === next.height &&
    prev.strokes === next.strokes &&
    prev.showSelection === next.showSelection &&
    prev.selectedSet === next.selectedSet,
);

const LiveOverlay = React.memo(
  function LiveOverlay({
    width,
    height,
    pageIsActive,
    currentPath,
    activeColor,
    activeWidth,
    lassoPath,
    tool,
    eraserCursor,
    eraserRadius,
  }: {
    width: number;
    height: number;
    pageIsActive: boolean;
    currentPath: string;
    activeColor: string;
    activeWidth: number;
    lassoPath: string;
    tool: "pen" | "eraser" | "lasso";
    eraserCursor: Point | null;
    eraserRadius: number;
  }) {
    if (
      !pageIsActive ||
      (!currentPath && !lassoPath && !(tool === "eraser" && eraserCursor))
    ) {
      return null;
    }

    return (
      <Svg
        width={width}
        height={height}
        pointerEvents="none"
        style={{ position: "absolute", left: 0, top: 0, zIndex: 3 }}
      >
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
    prev.lassoPath === next.lassoPath &&
    prev.tool === next.tool &&
    prev.eraserCursor === next.eraserCursor &&
    prev.eraserRadius === next.eraserRadius,
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
        {IS_WEB ? (
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
                />
              ))}
            </SkiaGroup>
          </Canvas>
        )}
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
});

type PageCanvasProps = {
  zoom: number;
  pageIndex: number;
  pageIsActive: boolean;
  noteKind: NoteKind;
  pageWidth: number;
  pageHeight: number;
  boardBackgroundStyle: InfiniteBoardBackgroundStyle;
  pageBackground: PageBackground;
  renderStrokes: Stroke[];
  selectedSet: Set<string>;
  currentPath: string;
  activeColor: string;
  activeWidth: number;
  lassoPath: string;
  tool: "pen" | "eraser" | "lasso";
  eraserCursor: Point | null;
  eraserRadius: number;
  pageHandlers: any;
};

function PageCanvasInner({
  zoom,
  pageIndex,
  pageIsActive,
  noteKind,
  pageWidth,
  pageHeight,
  boardBackgroundStyle,
  pageBackground,
  renderStrokes,
  selectedSet,
  currentPath,
  activeColor,
  activeWidth,
  lassoPath,
  tool,
  eraserCursor,
  eraserRadius,
  pageHandlers,
}: PageCanvasProps) {
  const isInfiniteCanvas = noteKind === "infinite";
  const showBoardPattern =
    isInfiniteCanvas &&
    !pageBackground.dataUrl &&
    !pageBackground.pdfUri &&
    pageWidth >= INFINITE_CANVAS_W &&
    pageHeight >= INFINITE_CANVAS_H;

  const boardPatternStyle =
    boardBackgroundStyle === "blank"
      ? null
      : boardBackgroundStyle === "dots"
        ? ({
            position: "absolute",
            inset: 0,
            backgroundColor: "#F8FAFC",
            backgroundImage:
              "radial-gradient(circle, rgba(37,99,235,0.22) 1.2px, transparent 1.4px)",
            backgroundSize: "26px 26px",
            backgroundPosition: "13px 13px",
          } as any)
        : ({
            position: "absolute",
            inset: 0,
            backgroundColor: "#F8FAFC",
            backgroundImage: [
              "linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)",
              "linear-gradient(rgba(37,99,235,0.08) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(37,99,235,0.08) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize:
              "32px 32px, 32px 32px, 160px 160px, 160px 160px",
          } as any);

  return (
    <View
      key={`page-${pageIndex}`}
      style={
        {
          width: pageWidth * zoom,
          height: pageHeight * zoom,
          backgroundColor: isInfiniteCanvas ? "#F8FAFC" : PAGE_BG,
          borderWidth: 1,
          borderColor: isInfiniteCanvas
            ? "rgba(37,99,235,0.14)"
            : PAGE_BORDER,
          borderRadius: isInfiniteCanvas ? 24 : 10,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
          touchAction: "none",
          userSelect: "none",
        } as any
      }
      {...pageHandlers}
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
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: pageWidth,
            height: pageHeight,
            zIndex: 0,
            backgroundColor: isInfiniteCanvas ? "#F8FAFC" : undefined,
          }}
        >
          {showBoardPattern && boardPatternStyle ? (
            <View style={boardPatternStyle} />
          ) : null}
          {pageBackground.dataUrl ? (
            <Image
              source={{ uri: pageBackground.dataUrl }}
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
          {!pageBackground.dataUrl &&
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
          showSelection={pageIsActive}
          selectedSet={selectedSet}
        />

        <LiveOverlay
          width={pageWidth}
          height={pageHeight}
          pageIsActive={pageIsActive}
          currentPath={currentPath}
          activeColor={activeColor}
          activeWidth={activeWidth}
          lassoPath={lassoPath}
          tool={tool}
          eraserCursor={eraserCursor}
          eraserRadius={eraserRadius}
        />
      </View>
    </View>
  );
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
    prev.activeColor !== next.activeColor ||
    prev.activeWidth !== next.activeWidth ||
    prev.tool !== next.tool ||
    prev.eraserRadius !== next.eraserRadius ||
    prev.pageHandlers !== next.pageHandlers
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
