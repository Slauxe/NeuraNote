import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { PageThumbnail } from "@/components/editor/PageCanvas";
import { STUDIO, StudioButton, StudioModalCard, StudioTitle } from "@/components/studio/StudioPrimitives";
import type { Stroke } from "@/lib/editorTypes";
import type { PageSizePreset, PageTemplate } from "@/lib/noteDocument";

type PagesModalProps = {
  visible: boolean;
  pages: Stroke[][];
  currentPageIndex: number;
  onClose: () => void;
  onAddPage: () => void;
  onRemovePage: () => void;
  onSelectPage: (index: number) => void;
  onMovePage: (index: number, delta: -1 | 1) => void;
  bookmarkedPages: number[];
  onToggleBookmark: (index: number) => void;
  pageTemplate: PageTemplate;
  onSetPageTemplate: (value: PageTemplate) => void;
  pageSizePreset: PageSizePreset;
  onSetPageSizePreset: (value: PageSizePreset) => void;
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
  bookmarkedPages,
  onToggleBookmark,
  pageTemplate,
  onSetPageTemplate,
  pageSizePreset,
  onSetPageSizePreset,
}: PagesModalProps) {
  const pageTemplates: PageTemplate[] = [
    "blank",
    "ruled",
    "grid",
    "dots",
    "graph-fine",
    "graph-coarse",
    "polar",
    "isometric",
  ];
  const sizePresets: PageSizePreset[] = ["letter", "a4", "square"];

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
          <StudioModalCard width={440}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: STUDIO.accentWarm, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>
                Document flow
              </Text>
              <StudioTitle size={26}>Pages</StudioTitle>
            </View>

            <Pressable
              onPress={onClose}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: STUDIO.line,
                backgroundColor: "rgba(255,249,241,0.72)",
              }}
            >
              <Text style={{ color: STUDIO.ink, fontWeight: "900", fontSize: 12 }}>
                Close
              </Text>
            </Pressable>
          </View>
          <Text style={{ color: STUDIO.muted, fontSize: 12 }}>
            Current page {currentPageIndex + 1} of {Math.max(1, pages.length)}
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onAddPage}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: STUDIO.line,
                backgroundColor: "rgba(255,249,241,0.72)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>
                Add Below
              </Text>
            </Pressable>

            <Pressable
              onPress={onRemovePage}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: pages.length <= 1 ? STUDIO.line : "rgba(255,243,235,0.18)",
                backgroundColor:
                  pages.length <= 1 ? "rgba(255,249,241,0.72)" : STUDIO.danger,
                alignItems: "center",
                opacity: pages.length <= 1 ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color: pages.length <= 1 ? STUDIO.ink : "#fff",
                  fontWeight: "900",
                }}
              >
                Remove Current
              </Text>
            </Pressable>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: STUDIO.muted, fontSize: 12, fontWeight: "800" }}>
              Page template
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {pageTemplates.map((option) => {
                const selected = option === pageTemplate;
                return (
                  <Pressable
                    key={option}
                    onPress={() => onSetPageTemplate(option)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? STUDIO.lineStrong : STUDIO.line,
                      backgroundColor: selected
                        ? "rgba(35,52,70,0.08)"
                        : "rgba(255,249,241,0.52)",
                    }}
                  >
                    <Text style={{ color: STUDIO.ink, fontWeight: "800", fontSize: 12 }}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: STUDIO.muted, fontSize: 12, fontWeight: "800" }}>
              Page size
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {sizePresets.map((option) => {
                const selected = option === pageSizePreset;
                return (
                  <Pressable
                    key={option}
                    onPress={() => onSetPageSizePreset(option)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? STUDIO.lineStrong : STUDIO.line,
                      backgroundColor: selected
                        ? "rgba(35,52,70,0.08)"
                        : "rgba(255,249,241,0.52)",
                    }}
                  >
                    <Text style={{ color: STUDIO.ink, fontWeight: "800", fontSize: 12 }}>
                      {option.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: selected
                        ? STUDIO.lineStrong
                        : STUDIO.line,
                      backgroundColor: selected
                        ? "rgba(35,52,70,0.08)"
                        : "rgba(255,249,241,0.52)",
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
                      <Text style={{ color: STUDIO.ink, fontWeight: "800" }}>
                        {selected ? "Current" : "Select"}
                      </Text>
                      <Pressable
                        onPress={() => onToggleBookmark(idx)}
                        style={{
                          marginLeft: "auto",
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: STUDIO.line,
                          backgroundColor: bookmarkedPages.includes(idx)
                            ? "rgba(154,92,55,0.14)"
                            : "rgba(255,249,241,0.4)",
                        }}
                      >
                        <Text style={{ color: STUDIO.ink, fontWeight: "800", fontSize: 11 }}>
                          {bookmarkedPages.includes(idx) ? "Bookmarked" : "Bookmark"}
                        </Text>
                      </Pressable>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => onMovePage(idx, -1)}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: STUDIO.line,
                      backgroundColor:
                        idx === 0
                          ? "rgba(255,249,241,0.52)"
                          : "rgba(35,52,70,0.08)",
                      opacity: idx === 0 ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>
                      Up
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => onMovePage(idx, 1)}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: STUDIO.line,
                      backgroundColor:
                        idx === pages.length - 1
                          ? "rgba(255,249,241,0.52)"
                          : "rgba(35,52,70,0.08)",
                      opacity: idx === pages.length - 1 ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>
                      Down
                    </Text>
                  </Pressable>
                </View>
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

