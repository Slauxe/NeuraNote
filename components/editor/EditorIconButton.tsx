import React from "react";
import { Pressable } from "react-native";

const BTN_BG = "rgba(255,255,255,0.02)";
const BTN_BG_ACTIVE = "rgba(15,23,42,0.08)";
const BTN_BORDER = "rgba(20,26,34,0.08)";
const BTN_BORDER_ACTIVE = "rgba(15,23,42,0.14)";

type EditorIconButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  bgOverride?: string;
  borderOverride?: string;
};

export function EditorIconButton({
  onPress,
  disabled,
  active,
  children,
  bgOverride,
  borderOverride,
}: EditorIconButtonProps) {
  const bg = bgOverride ?? (active ? BTN_BG_ACTIVE : BTN_BG);
  const border = borderOverride ?? (active ? BTN_BORDER_ACTIVE : BTN_BORDER);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        opacity: disabled ? 0.5 : 1,
        shadowColor: active ? "#0F172A" : "#000",
        shadowOpacity: active ? 0.08 : 0,
        shadowRadius: active ? 8 : 0,
        shadowOffset: { width: 0, height: 3 },
        boxShadow: active ? "0 6px 14px rgba(15,23,42,0.08)" : "none",
      }}
    >
      {children}
    </Pressable>
  );
}
