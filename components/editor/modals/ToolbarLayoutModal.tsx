import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { STUDIO, StudioButton, StudioModalCard, StudioTitle } from "@/components/studio/StudioPrimitives";

type ToolbarLayoutModalProps = {
  visible: boolean;
  toolbarOrientation: "horizontal" | "vertical";
  onClose: () => void;
  onSelectOrientation: (orientation: "horizontal" | "vertical") => void;
};

export function ToolbarLayoutModal({
  visible,
  toolbarOrientation,
  onClose,
  onSelectOrientation,
}: ToolbarLayoutModalProps) {
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
          <StudioModalCard width={340}>
          <Text style={{ fontSize: 12, color: STUDIO.accentWarm, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>
            Tool rail
          </Text>
          <StudioTitle size={26}>Toolbar layout</StudioTitle>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => onSelectOrientation("horizontal")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor:
                  toolbarOrientation === "horizontal"
                    ? STUDIO.lineStrong
                    : STUDIO.line,
                backgroundColor:
                  toolbarOrientation === "horizontal"
                    ? "rgba(35,52,70,0.08)"
                    : "rgba(255,249,241,0.56)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>
                Horizontal
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onSelectOrientation("vertical")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor:
                  toolbarOrientation === "vertical"
                    ? STUDIO.lineStrong
                    : STUDIO.line,
                backgroundColor:
                  toolbarOrientation === "vertical"
                    ? "rgba(35,52,70,0.08)"
                    : "rgba(255,249,241,0.56)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>
                Vertical
              </Text>
            </Pressable>
          </View>

          <StudioButton label="Close" onPress={onClose} />
          </StudioModalCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
