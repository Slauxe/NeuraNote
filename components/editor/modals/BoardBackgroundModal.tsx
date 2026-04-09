import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import {
  STUDIO,
  StudioButton,
  StudioModalCard,
  StudioModalHeader,
} from "@/components/studio/StudioPrimitives";
import type { InfiniteBoardBackgroundStyle } from "@/lib/noteDocument";

type BoardBackgroundModalProps = {
  visible: boolean;
  value: InfiniteBoardBackgroundStyle;
  onClose: () => void;
  onSelect: (value: InfiniteBoardBackgroundStyle) => void;
};

const OPTIONS: InfiniteBoardBackgroundStyle[] = ["grid", "dots", "blank"];

export function BoardBackgroundModal({
  visible,
  value,
  onClose,
  onSelect,
}: BoardBackgroundModalProps) {
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
          <StudioModalCard width={360}>
          <StudioModalHeader
            eyebrow="Board material"
            title="Board background"
            description="Choose the visual structure for the infinite canvas so sketches feel grounded."
          />

          {OPTIONS.map((option) => {
            const selected = option === value;
            const label = option[0].toUpperCase() + option.slice(1);

            return (
              <Pressable
                key={option}
                onPress={() => onSelect(option)}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: selected
                    ? "rgba(35,52,70,0.34)"
                    : "rgba(77,55,34,0.14)",
                  backgroundColor: selected
                    ? "rgba(35,52,70,0.14)"
                    : "rgba(255,250,244,0.72)",
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: selected ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>
                    {label}
                  </Text>
                  <Text style={{ color: STUDIO.muted, fontSize: 11 }}>
                    {option === "grid" ? "Measured" : option === "dots" ? "Light guide" : "Open field"}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          <StudioButton label="Close" onPress={onClose} />
          </StudioModalCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
