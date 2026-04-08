import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { G, Path, Rect } from "react-native-svg";

import {
  DISPLAY_FONT,
  STUDIO,
  StudioBadge,
  StudioButton,
  StudioModalCard,
  StudioSurface,
  StudioTitle,
} from "@/components/studio/StudioPrimitives";
import { normalizeDocToPages } from "@/lib/editorDocument";
import { PAGE_H, PAGE_W, type Stroke } from "@/lib/editorTypes";
import {
  createNote,
  deleteNote,
  duplicateNote,
  listNotes,
  loadNote,
  saveNote,
  type NoteDoc,
  type NoteMeta,
} from "../../lib/notesStorage";

const DEFAULT_COVER = "#8B5CF6";
const COVER_SWATCHES = [
  "#8B5CF6",
  "#2563EB",
  "#06B6D4",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#A855F7",
  "#111111",
  "#FFFFFF",
];

type SortMode = "updated" | "title";

type NoteCardData = NoteMeta & {
  kind: "page" | "infinite";
  pageCount: number;
  previewStrokes: Stroke[];
};

function fmtDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NotePreview({
  coverColor,
  strokes,
  kind,
  pageCount,
}: {
  coverColor: string;
  strokes: Stroke[];
  kind: "page" | "infinite";
  pageCount: number;
}) {
  const width = 150;
  const height = 180;
  const innerWidth = width - 24;
  const innerHeight = height - 24;
  const scale = Math.min(innerWidth / PAGE_W, innerHeight / PAGE_H);

  return (
    <View
      style={{
        width,
        height,
        borderRadius: 26,
        overflow: "hidden",
        backgroundColor: "rgba(255,250,244,0.95)",
        borderWidth: 1,
        borderColor: "rgba(68,48,29,0.12)",
        shadowColor: "#000",
        shadowOpacity: 0.14,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
        boxShadow: "0 18px 34px rgba(56,42,26,0.14)",
      }}
    >
      <View
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: coverColor,
          opacity: 0.12,
        }}
      />
      <View
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(255,250,244,0.36)",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          zIndex: 2,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <StudioBadge
          label={kind === "infinite" ? "Board" : "Pages"}
          tone="warm"
        />
        <StudioBadge label={`${pageCount} pg`} />
      </View>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={26} fill="#EEE4D7" />
        <Rect
          x={12}
          y={12}
          width={innerWidth}
          height={innerHeight}
          rx={18}
          fill="#FFFDF8"
        />
        <Rect
          x={12}
          y={12}
          width={innerWidth}
          height={innerHeight}
          rx={18}
          fill="rgba(255,255,255,0.66)"
        />
        <G transform={`translate(12 12) scale(${scale})`}>
          {strokes.slice(0, 14).map((stroke) => (
            <G key={stroke.id} transform={`translate(${stroke.dx} ${stroke.dy})`}>
              <Path
                d={stroke.d}
                stroke={stroke.c}
                strokeWidth={stroke.w}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </G>
          ))}
        </G>
      </Svg>
    </View>
  );
}

function HeaderButton({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <StudioButton
      label={label}
      onPress={onPress}
      tone={primary ? "primary" : "secondary"}
    />
  );
}

function SmallActionButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <StudioButton
      label={label}
      onPress={onPress}
      tone={danger ? "danger" : "secondary"}
    />
  );
}

