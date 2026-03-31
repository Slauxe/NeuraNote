import React from "react";
import { Modal, Pressable, Text } from "react-native";

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
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            alignSelf: "center",
            width: 340,
            maxWidth: "100%",
            backgroundColor: "#FFFFFF",
            borderRadius: 18,
            padding: 16,
            gap: 12,
            borderWidth: 1,
            borderColor: "rgba(20,26,34,0.12)",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#121826" }}>
            Board background
          </Text>

          <Text style={{ color: "rgba(20,26,34,0.62)", fontSize: 12 }}>
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
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: selected ? "#121826" : "rgba(20,26,34,0.14)",
                  backgroundColor: selected
                    ? "rgba(20,26,34,0.08)"
                    : "rgba(20,26,34,0.04)",
                }}
              >
                <Text style={{ color: "#121826", fontWeight: "900" }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={onClose}
            style={{
              marginTop: 4,
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
