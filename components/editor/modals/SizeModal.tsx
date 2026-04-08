import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { STUDIO, StudioButton, StudioModalCard, StudioTitle } from "@/components/studio/StudioPrimitives";

type SizeOption = { label: string; width: number };

type SizeModalProps = {
  visible: boolean;
  sizeModalTool: "pen" | "highlighter" | "eraser";
  sizeOptions: SizeOption[];
  penSizeIndex: number;
  highlighterSizeIndex: number;
  eraserSizeIndex: number;
  eraserMultiplier: number;
  onClose: () => void;
  onSelectPenSize: (index: number) => void;
  onSelectHighlighterSize: (index: number) => void;
  onSelectEraserSize: (index: number) => void;
};

export function SizeModal({
  visible,
  sizeModalTool,
  sizeOptions,
  penSizeIndex,
  highlighterSizeIndex,
  eraserSizeIndex,
  eraserMultiplier,
  onClose,
  onSelectPenSize,
  onSelectHighlighterSize,
  onSelectEraserSize,
}: SizeModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(32,23,16,0.42)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable onPress={() => {}}>
          <StudioModalCard width={420}>
          <Text style={{ fontSize: 12, color: STUDIO.accentWarm, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>
            Tool weight
          </Text>
          <StudioTitle size={26}>
            Select size (
            {sizeModalTool === "pen"
              ? "Pen"
              : sizeModalTool === "highlighter"
                ? "Highlighter"
                : "Eraser"}
            )
          </StudioTitle>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {sizeOptions.map((opt, idx) => {
              const selected =
                sizeModalTool === "pen"
                  ? idx === penSizeIndex
                  : sizeModalTool === "highlighter"
                    ? idx === highlighterSizeIndex
                  : idx === eraserSizeIndex;

              return (
                <Pressable
                  key={opt.label}
                  onPress={() => {
                    if (sizeModalTool === "pen") onSelectPenSize(idx);
                    else if (sizeModalTool === "highlighter") {
                      onSelectHighlighterSize(idx);
                    }
                    else onSelectEraserSize(idx);
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: selected ? STUDIO.lineStrong : STUDIO.line,
                    backgroundColor: selected
                      ? "rgba(35,52,70,0.08)"
                      : "rgba(255,249,241,0.56)",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>
                    {opt.label}
                  </Text>
                  <Text style={{ color: STUDIO.muted, fontSize: 12 }}>
                    {sizeModalTool === "pen"
                      ? `Pen ${opt.width}px`
                      : sizeModalTool === "highlighter"
                        ? `Highlighter ${opt.width}px`
                      : `Eraser ${Math.round(opt.width * eraserMultiplier)}px`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <StudioButton label="Close" onPress={onClose} />
          </StudioModalCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
