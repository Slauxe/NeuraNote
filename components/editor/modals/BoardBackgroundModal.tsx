import React from "react";
import { Modal, Pressable, Text } from "react-native";

import { STUDIO, StudioButton, StudioModalCard, StudioTitle } from "@/components/studio/StudioPrimitives";
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
          backgroundColor: "rgba(32,23,16,0.42)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable onPress={() => {}}>
          <StudioModalCard width={360}>
          <Text style={{ fontSize: 12, color: STUDIO.accentWarm, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>
            Board material
          </Text>
          <StudioTitle size={26}>Board background</StudioTitle>

          <Text style={{ color: STUDIO.muted, fontSize: 12 }}>
            Choose how the infinite canvas background should look.
          </Text>

          {OPTIONS.map((option) => {
            const selected = option === value;
            const label = option[0].toUpperCase() + option.slice(1);

            return (
              <Pressable
                key={option}
                onPress={() => onSelect(option)}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: selected ? STUDIO.lineStrong : STUDIO.line,
                  backgroundColor: selected
                    ? "rgba(35,52,70,0.08)"
                    : "rgba(255,249,241,0.56)",
                }}
              >
                <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>
                  {label}
                </Text>
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
