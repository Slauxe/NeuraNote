import {
  Eraser,
  Hand,
  Highlighter,
  LassoSelect,
  MoreHorizontal,
  MoreVertical,
  Palette,
  PenLine,
  RotateCcw,
  RotateCw,
  Shapes,
  Type,
} from "lucide-react-native";
import React, { useState } from "react";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { Modal, Pressable, Text, View } from "react-native";

import { EditorIconButton } from "@/components/editor/EditorIconButton";
import { STUDIO } from "@/components/studio/StudioPrimitives";

const TOPBAR_BG = "rgba(255,249,241,0.88)";
const TOPBAR_BORDER = "rgba(71,51,33,0.10)";
const BTN_BG = "rgba(255,249,241,0.34)";
const BTN_BORDER = "rgba(71,51,33,0.10)";

type Tool = "pen" | "highlighter" | "shape" | "text" | "eraser" | "lasso" | "hand";

type FloatingToolbarProps = {
  toolbarPos: { x: number; y: number };
  floatingStyle?: any;
  toolbarOrientation: "horizontal" | "vertical";
  penColor: string;
  tool: Tool;
  navLabel: string;
  navSubLabel: string;
  selectedCount: number;
  zoom: number;
  historyIndex: number;
  historyLength: number;
  onToolbarLayout: (size: { w: number; h: number }) => void;
  toolbarHandleGesture: any;
  onPenPress: () => void;
  onHighlighterPress: () => void;
  onShapePress: () => void;
  onTextPress: () => void;
  onEraserPress: () => void;
  onLassoPress: () => void;
  onHandPress: () => void;
  onColorPress: () => void;
  onPagesPress: () => void;
  onExportPdf: () => void;
  onExportImage: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function FloatingToolbar({
  toolbarPos,
  floatingStyle,
  toolbarOrientation,
  penColor,
  tool,
  navLabel,
  navSubLabel,
  selectedCount,
  zoom,
  historyIndex,
  historyLength,
  onToolbarLayout,
  toolbarHandleGesture,
  onPenPress,
  onHighlighterPress,
  onShapePress,
  onTextPress,
  onEraserPress,
  onLassoPress,
  onHandPress,
  onColorPress,
  onPagesPress,
  onExportPdf,
  onExportImage,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onUndo,
  onRedo,
}: FloatingToolbarProps) {
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const iconOn = STUDIO.accent;
  const iconOff = "rgba(30,35,41,0.80)";
  const dividerStyle =
    toolbarOrientation === "horizontal"
      ? ({
          width: 1,
          alignSelf: "stretch",
          backgroundColor: "rgba(20,26,34,0.08)",
          marginHorizontal: 1,
        } as const)
      : ({
          height: 1,
          alignSelf: "stretch",
          backgroundColor: "rgba(20,26,34,0.08)",
          marginVertical: 1,
        } as const);
  const toolbarRow =
    toolbarOrientation === "horizontal"
      ? ({
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        } as const)
      : ({
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        } as const);

  return (
    <>
      <View
        style={{ position: "absolute", left: 0, top: 0, zIndex: 50 }}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            {
              position: "absolute",
              left: toolbarPos.x,
              top: toolbarPos.y,
            },
            floatingStyle,
          ]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          onToolbarLayout({ w: width, h: height });
        }}
        >
          <View
          style={[
            {
              padding: 5,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: TOPBAR_BORDER,
              backgroundColor: TOPBAR_BG,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              boxShadow: "0 16px 30px rgba(56,42,26,0.14)",
              backdropFilter: "blur(12px)",
            },
            toolbarRow,
          ]}
        >
          <GestureDetector gesture={toolbarHandleGesture}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: BTN_BG,
                borderWidth: 1,
                borderColor: BTN_BORDER,
              }}
            >
              <MoreVertical size={16} color="rgba(59,45,33,0.76)" />
            </View>
          </GestureDetector>

          <EditorIconButton onPress={onPenPress} active={tool === "pen"}>
            <PenLine size={18} color={tool === "pen" ? iconOn : iconOff} />
          </EditorIconButton>

          <EditorIconButton
            onPress={onHighlighterPress}
            active={tool === "highlighter"}
          >
            <Highlighter
              size={18}
              color={tool === "highlighter" ? iconOn : iconOff}
            />
          </EditorIconButton>

          <EditorIconButton onPress={onShapePress} active={tool === "shape"}>
            <Shapes size={18} color={tool === "shape" ? iconOn : iconOff} />
          </EditorIconButton>

          <EditorIconButton onPress={onTextPress} active={tool === "text"}>
            <Type size={18} color={tool === "text" ? iconOn : iconOff} />
          </EditorIconButton>

          <EditorIconButton onPress={onEraserPress} active={tool === "eraser"}>
            <Eraser size={18} color={tool === "eraser" ? iconOn : iconOff} />
          </EditorIconButton>

          <EditorIconButton onPress={onLassoPress} active={tool === "lasso"}>
            <LassoSelect size={18} color={tool === "lasso" ? iconOn : iconOff} />
          </EditorIconButton>

          <EditorIconButton onPress={onHandPress} active={tool === "hand"}>
            <Hand size={18} color={tool === "hand" ? iconOn : iconOff} />
          </EditorIconButton>

          <EditorIconButton
            onPress={onColorPress}
            disabled={tool === "eraser" || tool === "hand"}
            bgOverride={penColor}
            borderOverride="rgba(255,255,255,0.30)"
          >
            <Palette size={18} color="#ffffff" />
          </EditorIconButton>

          <View style={dividerStyle} />

          <EditorIconButton onPress={() => setIsOverflowOpen(true)}>
            <MoreHorizontal size={18} color={iconOff} />
          </EditorIconButton>
          </View>
        </Animated.View>
      </View>

      <Modal
        visible={isOverflowOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOverflowOpen(false)}
      >
        <Pressable
          onPress={() => setIsOverflowOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(26,18,12,0.42)",
            justifyContent: "flex-start",
            alignItems: "flex-start",
            paddingLeft: toolbarPos.x,
            paddingTop: toolbarPos.y + 52,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              minWidth: 220,
              padding: 16,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "rgba(77,55,34,0.14)",
              backgroundColor: "rgba(255,250,243,0.97)",
              shadowColor: "#000",
              shadowOpacity: 0.16,
              shadowRadius: 26,
              shadowOffset: { width: 0, height: 14 },
              boxShadow: "0 24px 46px rgba(56,42,26,0.22)",
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -40,
                right: -20,
                width: 120,
                height: 120,
                borderRadius: 999,
                backgroundColor: "rgba(154,92,55,0.12)",
              }}
            />
            <Text
              style={{
                color: STUDIO.accentWarm,
                fontWeight: "900",
                fontSize: 11,
                letterSpacing: 1.1,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              More tools
            </Text>

            <Pressable
              onPress={() => {
                setIsOverflowOpen(false);
                onPagesPress();
              }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 16,
                backgroundColor: "rgba(35,52,70,0.10)",
                borderWidth: 1,
                borderColor: "rgba(35,52,70,0.16)",
                marginBottom: 10,
              }}
            >
              <Text style={{ color: STUDIO.accent, fontWeight: "900", fontSize: 12 }}>
                {navLabel}
              </Text>
              <Text
                style={{
                  color: "rgba(20,26,34,0.72)",
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                {navSubLabel}
              </Text>
            </Pressable>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <Pressable
                onPress={() => {
                  setIsOverflowOpen(false);
                  onExportPdf();
                }}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.42)",
                  borderWidth: 1,
                  borderColor: "rgba(77,55,34,0.12)",
                }}
              >
                <Text style={{ color: iconOff, fontWeight: "900", fontSize: 11 }}>
                  PDF
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setIsOverflowOpen(false);
                  onExportImage();
                }}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.42)",
                  borderWidth: 1,
                  borderColor: "rgba(77,55,34,0.12)",
                }}
              >
                <Text style={{ color: iconOff, fontWeight: "900", fontSize: 11 }}>
                  PNG
                </Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <Pressable
                onPress={onZoomOut}
                style={{
                  width: 36,
                  height: 40,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.42)",
                  borderWidth: 1,
                  borderColor: "rgba(77,55,34,0.12)",
                }}
              >
                <Text style={{ color: iconOff, fontWeight: "900", fontSize: 16 }}>
                  -
                </Text>
              </Pressable>

              <Pressable
                onPress={onZoomReset}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(35,52,70,0.10)",
                  borderWidth: 1,
                  borderColor: "rgba(35,52,70,0.16)",
                }}
              >
                <Text style={{ color: iconOff, fontWeight: "900", fontSize: 12 }}>
                  {Math.round(zoom * 100)}%
                </Text>
              </Pressable>

              <Pressable
                onPress={onZoomIn}
                style={{
                  width: 36,
                  height: 40,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.42)",
                  borderWidth: 1,
                  borderColor: "rgba(77,55,34,0.12)",
                }}
              >
                <Text style={{ color: iconOff, fontWeight: "900", fontSize: 16 }}>
                  +
                </Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => {
                  onUndo();
                }}
                disabled={historyIndex <= 0}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.42)",
                  borderWidth: 1,
                  borderColor: "rgba(77,55,34,0.12)",
                  opacity: historyIndex > 0 ? 1 : 0.45,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <RotateCcw size={16} color={iconOff} />
                  <Text style={{ color: iconOff, fontWeight: "900", fontSize: 11 }}>
                    Undo
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => {
                  onRedo();
                }}
                disabled={historyIndex >= historyLength - 1}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.42)",
                  borderWidth: 1,
                  borderColor: "rgba(77,55,34,0.12)",
                  opacity: historyIndex < historyLength - 1 ? 1 : 0.45,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <RotateCw size={16} color={iconOff} />
                  <Text style={{ color: iconOff, fontWeight: "900", fontSize: 11 }}>
                    Redo
                  </Text>
                </View>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