export default function Explore() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compactHeader = viewportWidth < 760;
  const compactCreateOptions = viewportWidth < 520;

  const [notes, setNotes] = useState<NoteCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [editMode, setEditMode] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("No name");
  const [createCover, setCreateCover] = useState(DEFAULT_COVER);
  const [createMode, setCreateMode] = useState<"blank" | "pdf" | "infinite">(
    "blank",
  );
  const [createPdfName, setCreatePdfName] = useState<string | null>(null);
  const [createPdfPageCount, setCreatePdfPageCount] = useState(0);
  const [createPdfDoc, setCreatePdfDoc] = useState<NoteDoc | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRefreshError(null);
    try {
      const noteMetas = await listNotes();
      const hydrated = await Promise.all(
        noteMetas.map(async (meta) => {
          try {
            const loaded = await loadNote(meta.id);
            const normalized = normalizeDocToPages(loaded?.doc);
            return {
              ...meta,
              kind: normalized.kind,
              pageCount: normalized.pages.length,
              previewStrokes:
                normalized.pages[normalized.currentPageIndex] ??
                normalized.pages[0] ??
                [],
            } satisfies NoteCardData;
          } catch {
            return {
              ...meta,
              kind: "page",
              pageCount: 1,
              previewStrokes: [],
            } satisfies NoteCardData;
          }
        }),
      );
      setNotes(hydrated);
    } catch {
      setRefreshError("Could not load your notes right now.");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grid = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? notes.filter((note) =>
          (note.title || "No name").toLowerCase().includes(query),
        )
      : notes;

    return [...filtered].sort((a, b) => {
      if (sortMode === "title") {
        return (a.title || "No name").localeCompare(b.title || "No name");
      }
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, searchQuery, sortMode]);

  const openNote = (id: string) => {
    router.push({
      pathname: "/(tabs)",
      params: { noteId: id },
    });
  };

  const openCreateModal = () => {
    setCreateTitle("No name");
    setCreateCover(DEFAULT_COVER);
    setCreateMode("blank");
    setCreatePdfName(null);
    setCreatePdfPageCount(0);
    setCreatePdfDoc(null);
    setCreateBusy(false);
    setCreateError(null);
    setCreateOpen(true);
  };

  const commitCreate = async () => {
    if (createBusy) return;
    if (createMode === "pdf" && !createPdfDoc) {
      setCreateError("Select a PDF first.");
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    const title = createTitle.trim() || "No name";

    try {
      const initialDoc: NoteDoc | undefined =
        createMode === "pdf"
          ? (createPdfDoc ?? undefined)
          : createMode === "infinite"
            ? {
                version: 1,
                kind: "infinite",
                board: {
                  width: 2400,
                  height: 1800,
                  backgroundStyle: "grid",
                },
                strokes: [],
                pages: [{ id: "board-1", strokes: [] }],
                currentPageIndex: 0,
              }
            : {
                version: 1,
                kind: "page",
                strokes: [],
                pages: [{ id: "page-1", strokes: [] }],
                currentPageIndex: 0,
              };

      const id = await createNote(title, createCover, initialDoc);
      setBannerMessage("Note created.");
      setCreateOpen(false);
      openNote(id);
    } catch {
      setCreateError("Could not create note. Please try again.");
    } finally {
      setCreateBusy(false);
    }
  };

  const importPdf = async () => {
    if (createBusy) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const { importPdfAsNoteDoc } = await import("../../lib/pdfImport");
      const imported = await importPdfAsNoteDoc();
      if (!imported) return;

      setCreatePdfName(imported.fileName);
      setCreatePdfPageCount(imported.pageCount);
      setCreatePdfDoc(imported.noteDoc);
      if (imported.warning) {
        setCreateError(imported.warning);
      }
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      setCreateError(msg ? `Failed to import PDF: ${msg}` : "Failed to import PDF.");
    } finally {
      setCreateBusy(false);
    }
  };

  const startRename = (note: NoteMeta) => {
    setRenameId(note.id);
    setRenameValue(note.title || "No name");
    setRenameOpen(true);
  };

  const commitRename = async () => {
    if (!renameId) return;
    const title = renameValue.trim() || "No name";
    try {
      await saveNote(renameId, { title });
      setBannerMessage("Note renamed.");
      setRenameOpen(false);
      setRenameId(null);
      setRenameValue("");
      refresh();
    } catch {
      setBannerMessage("Could not rename that note.");
    }
  };

  const startDelete = (id: string) => {
    setDeleteId(id);
    setDeleteOpen(true);
  };

  const commitDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteNote(deleteId);
      setBannerMessage("Note deleted.");
      setDeleteOpen(false);
      setDeleteId(null);
      refresh();
    } catch {
      setBannerMessage("Could not delete that note.");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const nextId = await duplicateNote(id);
      setBannerMessage("Note duplicated.");
      refresh();
      openNote(nextId);
    } catch {
      setBannerMessage("Could not duplicate that note.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: STUDIO.bg }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: STUDIO.bg,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -140,
          right: -60,
          width: 320,
          height: 320,
          borderRadius: 999,
          backgroundColor: "rgba(154,92,55,0.10)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: -110,
          bottom: 40,
          width: 260,
          height: 260,
          borderRadius: 999,
          backgroundColor: "rgba(35,52,70,0.08)",
        }}
      />
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: 18,
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <View style={{ maxWidth: 520, flexShrink: 1, minWidth: Math.min(320, viewportWidth - 40) }}>
          <Text
            style={{
              color: STUDIO.accentWarm,
              fontSize: 11,
              fontWeight: "900",
              letterSpacing: 1.1,
              textTransform: "uppercase",
            }}
          >
            Editorial Studio
          </Text>
          <StudioTitle size={42}>Your working library.</StudioTitle>
          <Text style={{ color: STUDIO.muted, marginTop: 6, fontSize: 15, lineHeight: 22 }}>
            Sketchbooks, boards, and imported PDFs arranged like a curated shelf instead of
            a dashboard.
          </Text>
          <Text style={{ color: STUDIO.muted, marginTop: 10 }}>
            {loading ? "Loading..." : `${notes.length} note(s)`}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 10,
            paddingTop: compactHeader ? 0 : 8,
            flexWrap: "wrap",
            justifyContent: compactHeader ? "flex-start" : "flex-end",
          }}
        >
          <HeaderButton
            label={editMode ? "Done" : "Edit"}
            onPress={() => setEditMode((value) => !value)}
          />
          <HeaderButton label="+ Create" onPress={openCreateModal} primary />
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: 10,
          gap: 12,
        }}
      >
        <StudioSurface padding={14}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search notes"
            placeholderTextColor="rgba(30,35,41,0.42)"
            style={{
              height: 50,
              borderRadius: 18,
              paddingHorizontal: 16,
              backgroundColor: "rgba(255,252,247,0.84)",
              borderWidth: 1,
              borderColor: STUDIO.line,
              color: STUDIO.ink,
              fontWeight: "700",
            }}
          />

          <View
            style={{
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              marginTop: 12,
              flexWrap: "wrap",
            }}
          >
            <Text style={{ color: STUDIO.muted, fontWeight: "800" }}>Sort</Text>
          {(["updated", "title"] as const).map((mode) => {
            const selected = sortMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => setSortMode(mode)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: selected
                    ? "rgba(35,52,70,0.92)"
                    : "rgba(255,250,244,0.72)",
                  borderWidth: 1,
                  borderColor: selected ? "rgba(255,248,239,0.22)" : STUDIO.line,
                }}
              >
                <Text
                  style={{
                    color: selected ? "#FFF8EF" : STUDIO.ink,
                    fontWeight: "900",
                    fontSize: 12,
                  }}
                >
                  {mode === "updated" ? "Recently edited" : "Title"}
                </Text>
              </Pressable>
            );
          })}
          </View>
        </StudioSurface>

        {bannerMessage ? (
          <Pressable
            onPress={() => setBannerMessage(null)}
            style={{
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 12,
              backgroundColor: "rgba(62,107,76,0.10)",
              borderWidth: 1,
              borderColor: "rgba(62,107,76,0.18)",
            }}
          >
            <Text style={{ color: STUDIO.success, fontWeight: "800" }}>{bannerMessage}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 28,
        }}
      >
        {loading ? (
          <StudioSurface>
            <View style={{ alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              Loading notes
            </Text>
              <Text style={{ color: STUDIO.muted, textAlign: "center", maxWidth: 320 }}>
              Pulling your latest library and preview data now.
            </Text>
            </View>
          </StudioSurface>
        ) : refreshError ? (
          <StudioSurface>
            <View style={{ alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              Library unavailable
            </Text>
              <Text style={{ color: STUDIO.muted, textAlign: "center", maxWidth: 320 }}>
              {refreshError}
            </Text>
            <HeaderButton label="Retry" onPress={refresh} primary />
            </View>
          </StudioSurface>
        ) : grid.length === 0 && notes.length === 0 ? (
          <StudioSurface>
            <View style={{ alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              No notes yet
            </Text>
              <Text style={{ color: STUDIO.muted, textAlign: "center", maxWidth: 320 }}>
              Create your first note and it will show up here.
            </Text>
              <View style={{ marginTop: 10 }}>
                <HeaderButton label="Create a note" onPress={openCreateModal} primary />
              </View>
            </View>
          </StudioSurface>
        ) : grid.length === 0 ? (
          <StudioSurface>
            <View style={{ alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              No matching notes
            </Text>
              <Text style={{ color: STUDIO.muted, textAlign: "center", maxWidth: 320 }}>
              Try a different search or switch the sort to find what you need faster.
            </Text>
            </View>
          </StudioSurface>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
            {grid.map((note) => {
              const cover = note.coverColor || DEFAULT_COVER;
              return (
                <View
                  key={note.id}
                  style={{
                    width: 190,
                    borderRadius: 28,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: STUDIO.line,
                    backgroundColor: "rgba(255,249,241,0.64)",
                    shadowColor: "#000",
                    shadowOpacity: 0.1,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 12 },
                    boxShadow: "0 18px 36px rgba(56,42,26,0.12)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <Pressable
                    onPress={() => {
                      if (editMode) return;
                      openNote(note.id);
                    }}
                    style={{ backgroundColor: "transparent" }}
                  >
                    <NotePreview
                      coverColor={cover}
                      strokes={note.previewStrokes}
                      kind={note.kind}
                      pageCount={note.pageCount}
                    />

                    <View style={{ marginTop: 10 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 20,
                          fontWeight: "700",
                          color: STUDIO.ink,
                          fontFamily: DISPLAY_FONT,
                        }}
                      >
                        {note.title || "No name"}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          color: STUDIO.muted,
                          fontSize: 12,
                        }}
                      >
                        {fmtDate(note.updatedAt)}
                      </Text>
                      <Text
                        style={{
                          marginTop: 6,
                          color: STUDIO.accentWarm,
                          fontSize: 11,
                          fontWeight: "900",
                          letterSpacing: 0.7,
                          textTransform: "uppercase",
                        }}
                      >
                        {note.kind === "infinite"
                          ? "Infinite board"
                          : `${note.pageCount} page${note.pageCount === 1 ? "" : "s"}`}
                      </Text>
                    </View>
                  </Pressable>

                  {editMode ? (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <SmallActionButton
                        label="Duplicate"
                        onPress={() => handleDuplicate(note.id)}
                      />
                      <SmallActionButton
                        label="Rename"
                        onPress={() => startRename(note)}
                      />
                      <SmallActionButton
                        label="Delete"
                        danger
                        onPress={() => startDelete(note.id)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable
          onPress={() => setCreateOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(32,23,16,0.42)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable onPress={() => {}}>
            <StudioModalCard width={380}>
            <Text style={{ fontSize: 13, color: STUDIO.accentWarm, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>New note</Text>
            <StudioTitle size={28}>Create a fresh workspace.</StudioTitle>
            <TextInput value={createTitle} onChangeText={setCreateTitle} placeholder="Note name" placeholderTextColor="rgba(30,35,41,0.46)" style={{ height: 48, borderRadius: 16, paddingHorizontal: 14, backgroundColor: "rgba(255,251,246,0.86)", borderWidth: 1, borderColor: STUDIO.line, color: STUDIO.ink, fontWeight: "700" }} autoFocus />
            <Text style={{ color: STUDIO.muted, fontWeight: "800", marginTop: 4 }}>Note type</Text>
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Pressable onPress={() => setCreateMode("blank")} style={{ flexGrow: 1, flexBasis: compactCreateOptions ? "100%" : 100, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: createMode === "blank" ? STUDIO.lineStrong : STUDIO.line, backgroundColor: createMode === "blank" ? "rgba(35,52,70,0.08)" : "rgba(255,249,241,0.58)", alignItems: "center" }}><Text style={{ color: STUDIO.ink, fontWeight: "900" }}>Simple canvas</Text></Pressable>
              <Pressable onPress={() => setCreateMode("infinite")} style={{ flexGrow: 1, flexBasis: compactCreateOptions ? "100%" : 100, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: createMode === "infinite" ? STUDIO.lineStrong : STUDIO.line, backgroundColor: createMode === "infinite" ? "rgba(35,52,70,0.08)" : "rgba(255,249,241,0.58)", alignItems: "center" }}><Text style={{ color: STUDIO.ink, fontWeight: "900" }}>Infinite canvas</Text></Pressable>
              <Pressable onPress={() => setCreateMode("pdf")} style={{ flexGrow: 1, flexBasis: compactCreateOptions ? "100%" : 100, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: createMode === "pdf" ? STUDIO.lineStrong : STUDIO.line, backgroundColor: createMode === "pdf" ? "rgba(35,52,70,0.08)" : "rgba(255,249,241,0.58)", alignItems: "center" }}><Text style={{ color: STUDIO.ink, fontWeight: "900" }}>Import PDF</Text></Pressable>
            </View>
            {createMode === "pdf" ? (
              <View style={{ gap: 8 }}>
                <Pressable onPress={importPdf} style={{ paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(20,26,34,0.14)", backgroundColor: "rgba(20,26,34,0.06)", alignItems: "center", opacity: createBusy ? 0.65 : 1 }}>
                  <Text style={{ color: STUDIO.ink, fontWeight: "900" }}>{createBusy ? "Importing..." : "Choose PDF"}</Text>
                </Pressable>
                <Text style={{ color: STUDIO.muted, fontSize: 12 }}>{createPdfName ? `${createPdfName} (${createPdfPageCount} page(s) ready)` : "No PDF selected"}</Text>
              </View>
            ) : createMode === "infinite" ? (
              <Text style={{ color: STUDIO.muted, fontSize: 12 }}>Creates a large freeform board for diagrams, brainstorming, and long-form notes.</Text>
            ) : (
              <Text style={{ color: STUDIO.muted, fontSize: 12 }}>Creates the standard fixed-size page canvas you already have.</Text>
            )}
            <Text style={{ color: STUDIO.muted, fontWeight: "800", marginTop: 4 }}>Cover color</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {COVER_SWATCHES.map((color) => {
                const selected = color.toLowerCase() === createCover.toLowerCase();
                const border = color.toLowerCase() === "#ffffff" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.18)";
                return <Pressable key={color} onPress={() => setCreateCover(color)} style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: color, borderWidth: selected ? 3 : 1, borderColor: selected ? "#fff" : border }} />;
              })}
            </View>
            {createError ? <Text style={{ color: "#b42318", fontWeight: "700", fontSize: 12 }}>{createError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <View style={{ flex: 1 }}><StudioButton label="Cancel" onPress={() => setCreateOpen(false)} /></View>
              <View style={{ flex: 1 }}><StudioButton label="Create" onPress={commitCreate} tone="primary" disabled={createBusy || (createMode === "pdf" && !createPdfDoc)} /></View>
            </View>
            </StudioModalCard>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <Pressable onPress={() => setRenameOpen(false)} style={{ flex: 1, backgroundColor: "rgba(32,23,16,0.42)", justifyContent: "center", padding: 20 }}>
          <Pressable onPress={() => {}}>
            <StudioModalCard width={360}>
            <Text style={{ fontSize: 13, color: STUDIO.accentWarm, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>Refine title</Text>
            <StudioTitle size={26}>Rename note.</StudioTitle>
            <TextInput value={renameValue} onChangeText={setRenameValue} placeholder="Note name" placeholderTextColor="rgba(30,35,41,0.46)" style={{ height: 48, borderRadius: 16, paddingHorizontal: 14, backgroundColor: "rgba(255,251,246,0.86)", borderWidth: 1, borderColor: STUDIO.line, color: STUDIO.ink, fontWeight: "700" }} autoFocus />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><StudioButton label="Cancel" onPress={() => setRenameOpen(false)} /></View>
              <View style={{ flex: 1 }}><StudioButton label="Save" onPress={commitRename} tone="primary" /></View>
            </View>
            </StudioModalCard>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <Pressable onPress={() => setDeleteOpen(false)} style={{ flex: 1, backgroundColor: "rgba(32,23,16,0.42)", justifyContent: "center", padding: 20 }}>
          <Pressable onPress={() => {}}>
            <StudioModalCard width={360}>
            <Text style={{ fontSize: 13, color: STUDIO.danger, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>Permanent action</Text>
            <StudioTitle size={26}>Delete note?</StudioTitle>
            <Text style={{ color: STUDIO.muted }}>This cannot be undone.</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><StudioButton label="Cancel" onPress={() => setDeleteOpen(false)} /></View>
              <View style={{ flex: 1 }}><StudioButton label="Delete" onPress={commitDelete} tone="danger" /></View>
            </View>
            </StudioModalCard>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
