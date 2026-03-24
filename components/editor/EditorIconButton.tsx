import React from "react";
import { Pressable } from "react-native";

const BTN_BG = "rgba(20,26,34,0.05)";
const BTN_BG_ACTIVE = "#FFFFFF";
const BTN_BORDER = "rgba(20,26,34,0.16)";

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
  const border = borderOverride ?? BTN_BORDER;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 46,
        height: 46,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </Pressable>
  );
}
