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

import {
  STUDIO,
  StudioModalCard,
  StudioModalHeader,
} from "@/components/studio/StudioPrimitives";

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
          backgroundColor: "rgba(26,18,12,0.46)",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          paddingTop: 60,
          paddingRight: 16,
          paddingLeft: 16,
        }}
      >
        <Pressable onPress={() => {}}>
          <StudioModalCard width={340}>
          <StudioModalHeader
            eyebrow="Ink palette"
            title="Color"
            description="Dial in a hue, then pin favorites to your quick slots."
            action={
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
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(35,52,70,0.10)",
                    borderWidth: 1,
                    borderColor: "rgba(35,52,70,0.16)",
                  }}
                >
                  <Text style={{ color: STUDIO.accent, fontSize: 18, fontWeight: "900" }}>
                    +
                  </Text>
                </Pressable>

                <Pressable
                  onPress={onClose}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,250,244,0.78)",
                    borderWidth: 1,
                    borderColor: "rgba(77,55,34,0.14)",
                  }}
                >
                  <Text style={{ color: STUDIO.ink, fontSize: 16, fontWeight: "900" }}>
                    x
                  </Text>
                </Pressable>
              </View>
            }
          />

          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "rgba(255,255,255,0.34)",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(77,55,34,0.10)",
              }}
            >
              <Text style={{ color: STUDIO.muted, fontSize: 12, fontWeight: "800" }}>
                Hue
              </Text>

              <View
                style={{
                  width: 26,
                  height: 26,
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
                borderColor: "rgba(77,55,34,0.14)",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.36)",
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

            <Text style={{ color: STUDIO.muted, fontSize: 12, lineHeight: 18 }}>
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
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      backgroundColor: c || "rgba(20,26,34,0.06)",
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected
                        ? STUDIO.accent
                        : STUDIO.lineStrong,
                      shadowColor: selected ? STUDIO.accent : "#000",
                      shadowOpacity: selected ? 0.18 : 0.04,
                      shadowRadius: selected ? 12 : 6,
                      shadowOffset: { width: 0, height: 6 },
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
