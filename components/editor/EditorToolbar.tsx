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

type IconButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  bgOverride?: string;
  borderOverride?: string;
};

function IconButton({
  onPress,
  disabled,
  active,
  children,
  bgOverride,
  borderOverride,
}: IconButtonProps) {
  const bg = bgOverride ?? (active ? "#FFFFFF" : "rgba(20,26,34,0.05)");
  const border = borderOverride ?? "rgba(20,26,34,0.16)";

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

type EditorToolbarProps = {
  toolbarOrientation: "horizontal" | "vertical";
  toolbarPos: { x: number; y: number };
  handlePanHandlers: any;
  iconOn: string;
  iconOff: string;
  tool: "pen" | "eraser" | "lasso";
  lastPenTapMs: React.MutableRefObject<number>;
  lastEraserTapMs: React.MutableRefObject<number>;
  penColor: string;
  selectedCount: number;
  currentPageIndex: number;
  pageCount: number;
  zoom: number;
  historyIndex: number;
  historyLength: number;
  onToolbarLayout: (width: number, height: number) => void;
  onSetTool: (tool: "pen" | "eraser" | "lasso") => void;
  onOpenSizeModal: (tool: "pen" | "eraser") => void;
  onClearSelection: () => void;
  onClearLasso: () => void;
  onClearEraser: () => void;
  onOpenColorModal: () => void;
  onOpenPagesModal: () => void;
  onExportPdf: () => void;
  onDeleteSelection: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function EditorToolbar({
  toolbarOrientation,
  toolbarPos,
  handlePanHandlers,
  iconOn,
  iconOff,
  tool,
  lastPenTapMs,
  lastEraserTapMs,
  penColor,
  selectedCount,
  currentPageIndex,
  pageCount,
  zoom,
  historyIndex,
  historyLength,
  onToolbarLayout,
  onSetTool,
  onOpenSizeModal,
  onClearSelection,
  onClearLasso,
  onClearEraser,
  onOpenColorModal,
  onOpenPagesModal,
  onExportPdf,
  onDeleteSelection,
  onZoomOut,
  onResetZoom,
  onZoomIn,
  onUndo,
  onRedo,
}: EditorToolbarProps) {
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
      style={{
        position: "absolute",
        left: toolbarPos.x,
        top: toolbarPos.y,
        zIndex: 50,
      }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        onToolbarLayout(width, height);
      }}
      pointerEvents="box-none"
    >
      <View
        style={[
          {
            padding: 8,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(22,26,33,0.12)",
            backgroundColor: "rgba(255,255,255,0.92)",
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
            backgroundColor: "rgba(20,26,34,0.05)",
            borderWidth: 1,
            borderColor: "rgba(20,26,34,0.14)",
          }}
        >
          <MoreVertical size={20} color={iconOff} />
        </View>

        <IconButton
          onPress={() => {
            const now = Date.now();
            if (now - lastPenTapMs.current < 280) {
              onSetTool("pen");
              onOpenSizeModal("pen");
            } else {
              onSetTool("pen");
              onClearSelection();
              onClearLasso();
              onClearEraser();
            }
            lastPenTapMs.current = now;
          }}
          active={tool === "pen"}
        >
          <PenLine size={20} color={tool === "pen" ? iconOn : iconOff} />
        </IconButton>

        <IconButton
          onPress={() => {
            const now = Date.now();
            if (now - lastEraserTapMs.current < 280) {
              onSetTool("eraser");
              onOpenSizeModal("eraser");
            } else {
              onSetTool("eraser");
              onClearSelection();
              onClearLasso();
            }
            lastEraserTapMs.current = now;
          }}
          active={tool === "eraser"}
        >
          <Eraser size={20} color={tool === "eraser" ? iconOn : iconOff} />
        </IconButton>

        <IconButton
          onPress={() => {
            onSetTool("lasso");
            onClearLasso();
            onClearEraser();
          }}
          active={tool === "lasso"}
        >
          <LassoSelect size={20} color={tool === "lasso" ? iconOn : iconOff} />
        </IconButton>

        <IconButton
          onPress={onOpenColorModal}
          disabled={tool === "eraser"}
          bgOverride={penColor}
          borderOverride="rgba(255,255,255,0.30)"
        >
          <Palette size={20} color="#ffffff" />
        </IconButton>

        <IconButton onPress={onOpenPagesModal}>
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
        </IconButton>

        <IconButton onPress={onExportPdf}>
          <Text style={{ color: iconOff, fontWeight: "900", fontSize: 11 }}>
            PDF
          </Text>
        </IconButton>

        {tool === "lasso" ? (
          <IconButton
            onPress={onDeleteSelection}
            disabled={selectedCount === 0}
            bgOverride={selectedCount === 0 ? "rgba(20,26,34,0.05)" : "#ff3b30"}
            borderOverride={
              selectedCount === 0
                ? "rgba(20,26,34,0.16)"
                : "rgba(255,255,255,0.22)"
            }
          >
            <Trash2
              size={20}
              color={selectedCount === 0 ? iconOff : "#fff"}
            />
          </IconButton>
        ) : null}

        <View
          style={
            toolbarOrientation === "horizontal"
              ? ({ flexDirection: "row", gap: 8, marginLeft: 6 } as any)
              : ({ flexDirection: "column", gap: 8, marginTop: 6 } as any)
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
              backgroundColor: "rgba(20,26,34,0.05)",
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.16)",
            }}
          >
            <Text style={{ color: iconOff, fontWeight: "900", fontSize: 18 }}>
              -
            </Text>
          </Pressable>

          <Pressable
            onPress={onResetZoom}
            style={{
              height: 46,
              paddingHorizontal: 14,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(20,26,34,0.05)",
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.16)",
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
              backgroundColor: "rgba(20,26,34,0.05)",
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.16)",
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
              ? ({ flexDirection: "row", gap: 8, marginLeft: 6 } as any)
              : ({ flexDirection: "column", gap: 8, marginTop: 6 } as any)
          }
        >
          <IconButton onPress={onUndo} disabled={historyIndex <= 0}>
            <RotateCcw
              size={20}
              color={historyIndex > 0 ? iconOff : "rgba(255,255,255,0.4)"}
            />
          </IconButton>

          <IconButton
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
          </IconButton>
        </View>
      </View>
    </View>
  );
}
