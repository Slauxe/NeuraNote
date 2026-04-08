import React from "react";
import { Modal, Pressable, ScrollView, Text } from "react-native";

import {
  STUDIO,
  StudioButton,
  StudioModalCard,
  StudioTitle,
} from "@/components/studio/StudioPrimitives";
import type { ShapePreset } from "@/lib/noteDocument";

const SHAPE_OPTIONS: { value: ShapePreset; label: string; note: string }[] = [
  { value: "line", label: "Straight line", note: "One clean line segment." },
  { value: "vector", label: "Vector", note: "Arrow with engineering-style direction." },
  { value: "rectangle", label: "Rectangle / square", note: "Box or square from a drag." },
  { value: "triangle", label: "Triangle", note: "Three-point construction inside the dragged bounds." },
  { value: "ellipse", label: "Circle / oval", note: "Ellipse fit to the dragged bounds." },
  { value: "angle", label: "Angle marker", note: "Reference angle with two rays." },
  { value: "dimension", label: "Dimension line", note: "Measurement line with terminal ticks." },
  { value: "axis", label: "Axis", note: "Single horizontal axis with an arrow." },
  { value: "axis-2d", label: "2D axis", note: "Standard x/y coordinate axes." },
  { value: "axis-3d", label: "3D axis", note: "Three-axis perspective guide." },
  { value: "table", label: "Table", note: "Basic engineering calculation table." },
];

type ShapeModalProps = {
  visible: boolean;
  value: ShapePreset;
  onClose: () => void;
  onSelect: (value: ShapePreset) => void;
};

export function ShapeModal({
  visible,
  value,
  onClose,
  onSelect,
}: ShapeModalProps) {
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
            <Text
              style={{
                fontSize: 12,
                color: STUDIO.accentWarm,
                fontWeight: "900",
                letterSpacing: 1.1,
                textTransform: "uppercase",
              }}
            >
              Drafting tools
            </Text>
            <StudioTitle size={26}>Choose a shape</StudioTitle>
            <Text style={{ color: STUDIO.muted, fontSize: 12 }}>
              Pick the shape family, then drag on the canvas to place it.
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 2 }}
            >
              {SHAPE_OPTIONS.map((option) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onSelect(option.value);
                      onClose();
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: selected ? STUDIO.lineStrong : STUDIO.line,
                      backgroundColor: selected
                        ? "rgba(35,52,70,0.08)"
                        : "rgba(255,249,241,0.56)",
                    }}
                  >
                    <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>
                      {option.label}
                    </Text>
                    <Text style={{ color: STUDIO.muted, fontSize: 12, marginTop: 4 }}>
                      {option.note}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <StudioButton label="Close" onPress={onClose} />
          </StudioModalCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
