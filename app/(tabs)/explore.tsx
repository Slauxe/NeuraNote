import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";

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

const WORKSPACE_BG = "#F1F3F6";
const TOPBAR_BG = "rgba(255,255,255,0.94)";
const TOPBAR_BORDER = "rgba(20,26,34,0.12)";
const BTN_BG = "rgba(20,26,34,0.06)";
const BTN_BORDER = "rgba(20,26,34,0.16)";
const TEXT_MAIN = "rgba(20,26,34,0.94)";
const TEXT_MUTED = "rgba(20,26,34,0.62)";
const ACCENT = "#2563EB";
const SUCCESS = "#15803D";

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
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "rgba(20,26,34,0.08)",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      <View
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: coverColor,
          opacity: 0.08,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          right: 10,
          zIndex: 2,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            color: "#121826",
            fontSize: 10,
            fontWeight: "900",
            backgroundColor: "rgba(255,255,255,0.9)",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 999,
          }}
        >
          {kind === "infinite" ? "Board" : "Pages"}
        </Text>
        <Text
          style={{
            color: "rgba(20,26,34,0.72)",
            fontSize: 10,
            fontWeight: "800",
            backgroundColor: "rgba(255,255,255,0.84)",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 999,
          }}
        >
          {pageCount} pg
        </Text>
      </View>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={16} fill="#F8FAFC" />
        <Rect x={12} y={12} width={innerWidth} height={innerHeight} rx={10} fill="#FFFFFF" />
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
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: primary ? ACCENT : BTN_BG,
        borderWidth: primary ? 0 : 1,
        borderColor: BTN_BORDER,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 12,
        shadowColor: primary ? "#2563EB" : "#000",
        shadowOpacity: primary ? 0.35 : 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        boxShadow: primary
          ? "0 10px 24px rgba(37,99,235,0.35)"
          : "0 8px 20px rgba(0,0,0,0.24)",
      }}
    >
      <Text style={{ color: primary ? "#fff" : "#121826", fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
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
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: danger ? "#ff3b30" : "rgba(255,255,255,0.10)",
        borderWidth: 1,
        borderColor: danger ? "rgba(255,255,255,0.18)" : BTN_BORDER,
      }}
    >
      <Text style={{ color: danger ? "#fff" : "#121826", fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function Explore() {
  const router = useRouter();

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
    <View style={{ flex: 1, backgroundColor: WORKSPACE_BG }}>
      <View
        style={{
          paddingTop: 20,
          paddingHorizontal: 20,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: TOPBAR_BORDER,
          backgroundColor: TOPBAR_BG,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backdropFilter: "blur(10px)",
        }}
      >
        <View>
          <Text style={{ fontSize: 28, fontWeight: "900", color: "#121826" }}>
            Explore
          </Text>
          <Text style={{ color: TEXT_MUTED, marginTop: 2 }}>
            {loading ? "Loading..." : `${notes.length} note(s)`}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
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
          paddingTop: 14,
          paddingBottom: 6,
          gap: 12,
        }}
      >
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search notes"
          placeholderTextColor="rgba(20,26,34,0.46)"
          style={{
            height: 46,
            borderRadius: 14,
            paddingHorizontal: 14,
            backgroundColor: "rgba(255,255,255,0.92)",
            borderWidth: 1,
            borderColor: "rgba(20,26,34,0.10)",
            color: "#121826",
            fontWeight: "700",
          }}
        />

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Text style={{ color: TEXT_MUTED, fontWeight: "800" }}>Sort</Text>
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
                  backgroundColor: selected ? "#121826" : "rgba(20,26,34,0.06)",
                  borderWidth: 1,
                  borderColor: selected ? "#121826" : "rgba(20,26,34,0.12)",
                }}
              >
                <Text
                  style={{
                    color: selected ? "#fff" : "#121826",
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

        {bannerMessage ? (
          <Pressable
            onPress={() => setBannerMessage(null)}
            style={{
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              backgroundColor: "rgba(21,128,61,0.10)",
              borderWidth: 1,
              borderColor: "rgba(21,128,61,0.18)",
            }}
          >
            <Text style={{ color: SUCCESS, fontWeight: "800" }}>{bannerMessage}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        {loading ? (
          <View
            style={{
              marginTop: 56,
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              backgroundColor: "rgba(255,255,255,0.72)",
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.10)",
              borderRadius: 18,
              paddingVertical: 26,
              paddingHorizontal: 18,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              Loading notes
            </Text>
            <Text style={{ color: TEXT_MUTED, textAlign: "center", maxWidth: 320 }}>
              Pulling your latest library and preview data now.
            </Text>
          </View>
        ) : refreshError ? (
          <View
            style={{
              marginTop: 56,
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              backgroundColor: "rgba(245,158,11,0.14)",
              borderWidth: 1,
              borderColor: "rgba(146,64,14,0.16)",
              borderRadius: 18,
              paddingVertical: 26,
              paddingHorizontal: 18,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              Library unavailable
            </Text>
            <Text style={{ color: TEXT_MUTED, textAlign: "center", maxWidth: 320 }}>
              {refreshError}
            </Text>
            <HeaderButton label="Retry" onPress={refresh} primary />
          </View>
        ) : grid.length === 0 && notes.length === 0 ? (
          <View
            style={{
              marginTop: 70,
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              backgroundColor: "rgba(20,26,34,0.04)",
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.12)",
              borderRadius: 18,
              paddingVertical: 26,
              paddingHorizontal: 18,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              No notes yet
            </Text>
            <Text style={{ color: TEXT_MUTED, textAlign: "center", maxWidth: 320 }}>
              Create your first note and it will show up here.
            </Text>
            <Pressable
              onPress={openCreateModal}
              style={{
                marginTop: 10,
                backgroundColor: ACCENT,
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: 12,
                shadowColor: "#2563EB",
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                boxShadow: "0 10px 24px rgba(37,99,235,0.35)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Create a note</Text>
            </Pressable>
          </View>
        ) : grid.length === 0 ? (
          <View
            style={{
              marginTop: 56,
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              backgroundColor: "rgba(20,26,34,0.04)",
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.12)",
              borderRadius: 18,
              paddingVertical: 26,
              paddingHorizontal: 18,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              No matching notes
            </Text>
            <Text style={{ color: TEXT_MUTED, textAlign: "center", maxWidth: 320 }}>
              Try a different search or switch the sort to find what you need faster.
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
            {grid.map((note) => {
              const cover = note.coverColor || DEFAULT_COVER;
              return (
                <View
                  key={note.id}
                  style={{
                    width: 178,
                    borderRadius: 16,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: "rgba(20,26,34,0.12)",
                    backgroundColor: "rgba(20,26,34,0.04)",
                    shadowColor: "#000",
                    shadowOpacity: 0.2,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 6 },
                    boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
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
                          fontSize: 16,
                          fontWeight: "900",
                          color: TEXT_MAIN,
                        }}
                      >
                        {note.title || "No name"}
                      </Text>
                      <Text
                        style={{
                          marginTop: 2,
                          color: TEXT_MUTED,
                          fontSize: 12,
                        }}
                      >
                        {fmtDate(note.updatedAt)}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          color: TEXT_MUTED,
                          fontSize: 12,
                          fontWeight: "700",
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
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable onPress={() => {}} style={{ alignSelf: "center", width: 360, maxWidth: "100%", backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: "rgba(20,26,34,0.12)", boxShadow: "0 18px 44px rgba(0,0,0,0.38)" }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#121826" }}>Create note</Text>
            <TextInput value={createTitle} onChangeText={setCreateTitle} placeholder="Note name" placeholderTextColor="rgba(20,26,34,0.46)" style={{ height: 46, borderRadius: 12, paddingHorizontal: 12, backgroundColor: "rgba(20,26,34,0.05)", borderWidth: 1, borderColor: "rgba(20,26,34,0.12)", color: "#121826", fontWeight: "700" }} autoFocus />
            <Text style={{ color: TEXT_MUTED, fontWeight: "800", marginTop: 4 }}>Note type</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setCreateMode("blank")} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: createMode === "blank" ? "#121826" : "rgba(20,26,34,0.12)", backgroundColor: createMode === "blank" ? "rgba(20,26,34,0.08)" : "rgba(20,26,34,0.04)", alignItems: "center" }}><Text style={{ color: "#121826", fontWeight: "900" }}>Simple canvas</Text></Pressable>
              <Pressable onPress={() => setCreateMode("infinite")} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: createMode === "infinite" ? "#121826" : "rgba(20,26,34,0.12)", backgroundColor: createMode === "infinite" ? "rgba(20,26,34,0.08)" : "rgba(20,26,34,0.04)", alignItems: "center" }}><Text style={{ color: "#121826", fontWeight: "900" }}>Infinite canvas</Text></Pressable>
              <Pressable onPress={() => setCreateMode("pdf")} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: createMode === "pdf" ? "#121826" : "rgba(20,26,34,0.12)", backgroundColor: createMode === "pdf" ? "rgba(20,26,34,0.08)" : "rgba(20,26,34,0.04)", alignItems: "center" }}><Text style={{ color: "#121826", fontWeight: "900" }}>Import PDF</Text></Pressable>
            </View>
            {createMode === "pdf" ? (
              <View style={{ gap: 8 }}>
                <Pressable onPress={importPdf} style={{ paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(20,26,34,0.14)", backgroundColor: "rgba(20,26,34,0.06)", alignItems: "center", opacity: createBusy ? 0.65 : 1 }}>
                  <Text style={{ color: "#121826", fontWeight: "900" }}>{createBusy ? "Importing..." : "Choose PDF"}</Text>
                </Pressable>
                <Text style={{ color: TEXT_MUTED, fontSize: 12 }}>{createPdfName ? `${createPdfName} (${createPdfPageCount} page(s) ready)` : "No PDF selected"}</Text>
              </View>
            ) : createMode === "infinite" ? (
              <Text style={{ color: TEXT_MUTED, fontSize: 12 }}>Creates a large freeform board for diagrams, brainstorming, and long-form notes.</Text>
            ) : (
              <Text style={{ color: TEXT_MUTED, fontSize: 12 }}>Creates the standard fixed-size page canvas you already have.</Text>
            )}
            <Text style={{ color: TEXT_MUTED, fontWeight: "800", marginTop: 4 }}>Cover color</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {COVER_SWATCHES.map((color) => {
                const selected = color.toLowerCase() === createCover.toLowerCase();
                const border = color.toLowerCase() === "#ffffff" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.18)";
                return <Pressable key={color} onPress={() => setCreateCover(color)} style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: color, borderWidth: selected ? 3 : 1, borderColor: selected ? "#fff" : border }} />;
              })}
            </View>
            {createError ? <Text style={{ color: "#b42318", fontWeight: "700", fontSize: 12 }}>{createError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable onPress={() => setCreateOpen(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(20,26,34,0.06)", borderWidth: 1, borderColor: "rgba(20,26,34,0.12)", alignItems: "center" }}><Text style={{ color: "#121826", fontWeight: "900" }}>Cancel</Text></Pressable>
              <Pressable onPress={commitCreate} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: ACCENT, alignItems: "center", opacity: createBusy || (createMode === "pdf" && !createPdfDoc) ? 0.65 : 1 }}><Text style={{ color: "#fff", fontWeight: "900" }}>Create</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <Pressable onPress={() => setRenameOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 }}>
          <Pressable onPress={() => {}} style={{ alignSelf: "center", width: 340, maxWidth: "100%", backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: "rgba(20,26,34,0.12)", boxShadow: "0 18px 44px rgba(0,0,0,0.38)" }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#121826" }}>Rename note</Text>
            <TextInput value={renameValue} onChangeText={setRenameValue} placeholder="Note name" placeholderTextColor="rgba(20,26,34,0.46)" style={{ height: 46, borderRadius: 12, paddingHorizontal: 12, backgroundColor: "rgba(20,26,34,0.05)", borderWidth: 1, borderColor: "rgba(20,26,34,0.12)", color: "#121826", fontWeight: "700" }} autoFocus />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setRenameOpen(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(20,26,34,0.06)", borderWidth: 1, borderColor: "rgba(20,26,34,0.12)", alignItems: "center" }}><Text style={{ color: "#121826", fontWeight: "900" }}>Cancel</Text></Pressable>
              <Pressable onPress={commitRename} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: ACCENT, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "900" }}>Save</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <Pressable onPress={() => setDeleteOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 }}>
          <Pressable onPress={() => {}} style={{ alignSelf: "center", width: 340, maxWidth: "100%", backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: "rgba(20,26,34,0.12)", boxShadow: "0 18px 44px rgba(0,0,0,0.38)" }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#121826" }}>Delete note?</Text>
            <Text style={{ color: TEXT_MUTED }}>This cannot be undone.</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setDeleteOpen(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(20,26,34,0.06)", borderWidth: 1, borderColor: "rgba(20,26,34,0.12)", alignItems: "center" }}><Text style={{ color: "#121826", fontWeight: "900" }}>Cancel</Text></Pressable>
              <Pressable onPress={commitDelete} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#ff3b30", alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "900" }}>Delete</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
