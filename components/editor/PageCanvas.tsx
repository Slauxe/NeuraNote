import {
  Canvas,
  Circle as SkiaCircle,
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
  PAGE_H,
  PAGE_W,
  type PageBackground,
  type Point,
  type Stroke,
} from "@/lib/editorTypes";

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

export const PageCanvas = React.memo(function PageCanvas({
  zoom,
  pageIndex,
  pageIsActive,
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
  return (
    <View
      key={`page-${pageIndex}`}
      style={
        {
          width: PAGE_W * zoom,
          height: PAGE_H * zoom,
          backgroundColor: PAGE_BG,
          borderWidth: 1,
          borderColor: PAGE_BORDER,
          borderRadius: 10,
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
            width: PAGE_W,
            height: PAGE_H,
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
            width: PAGE_W,
            height: PAGE_H,
            zIndex: 0,
          }}
        >
          {pageBackground.dataUrl ? (
            <Image
              source={{ uri: pageBackground.dataUrl }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: PAGE_W,
                height: PAGE_H,
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
              width={PAGE_W}
              height={PAGE_H}
            />
          ) : null}
        </View>

        {IS_WEB ? (
          <Svg
            width={PAGE_W}
            height={PAGE_H}
            pointerEvents="none"
            style={{ position: "absolute", left: 0, top: 0, zIndex: 2 }}
          >
            <SvgStrokeLayer
              strokes={renderStrokes}
              showSelection={pageIsActive}
              selectedSet={selectedSet}
            />

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
                fill="rgba(20,26,34,0.18)"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </Svg>
        ) : (
          <Canvas
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              zIndex: 2,
              width: PAGE_W,
              height: PAGE_H,
            }}
          >
            <SkiaStrokeLayer
              strokes={renderStrokes}
              showSelection={pageIsActive}
              selectedSet={selectedSet}
            />

            {pageIsActive && currentPath ? (
              <StrokePathNode
                d={currentPath}
                color={activeColor}
                strokeWidth={activeWidth}
              />
            ) : null}

            {pageIsActive && lassoPath ? (
              <StrokePathNode
                d={lassoPath}
                color="rgba(0,0,0,0.65)"
                strokeWidth={2}
                fillColor="rgba(0,0,0,0.05)"
                dashed
              />
            ) : null}

            {pageIsActive && tool === "eraser" && eraserCursor ? (
              <>
                <SkiaCircle
                  cx={eraserCursor.x}
                  cy={eraserCursor.y}
                  r={eraserRadius}
                  color="rgba(20,26,34,0.18)"
                />
                <SkiaCircle
                  cx={eraserCursor.x}
                  cy={eraserCursor.y}
                  r={eraserRadius}
                  color="rgba(0,0,0,0.45)"
                  style="stroke"
                  strokeWidth={2}
                />
              </>
            ) : null}
          </Canvas>
        )}
      </View>
    </View>
  );
});
