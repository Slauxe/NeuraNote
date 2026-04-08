import React from "react";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";

export const DISPLAY_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});

export const STUDIO = {
  bg: "#EDE6DA",
  bgDeep: "#E4D6C6",
  ink: "#1E2329",
  muted: "rgba(30,35,41,0.62)",
  soft: "rgba(30,35,41,0.10)",
  line: "rgba(37,31,24,0.14)",
  lineStrong: "rgba(37,31,24,0.22)",
  panel: "rgba(255,251,245,0.78)",
  panelStrong: "rgba(255,249,241,0.92)",
  panelMuted: "rgba(246,237,226,0.88)",
  accent: "#233446",
  accentWarm: "#9A5C37",
  success: "#3E6B4C",
  danger: "#9C4334",
  shadow: "rgba(56,42,26,0.16)",
};

type StudioButtonProps = {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
};

export function StudioButton({
  label,
  onPress,
  tone = "secondary",
  disabled,
}: StudioButtonProps) {
  const backgroundColor =
    tone === "primary"
      ? STUDIO.accent
      : tone === "danger"
        ? STUDIO.danger
        : tone === "ghost"
          ? "transparent"
          : STUDIO.panelMuted;
  const borderColor =
    tone === "primary"
      ? "rgba(255,248,239,0.18)"
      : tone === "danger"
        ? "rgba(255,243,235,0.18)"
        : STUDIO.line;
  const color =
    tone === "primary" || tone === "danger" ? "#FFF9F2" : STUDIO.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor,
        borderWidth: 1,
        borderColor,
        opacity: disabled ? 0.55 : 1,
        shadowColor: tone === "primary" ? STUDIO.accent : "#000",
        shadowOpacity: tone === "primary" ? 0.22 : 0.04,
        shadowRadius: tone === "primary" ? 12 : 8,
        shadowOffset: { width: 0, height: 6 },
        boxShadow:
          tone === "primary"
            ? "0 12px 24px rgba(35,52,70,0.20)"
            : "0 8px 18px rgba(56,42,26,0.06)",
      }}
    >
      <Text style={{ color, fontWeight: "900", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function StudioBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent" | "warm";
}) {
  const color =
    tone === "accent" ? STUDIO.accent : tone === "warm" ? STUDIO.accentWarm : STUDIO.ink;
  const backgroundColor =
    tone === "accent"
      ? "rgba(35,52,70,0.10)"
      : tone === "warm"
        ? "rgba(154,92,55,0.12)"
        : "rgba(255,249,241,0.78)";
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: STUDIO.line,
        backgroundColor,
      }}
    >
      <Text
        style={{
          color,
          fontSize: 10,
          letterSpacing: 0.6,
          fontWeight: "900",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function StudioSurface({
  children,
  padding = 16,
}: {
  children: React.ReactNode;
  padding?: number;
}) {
  return (
    <View
      style={{
        backgroundColor: STUDIO.panel,
        borderRadius: 24,
        padding,
        borderWidth: 1,
        borderColor: STUDIO.line,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        boxShadow: "0 20px 40px rgba(56,42,26,0.10)",
        backdropFilter: "blur(12px)",
      }}
    >
      {children}
    </View>
  );
}

export function StudioModalCard({
  children,
  width = 360,
}: {
  children: React.ReactNode;
  width?: number;
}) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const resolvedWidth = Math.min(width, Math.max(280, viewportWidth - 32));

  return (
    <View
      style={{
        alignSelf: "center",
        width: resolvedWidth,
        maxWidth: "100%",
        maxHeight: Math.max(260, viewportHeight - 48),
        backgroundColor: STUDIO.panelStrong,
        borderRadius: 26,
        padding: 16,
        gap: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: STUDIO.line,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        boxShadow: "0 24px 48px rgba(34,25,17,0.18)",
        backdropFilter: "blur(16px)",
      }}
    >
      {children}
    </View>
  );
}

export function StudioTitle({
  children,
  size = 28,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <Text
      style={{
        color: STUDIO.ink,
        fontSize: size,
        fontWeight: "700",
        fontFamily: DISPLAY_FONT,
        letterSpacing: 0.2,
      }}
    >
      {children}
    </Text>
  );
}
