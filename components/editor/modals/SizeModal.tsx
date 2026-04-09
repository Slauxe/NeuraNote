import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import {
  STUDIO,
  StudioButton,
  StudioModalCard,
  StudioModalHeader,
} from "@/components/studio/StudioPrimitives";

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
          backgroundColor: "rgba(26,18,12,0.54)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable onPress={() => {}}>
          <StudioModalCard width={420}>
          <StudioModalHeader
            eyebrow="Tool weight"
            title={`Select size (${sizeModalTool === "pen" ? "Pen" : sizeModalTool === "highlighter" ? "Highlighter" : "Eraser"})`}
            description="Choose a stroke profile that matches the kind of mark you want to make."
          />

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
                    paddingVertical: 14,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: selected
                      ? "rgba(35,52,70,0.34)"
                      : "rgba(77,55,34,0.14)",
                    backgroundColor: selected
                      ? "rgba(35,52,70,0.14)"
                      : "rgba(255,250,244,0.72)",
                    alignItems: "center",
                    shadowColor: selected ? STUDIO.accent : "#000",
                    shadowOpacity: selected ? 0.12 : 0.04,
                    shadowRadius: selected ? 14 : 8,
                    shadowOffset: { width: 0, height: 8 },
                    boxShadow: selected
                      ? "0 14px 28px rgba(35,52,70,0.18)"
                      : "0 8px 18px rgba(56,42,26,0.06)",
                  }}
                >
                  <Text style={{ color: selected ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>
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
