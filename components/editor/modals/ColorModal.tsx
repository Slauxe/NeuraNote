import Slider from "@react-native-community/slider";
import {
  Canvas,
  RoundedRect,
  LinearGradient as SkiaLinearGradient,
  vec,
} from "@shopify/react-native-skia";
import React from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { STUDIO, StudioModalCard, StudioTitle } from "@/components/studio/StudioPrimitives";

const IS_WEB = Platform.OS === "web";

function colorFromHue(h: number) {
  return `hsl(${Math.round(h)}, 100%, 50%)`;
}

function HueBar({ width, height }: { width: number; height: number }) {
  if (IS_WEB) {
    return (
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#ff0000" />
            <Stop offset="16.6%" stopColor="#ffff00" />
            <Stop offset="33.3%" stopColor="#00ff00" />
            <Stop offset="50%" stopColor="#00ffff" />
            <Stop offset="66.6%" stopColor="#0000ff" />
            <Stop offset="83.3%" stopColor="#ff00ff" />
            <Stop offset="100%" stopColor="#ff0000" />
          </LinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width={width}
          height={height}
          rx={height / 2}
          fill="url(#hue)"
        />
      </Svg>
    );
  }

  return (
    <Canvas style={{ width, height }}>
      <RoundedRect x={0} y={0} width={width} height={height} r={height / 2}>
        <SkiaLinearGradient
          start={vec(0, 0)}
          end={vec(width, 0)}
          colors={[
            "#ff0000",
            "#ffff00",
            "#00ff00",
            "#00ffff",
            "#0000ff",
            "#ff00ff",
            "#ff0000",
          ]}
        />
      </RoundedRect>
    </Canvas>
  );
}

type ColorModalProps = {
  visible: boolean;
  hue: number;
  penColor: string;
  colorSlots: string[];
  activeSlotIndex: number | null;
  tool: "pen" | "highlighter" | "shape" | "text" | "eraser" | "lasso" | "hand";
  onClose: () => void;
  onHueChange: (hue: number, color: string) => void;
  onActivatePenTool: () => void;
  onSetPenColor: (color: string) => void;
  onSetColorSlots: (updater: (prev: string[]) => string[]) => void;
  onSetActiveSlotIndex: (index: number | null) => void;
};

export function ColorModal({
  visible,
  hue,
  penColor,
  colorSlots,
  activeSlotIndex,
  tool,
  onClose,
  onHueChange,
  onActivatePenTool,
  onSetPenColor,
  onSetColorSlots,
  onSetActiveSlotIndex,
}: ColorModalProps) {
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
          backgroundColor: "rgba(32,23,16,0.32)",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          paddingTop: 60,
          paddingRight: 16,
          paddingLeft: 16,
        }}
      >
        <Pressable onPress={() => {}}>
          <StudioModalCard width={340}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <View>
              <Text style={{ color: STUDIO.accentWarm, fontSize: 11, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>
                Ink palette
              </Text>
              <StudioTitle size={24}>Color</StudioTitle>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  const firstEmpty = colorSlots.findIndex((c) => !c);
                  const target = firstEmpty === -1 ? 0 : firstEmpty;
                  onSetColorSlots((prev) => {
                    const next = [...prev];
                    next[target] = penColor;
                    return next;
                  });
                  onSetActiveSlotIndex(target);
                }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,249,241,0.72)",
                  borderWidth: 1,
                  borderColor: STUDIO.line,
                }}
              >
                <Text
                  style={{
                    color: "#121826",
                    fontSize: 18,
                    fontWeight: "900",
                  }}
                >
                  +
                </Text>
              </Pressable>

              <Pressable
                onPress={onClose}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,249,241,0.72)",
                  borderWidth: 1,
                  borderColor: STUDIO.line,
                }}
              >
                <Text
                  style={{
                    color: "#121826",
                    fontSize: 18,
                    fontWeight: "900",
                  }}
                >
                  x
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: STUDIO.muted, fontSize: 12 }}>
                Hue
              </Text>

              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: penColor,
                  borderWidth: 1,
                  borderColor: STUDIO.lineStrong,
                }}
              />
            </View>

            <View
              style={{
                height: 28,
                borderRadius: 14,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: STUDIO.line,
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                }}
              >
                <HueBar width={340 - 28} height={28} />
              </View>

              <Slider
                minimumValue={0}
                maximumValue={360}
                step={1}
                value={hue}
                onValueChange={(v) => {
                  const nextHue = typeof v === "number" ? v : Number(v);
                  onHueChange(nextHue, colorFromHue(nextHue));
                  if (tool !== "pen") onActivatePenTool();
                }}
                minimumTrackTintColor="transparent"
                maximumTrackTintColor="transparent"
                thumbTintColor="#ffffff"
              />
            </View>

            <Text style={{ color: STUDIO.muted, fontSize: 12 }}>
              Tap a slot to use, long-press to save
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {colorSlots.map((c, idx) => {
                const selected = idx === activeSlotIndex;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => {
                      if (!c) return;
                      onSetPenColor(c);
                      onSetActiveSlotIndex(idx);
                      if (tool !== "pen") onActivatePenTool();
                    }}
                    onLongPress={() => {
                      onSetColorSlots((prev) => {
                        const next = [...prev];
                        next[idx] = penColor;
                        return next;
                      });
                      onSetActiveSlotIndex(idx);
                    }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      backgroundColor: c || "rgba(20,26,34,0.06)",
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected
                        ? STUDIO.ink
                        : STUDIO.lineStrong,
                    }}
                  />
                );
              })}
            </View>
          </View>
          </StudioModalCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
