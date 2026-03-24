import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

type ToolbarLayoutModalProps = {
  visible: boolean;
  toolbarOrientation: "horizontal" | "vertical";
  onClose: () => void;
  onSelectOrientation: (orientation: "horizontal" | "vertical") => void;
};

export function ToolbarLayoutModal({
  visible,
  toolbarOrientation,
  onClose,
  onSelectOrientation,
}: ToolbarLayoutModalProps) {
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
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            alignSelf: "center",
            width: 320,
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
            Toolbar layout
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => onSelectOrientation("horizontal")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor:
                  toolbarOrientation === "horizontal"
                    ? "#fff"
                    : "rgba(20,26,34,0.18)",
                backgroundColor:
                  toolbarOrientation === "horizontal"
                    ? "rgba(255,255,255,0.14)"
                    : "rgba(255,255,255,0.06)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#121826", fontWeight: "900" }}>
                Horizontal
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onSelectOrientation("vertical")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor:
                  toolbarOrientation === "vertical"
                    ? "#fff"
                    : "rgba(20,26,34,0.18)",
                backgroundColor:
                  toolbarOrientation === "vertical"
                    ? "rgba(255,255,255,0.14)"
                    : "rgba(255,255,255,0.06)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#121826", fontWeight: "900" }}>
                Vertical
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onClose}
            style={{
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
