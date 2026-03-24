import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { PageThumbnail } from "@/components/editor/PageCanvas";
import type { Stroke } from "@/lib/editorTypes";

type PagesModalProps = {
  visible: boolean;
  pages: Stroke[][];
  currentPageIndex: number;
  onClose: () => void;
  onAddPage: () => void;
  onRemovePage: () => void;
  onSelectPage: (index: number) => void;
  onMovePage: (index: number, delta: -1 | 1) => void;
};

export function PagesModal({
  visible,
  pages,
  currentPageIndex,
  onClose,
  onAddPage,
  onRemovePage,
  onSelectPage,
  onMovePage,
}: PagesModalProps) {
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
            backgroundColor: "#FFFFFF",
            borderRadius: 18,
            padding: 16,
            gap: 12,
            borderWidth: 1,
            borderColor: "rgba(20,26,34,0.12)",
            alignSelf: "center",
            width: 420,
            maxWidth: "100%",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#121826" }}>
            Pages
          </Text>
          <Text style={{ color: "rgba(20,26,34,0.66)", fontSize: 12 }}>
            Current page {currentPageIndex + 1} of {Math.max(1, pages.length)}
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onAddPage}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(20,26,34,0.16)",
                backgroundColor: "rgba(20,26,34,0.06)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#121826", fontWeight: "900" }}>
                Add Below
              </Text>
            </Pressable>

            <Pressable
              onPress={onRemovePage}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(20,26,34,0.16)",
                backgroundColor:
                  pages.length <= 1 ? "rgba(20,26,34,0.06)" : "#ff3b30",
                alignItems: "center",
                opacity: pages.length <= 1 ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color: pages.length <= 1 ? "#121826" : "#fff",
                  fontWeight: "900",
                }}
              >
                Remove Current
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ gap: 10, paddingBottom: 2 }}
          >
            {pages.map((pg, idx) => {
              const selected = idx === currentPageIndex;
              return (
                <View
                  key={`page-row-${idx}`}
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Pressable
                    onPress={() => onSelectPage(idx)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: selected
                        ? "#121826"
                        : "rgba(20,26,34,0.18)",
                      backgroundColor: selected
                        ? "rgba(20,26,34,0.08)"
                        : "rgba(20,26,34,0.04)",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <PageThumbnail
                        strokes={pg}
                        selected={selected}
                        label={`Page ${idx + 1}`}
                      />
                      <Text style={{ color: "#121826", fontWeight: "800" }}>
                        {selected ? "Current" : "Select"}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => onMovePage(idx, -1)}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: "rgba(20,26,34,0.18)",
                      backgroundColor:
                        idx === 0
                          ? "rgba(20,26,34,0.04)"
                          : "rgba(20,26,34,0.08)",
                      opacity: idx === 0 ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: "#121826", fontWeight: "900" }}>
                      Up
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => onMovePage(idx, 1)}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: "rgba(20,26,34,0.18)",
                      backgroundColor:
                        idx === pages.length - 1
                          ? "rgba(20,26,34,0.04)"
                          : "rgba(20,26,34,0.08)",
                      opacity: idx === pages.length - 1 ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: "#121826", fontWeight: "900" }}>
                      Down
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

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
