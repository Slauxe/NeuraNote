import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import {
  STUDIO,
  StudioButton,
  StudioModalCard,
  StudioModalHeader,
} from "@/components/studio/StudioPrimitives";

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
          backgroundColor: "rgba(26,18,12,0.54)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable onPress={() => {}}>
          <StudioModalCard width={340}>
          <StudioModalHeader
            eyebrow="Tool rail"
            title="Toolbar layout"
            description="Switch between a wide desktop-style rail or a compact stacked tool strip."
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => onSelectOrientation("horizontal")}
              style={{
                flex: 1,
                paddingVertical: 16,
                borderRadius: 20,
                borderWidth: 1,
                borderColor:
                  toolbarOrientation === "horizontal"
                    ? "rgba(35,52,70,0.34)"
                    : "rgba(77,55,34,0.14)",
                backgroundColor:
                  toolbarOrientation === "horizontal"
                    ? "rgba(35,52,70,0.14)"
                    : "rgba(255,250,244,0.72)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: toolbarOrientation === "horizontal" ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>
                Horizontal
              </Text>
              <Text style={{ color: STUDIO.muted, fontSize: 12, marginTop: 4 }}>
                Wide row
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onSelectOrientation("vertical")}
              style={{
                flex: 1,
                paddingVertical: 16,
                borderRadius: 20,
                borderWidth: 1,
                borderColor:
                  toolbarOrientation === "vertical"
                    ? "rgba(35,52,70,0.34)"
                    : "rgba(77,55,34,0.14)",
                backgroundColor:
                  toolbarOrientation === "vertical"
                    ? "rgba(35,52,70,0.14)"
                    : "rgba(255,250,244,0.72)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: toolbarOrientation === "vertical" ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>
                Vertical
              </Text>
              <Text style={{ color: STUDIO.muted, fontSize: 12, marginTop: 4 }}>
                Tall stack
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
