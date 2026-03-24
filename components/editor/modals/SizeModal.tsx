import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

type SizeOption = { label: string; width: number };

type SizeModalProps = {
  visible: boolean;
  sizeModalTool: "pen" | "eraser";
  sizeOptions: SizeOption[];
  penSizeIndex: number;
  eraserSizeIndex: number;
  eraserMultiplier: number;
  onClose: () => void;
  onSelectPenSize: (index: number) => void;
  onSelectEraserSize: (index: number) => void;
};

export function SizeModal({
  visible,
  sizeModalTool,
  sizeOptions,
  penSizeIndex,
  eraserSizeIndex,
  eraserMultiplier,
  onClose,
  onSelectPenSize,
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
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 18,
            padding: 16,
            gap: 12,
            borderWidth: 1,
            borderColor: "rgba(20,26,34,0.06)",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#121826" }}>
            Select size ({sizeModalTool === "pen" ? "Pen" : "Eraser"})
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {sizeOptions.map((opt, idx) => {
              const selected =
                sizeModalTool === "pen"
                  ? idx === penSizeIndex
                  : idx === eraserSizeIndex;

              return (
                <Pressable
                  key={opt.label}
                  onPress={() => {
                    if (sizeModalTool === "pen") onSelectPenSize(idx);
                    else onSelectEraserSize(idx);
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: selected ? "#121826" : "rgba(20,26,34,0.18)",
                    backgroundColor: selected
                      ? "rgba(20,26,34,0.08)"
                      : "rgba(20,26,34,0.04)",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#121826", fontWeight: "900" }}>
                    {opt.label}
                  </Text>
                  <Text style={{ color: "rgba(20,26,34,0.66)", fontSize: 12 }}>
                    {sizeModalTool === "pen"
                      ? `Pen ${opt.width}px`
                      : `Eraser ${Math.round(opt.width * eraserMultiplier)}px`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onClose}
            style={{
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: "rgba(20,26,34,0.06)",
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.12)",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#121826", fontWeight: "900" }}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
