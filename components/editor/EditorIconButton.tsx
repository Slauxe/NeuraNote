import React from "react";
import { Pressable } from "react-native";

const BTN_BG = "rgba(255,249,241,0.30)";
const BTN_BG_ACTIVE = "rgba(35,52,70,0.10)";
const BTN_BORDER = "rgba(71,51,33,0.10)";
const BTN_BORDER_ACTIVE = "rgba(35,52,70,0.18)";

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
        width: 36,
        height: 36,
        borderRadius: 10,
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
        boxShadow: active ? "0 8px 18px rgba(56,42,26,0.10)" : "none",
      }}
    >
      {children}
    </Pressable>
  );
}
