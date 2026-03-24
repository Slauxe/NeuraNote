import {
  Eraser,
  LassoSelect,
  MoreVertical,
  Palette,
  PenLine,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { EditorIconButton } from "@/components/editor/EditorIconButton";

const TOPBAR_BG = "rgba(255,255,255,0.92)";
const TOPBAR_BORDER = "rgba(22,26,33,0.12)";
const BTN_BG = "rgba(20,26,34,0.05)";
const BTN_BORDER = "rgba(20,26,34,0.16)";

type Tool = "pen" | "eraser" | "lasso";

type FloatingToolbarProps = {
  toolbarPos: { x: number; y: number };
  toolbarOrientation: "horizontal" | "vertical";
  penColor: string;
  tool: Tool;
  currentPageIndex: number;
  pageCount: number;
  selectedCount: number;
  zoom: number;
  historyIndex: number;
  historyLength: number;
  onToolbarLayout: (size: { w: number; h: number }) => void;
  handlePanHandlers: any;
  onPenPress: () => void;
  onEraserPress: () => void;
  onLassoPress: () => void;
  onColorPress: () => void;
  onPagesPress: () => void;
  onExportPdf: () => void;
  onDeleteSelection: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function FloatingToolbar({
  toolbarPos,
  toolbarOrientation,
  penColor,
  tool,
  currentPageIndex,
  pageCount,
  selectedCount,
  zoom,
  historyIndex,
  historyLength,
  onToolbarLayout,
  handlePanHandlers,
  onPenPress,
  onEraserPress,
  onLassoPress,
  onColorPress,
  onPagesPress,
  onExportPdf,
  onDeleteSelection,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onUndo,
  onRedo,
}: FloatingToolbarProps) {
  const iconOn = "#0B1026";
  const iconOff = "rgba(12,18,28,0.86)";
  const toolbarRow =
    toolbarOrientation === "horizontal"
      ? ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        } as const)
      : ({
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        } as const);

  return (
    <View
      style={{
        position: "absolute",
        left: toolbarPos.x,
        top: toolbarPos.y,
        zIndex: 50,
      }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        onToolbarLayout({ w: width, h: height });
      }}
      pointerEvents="box-none"
    >
      <View
        style={[
          {
            padding: 8,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: TOPBAR_BORDER,
            backgroundColor: TOPBAR_BG,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 5 },
            boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
            backdropFilter: "blur(4px)",
          },
          toolbarRow,
        ]}
      >
        <View
          {...handlePanHandlers}
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: BTN_BG,
            borderWidth: 1,
            borderColor: "rgba(20,26,34,0.14)",
          }}
        >
          <MoreVertical size={20} color={iconOff} />
        </View>

        <EditorIconButton onPress={onPenPress} active={tool === "pen"}>
          <PenLine size={20} color={tool === "pen" ? iconOn : iconOff} />
        </EditorIconButton>

        <EditorIconButton onPress={onEraserPress} active={tool === "eraser"}>
          <Eraser size={20} color={tool === "eraser" ? iconOn : iconOff} />
        </EditorIconButton>

        <EditorIconButton onPress={onLassoPress} active={tool === "lasso"}>
          <LassoSelect size={20} color={tool === "lasso" ? iconOn : iconOff} />
        </EditorIconButton>

        <EditorIconButton
          onPress={onColorPress}
          disabled={tool === "eraser"}
          bgOverride={penColor}
          borderOverride="rgba(255,255,255,0.30)"
        >
          <Palette size={20} color="#ffffff" />
        </EditorIconButton>

        <EditorIconButton onPress={onPagesPress}>
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
                color: "rgba(20,26,34,0.72)",
                fontSize: 10,
                lineHeight: 12,
              }}
            >
              {currentPageIndex + 1}/{Math.max(1, pageCount)}
            </Text>
          </View>
        </EditorIconButton>

        <EditorIconButton onPress={onExportPdf}>
          <Text style={{ color: iconOff, fontWeight: "900", fontSize: 11 }}>
            PDF
          </Text>
        </EditorIconButton>

        {tool === "lasso" ? (
          <EditorIconButton
            onPress={onDeleteSelection}
            disabled={selectedCount === 0}
            bgOverride={selectedCount === 0 ? BTN_BG : "#ff3b30"}
            borderOverride={
              selectedCount === 0 ? BTN_BORDER : "rgba(255,255,255,0.22)"
            }
          >
            <Trash2 size={20} color={selectedCount === 0 ? iconOff : "#fff"} />
          </EditorIconButton>
        ) : null}

        <View
          style={
            toolbarOrientation === "horizontal"
              ? ({ flexDirection: "row", gap: 8, marginLeft: 6 } as const)
              : ({ flexDirection: "column", gap: 8, marginTop: 6 } as const)
          }
        >
          <Pressable
            onPress={onZoomOut}
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
              -
            </Text>
          </Pressable>

          <Pressable
            onPress={onZoomReset}
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
            onPress={onZoomIn}
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

        <View
          style={
            toolbarOrientation === "horizontal"
              ? ({ flexDirection: "row", gap: 8, marginLeft: 6 } as const)
              : ({ flexDirection: "column", gap: 8, marginTop: 6 } as const)
          }
        >
          <EditorIconButton onPress={onUndo} disabled={historyIndex <= 0}>
            <RotateCcw
              size={20}
              color={historyIndex > 0 ? iconOff : "rgba(255,255,255,0.4)"}
            />
          </EditorIconButton>

          <EditorIconButton
            onPress={onRedo}
            disabled={historyIndex >= historyLength - 1}
          >
            <RotateCw
              size={20}
              color={
                historyIndex < historyLength - 1
                  ? iconOff
                  : "rgba(255,255,255,0.4)"
              }
            />
          </EditorIconButton>
        </View>
      </View>
    </View>
  );
}
