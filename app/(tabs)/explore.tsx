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
  StudioModalHeader,
  StudioSurface,
  StudioTitle,
} from "@/components/studio/StudioPrimitives";
import { normalizeDocToPages } from "@/lib/editorDocument";
import { PAGE_H, PAGE_W, type Stroke } from "@/lib/editorTypes";
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  duplicateNote,
  listLibraryItems,
  loadNote,
  moveLibraryItem,
  renameFolder,
  saveNote,
  type FolderMeta,
  type LibraryItemMeta,
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

type FolderCardData = FolderMeta & {
  childCount: number;
  noteCount: number;
};

type LibraryCardData = NoteCardData | FolderCardData;

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

function FolderPreview({
  coverColor,
  childCount,
  noteCount,
}: {
  coverColor: string;
  childCount: number;
  noteCount: number;
}) {
  return (
    <View
      style={{
        width: 150,
        height: 180,
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
          opacity: 0.14,
        }}
      />
      <View
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(255,250,244,0.44)",
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
        <StudioBadge label="Folder" tone="accent" />
        <StudioBadge label={`${childCount} item${childCount === 1 ? "" : "s"}`} />
      </View>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 18,
          paddingTop: 20,
        }}
      >
        <View
          style={{
            height: 90,
            borderRadius: 24,
            backgroundColor: "rgba(255,250,244,0.72)",
            borderWidth: 1,
            borderColor: "rgba(77,55,34,0.12)",
            justifyContent: "center",
            paddingHorizontal: 14,
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 8 },
          }}
        >
          <View
            style={{
              position: "absolute",
              top: -8,
              left: 16,
              width: 48,
              height: 18,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomRightRadius: 8,
              backgroundColor: "rgba(255,250,244,0.86)",
              borderWidth: 1,
              borderColor: "rgba(77,55,34,0.12)",
              borderBottomWidth: 0,
            }}
          />
          <Text style={{ color: STUDIO.accent, fontWeight: "900", fontSize: 17 }}>
            {noteCount} note{noteCount === 1 ? "" : "s"}
          </Text>
          <Text style={{ color: STUDIO.muted, marginTop: 4, fontSize: 12 }}>
            {childCount - noteCount} folder{childCount - noteCount === 1 ? "" : "s"} nested inside
          </Text>
        </View>
      </View>
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

  const [items, setItems] = useState<LibraryCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [editMode, setEditMode] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<"note" | "folder">("note");
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
  const [renameType, setRenameType] = useState<"note" | "folder">("note");
  const [renameValue, setRenameValue] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<"note" | "folder">("note");
  const [deleteTitle, setDeleteTitle] = useState("item");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [moveType, setMoveType] = useState<"note" | "folder">("note");
  const [moveTitle, setMoveTitle] = useState("item");
  const [moveParentId, setMoveParentId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRefreshError(null);
    try {
      const libraryItems = await listLibraryItems();
      const folderStats = new Map<
        string,
        {
          childCount: number;
          noteCount: number;
        }
      >();

      for (const item of libraryItems) {
        const parentId = item.parentId ?? null;
        if (!parentId) continue;
        const current = folderStats.get(parentId) ?? { childCount: 0, noteCount: 0 };
        current.childCount += 1;
        if (item.type === "note") current.noteCount += 1;
        folderStats.set(parentId, current);
      }

      const hydrated = await Promise.all(
        libraryItems.map(async (meta) => {
          if (meta.type === "folder") {
            const stats = folderStats.get(meta.id) ?? { childCount: 0, noteCount: 0 };
            return {
              ...meta,
              childCount: stats.childCount,
              noteCount: stats.noteCount,
            } satisfies FolderCardData;
          }

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
      setItems(hydrated);
    } catch {
      setRefreshError("Could not load your notes right now.");
      setItems([]);
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

  const foldersById = useMemo(
    () =>
      new Map(
        items
          .filter((item): item is FolderCardData => item.type === "folder")
          .map((item) => [item.id, item]),
      ),
    [items],
  );

  useEffect(() => {
    if (currentFolderId && !foldersById.has(currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [currentFolderId, foldersById]);

  const currentFolder = currentFolderId ? foldersById.get(currentFolderId) ?? null : null;

  const breadcrumbs = useMemo(() => {
    const trail: FolderCardData[] = [];
    let pointer = currentFolderId ? foldersById.get(currentFolderId) ?? null : null;
    while (pointer) {
      trail.unshift(pointer);
      pointer = pointer.parentId ? foldersById.get(pointer.parentId) ?? null : null;
    }
    return trail;
  }, [currentFolderId, foldersById]);

  const grid = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const inFolder = items.filter(
      (item) => (item.parentId ?? null) === currentFolderId,
    );
    const filtered = query
      ? inFolder.filter((item) =>
          (item.title || (item.type === "folder" ? "New folder" : "No name"))
            .toLowerCase()
            .includes(query),
        )
      : inFolder;

    return [...filtered].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      if (sortMode === "title") {
        return (a.title || "No name").localeCompare(b.title || "No name");
      }
      return b.updatedAt - a.updatedAt;
    });
  }, [currentFolderId, items, searchQuery, sortMode]);

  const openNote = (id: string) => {
    router.push({
      pathname: "/(tabs)",
      params: { noteId: id },
    });
  };

  const openCreateModal = () => {
    setCreateKind("note");
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
    if (createKind === "note" && createMode === "pdf" && !createPdfDoc) {
      setCreateError("Select a PDF first.");
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    const title = createTitle.trim() || (createKind === "folder" ? "New folder" : "No name");

    try {
      if (createKind === "folder") {
        await createFolder(title, currentFolderId);
        setBannerMessage("Folder created.");
        setCreateOpen(false);
        refresh();
        return;
      }

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

      const id = await createNote(title, createCover, initialDoc, currentFolderId);
      setBannerMessage("Note created.");
      setCreateOpen(false);
      openNote(id);
    } catch {
      setCreateError(
        createKind === "folder"
          ? "Could not create folder. Please try again."
          : "Could not create note. Please try again.",
      );
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

  const startRename = (item: LibraryItemMeta) => {
    setRenameId(item.id);
    setRenameType(item.type);
    setRenameValue(item.title || (item.type === "folder" ? "New folder" : "No name"));
    setRenameOpen(true);
  };

  const commitRename = async () => {
    if (!renameId) return;
    const title = renameValue.trim() || (renameType === "folder" ? "New folder" : "No name");
    try {
      if (renameType === "folder") {
        await renameFolder(renameId, title);
        setBannerMessage("Folder renamed.");
      } else {
        await saveNote(renameId, { title });
        setBannerMessage("Note renamed.");
      }
      setRenameOpen(false);
      setRenameId(null);
      setRenameValue("");
      refresh();
    } catch {
      setBannerMessage("Could not rename that item.");
    }
  };

  const startDelete = (item: LibraryItemMeta) => {
    setDeleteId(item.id);
    setDeleteType(item.type);
    setDeleteTitle(item.title || (item.type === "folder" ? "New folder" : "No name"));
    setDeleteOpen(true);
  };

  const commitDelete = async () => {
    if (!deleteId) return;
    try {
      if (deleteType === "folder") {
        await deleteFolder(deleteId);
        setBannerMessage("Folder deleted.");
        if (currentFolderId === deleteId) {
          setCurrentFolderId(null);
        }
      } else {
        await deleteNote(deleteId);
        setBannerMessage("Note deleted.");
      }
      setDeleteOpen(false);
      setDeleteId(null);
      refresh();
    } catch {
      setBannerMessage("Could not delete that item.");
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

  const startMove = (item: LibraryItemMeta) => {
    setMoveId(item.id);
    setMoveType(item.type);
    setMoveTitle(item.title || (item.type === "folder" ? "New folder" : "No name"));
    setMoveParentId(item.parentId ?? null);
    setMoveOpen(true);
  };

  const commitMove = async () => {
    if (!moveId) return;
    try {
      await moveLibraryItem(moveId, moveParentId);
      setBannerMessage(`${moveType === "folder" ? "Folder" : "Note"} moved.`);
      setMoveOpen(false);
      setMoveId(null);
      refresh();
    } catch {
      setBannerMessage("Could not move that item.");
    }
  };

  const moveDestinations = useMemo(() => {
    const folders = items.filter((item): item is FolderCardData => item.type === "folder");
    if (!moveId || moveType !== "folder") return folders;

    const excluded = new Set<string>([moveId]);
    const queue = [moveId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const folder of folders) {
        if (folder.parentId === current && !excluded.has(folder.id)) {
          excluded.add(folder.id);
          queue.push(folder.id);
        }
      }
    }

    return folders.filter((folder) => !excluded.has(folder.id));
  }, [items, moveId, moveType]);

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
            {loading
              ? "Loading..."
              : `${items.filter((item) => item.type === "note").length} note(s), ${items.filter((item) => item.type === "folder").length} folder(s)`}
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
        <StudioSurface padding={12}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Pressable
              onPress={() => setCurrentFolderId(null)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: currentFolderId === null ? "rgba(35,52,70,0.92)" : "rgba(255,250,244,0.72)",
                borderWidth: 1,
                borderColor: currentFolderId === null ? "rgba(255,248,239,0.22)" : STUDIO.line,
              }}
            >
              <Text style={{ color: currentFolderId === null ? "#FFF8EF" : STUDIO.ink, fontWeight: "900", fontSize: 12 }}>
                All files
              </Text>
            </Pressable>
            {breadcrumbs.map((folder) => {
              const selected = folder.id === currentFolderId;
              return (
                <Pressable
                  key={folder.id}
                  onPress={() => setCurrentFolderId(folder.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: selected ? "rgba(35,52,70,0.92)" : "rgba(255,250,244,0.72)",
                    borderWidth: 1,
                    borderColor: selected ? "rgba(255,248,239,0.22)" : STUDIO.line,
                  }}
                >
                  <Text style={{ color: selected ? "#FFF8EF" : STUDIO.ink, fontWeight: "900", fontSize: 12 }}>
                    {folder.title || "New folder"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: STUDIO.muted, marginTop: 8, fontSize: 12 }}>
            {currentFolder
              ? `Inside ${currentFolder.title || "New folder"}`
              : "Browsing the root of your library"}
          </Text>
        </StudioSurface>

        <StudioSurface padding={14}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={currentFolder ? "Search this folder" : "Search files and folders"}
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
              Loading library
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
        ) : grid.length === 0 && items.length === 0 ? (
          <StudioSurface>
            <View style={{ alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              Nothing here yet
            </Text>
              <Text style={{ color: STUDIO.muted, textAlign: "center", maxWidth: 320 }}>
              Create your first note or folder and it will show up here.
            </Text>
              <View style={{ marginTop: 10 }}>
                <HeaderButton label="Create something" onPress={openCreateModal} primary />
              </View>
            </View>
          </StudioSurface>
        ) : grid.length === 0 ? (
          <StudioSurface>
            <View style={{ alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#121826" }}>
              No matching items
            </Text>
              <Text style={{ color: STUDIO.muted, textAlign: "center", maxWidth: 320 }}>
              Try a different search or switch folders to find what you need faster.
              </Text>
            </View>
          </StudioSurface>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
            {grid.map((item) => {
              const cover = item.type === "note" ? item.coverColor || DEFAULT_COVER : "#D7B189";
              return (
                <View
                  key={item.id}
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
                      if (item.type === "folder") {
                        setCurrentFolderId(item.id);
                        return;
                      }
                      openNote(item.id);
                    }}
                    style={{ backgroundColor: "transparent" }}
                  >
                    {item.type === "folder" ? (
                      <FolderPreview
                        coverColor={cover}
                        childCount={item.childCount}
                        noteCount={item.noteCount}
                      />
                    ) : (
                      <NotePreview
                        coverColor={cover}
                        strokes={item.previewStrokes}
                        kind={item.kind}
                        pageCount={item.pageCount}
                      />
                    )}

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
                        {item.title || (item.type === "folder" ? "New folder" : "No name")}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          color: STUDIO.muted,
                          fontSize: 12,
                        }}
                      >
                        {fmtDate(item.updatedAt)}
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
                        {item.type === "folder"
                          ? `${item.childCount} item${item.childCount === 1 ? "" : "s"} inside`
                          : item.kind === "infinite"
                            ? "Infinite board"
                            : `${item.pageCount} page${item.pageCount === 1 ? "" : "s"}`}
                      </Text>
                    </View>
                  </Pressable>

                  {editMode ? (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <SmallActionButton
                        label="Rename"
                        onPress={() => startRename(item)}
                      />
                      <SmallActionButton
                        label="Move"
                        onPress={() => startMove(item)}
                      />
                      {item.type === "note" ? (
                        <SmallActionButton
                          label="Duplicate"
                          onPress={() => handleDuplicate(item.id)}
                        />
                      ) : null}
                      <SmallActionButton
                        label="Delete"
                        danger
                        onPress={() => startDelete(item)}
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
            backgroundColor: "rgba(26,18,12,0.54)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable onPress={() => {}}>
            <StudioModalCard width={380}>
            <StudioModalHeader
              eyebrow={createKind === "folder" ? "New folder" : "New note"}
              title={createKind === "folder" ? "Create a place to organize work." : "Create a fresh workspace."}
              description={
                createKind === "folder"
                  ? "Folders can hold notes and other folders inside the current location."
                  : "Start with a clean canvas, an infinite board, or import a PDF to mark up."
              }
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setCreateKind("note")} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: createKind === "note" ? "rgba(35,52,70,0.30)" : "rgba(77,55,34,0.14)", backgroundColor: createKind === "note" ? "rgba(35,52,70,0.12)" : "rgba(255,250,244,0.68)", alignItems: "center" }}><Text style={{ color: createKind === "note" ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>Note</Text></Pressable>
              <Pressable onPress={() => setCreateKind("folder")} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: createKind === "folder" ? "rgba(35,52,70,0.30)" : "rgba(77,55,34,0.14)", backgroundColor: createKind === "folder" ? "rgba(35,52,70,0.12)" : "rgba(255,250,244,0.68)", alignItems: "center" }}><Text style={{ color: createKind === "folder" ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>Folder</Text></Pressable>
            </View>
            <TextInput value={createTitle} onChangeText={setCreateTitle} placeholder={createKind === "folder" ? "Folder name" : "Note name"} placeholderTextColor="rgba(30,35,41,0.46)" style={{ height: 50, borderRadius: 18, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.56)", borderWidth: 1, borderColor: "rgba(77,55,34,0.14)", color: STUDIO.ink, fontWeight: "700" }} autoFocus />
            {createKind === "note" ? (
              <>
            <Text style={{ color: STUDIO.muted, fontWeight: "800", marginTop: 4 }}>Note type</Text>
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Pressable onPress={() => setCreateMode("blank")} style={{ flexGrow: 1, flexBasis: compactCreateOptions ? "100%" : 100, paddingVertical: 14, borderRadius: 18, borderWidth: 1, borderColor: createMode === "blank" ? "rgba(35,52,70,0.30)" : "rgba(77,55,34,0.14)", backgroundColor: createMode === "blank" ? "rgba(35,52,70,0.12)" : "rgba(255,250,244,0.68)", alignItems: "center" }}><Text style={{ color: createMode === "blank" ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>Simple canvas</Text></Pressable>
              <Pressable onPress={() => setCreateMode("infinite")} style={{ flexGrow: 1, flexBasis: compactCreateOptions ? "100%" : 100, paddingVertical: 14, borderRadius: 18, borderWidth: 1, borderColor: createMode === "infinite" ? "rgba(35,52,70,0.30)" : "rgba(77,55,34,0.14)", backgroundColor: createMode === "infinite" ? "rgba(35,52,70,0.12)" : "rgba(255,250,244,0.68)", alignItems: "center" }}><Text style={{ color: createMode === "infinite" ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>Infinite canvas</Text></Pressable>
              <Pressable onPress={() => setCreateMode("pdf")} style={{ flexGrow: 1, flexBasis: compactCreateOptions ? "100%" : 100, paddingVertical: 14, borderRadius: 18, borderWidth: 1, borderColor: createMode === "pdf" ? "rgba(35,52,70,0.30)" : "rgba(77,55,34,0.14)", backgroundColor: createMode === "pdf" ? "rgba(35,52,70,0.12)" : "rgba(255,250,244,0.68)", alignItems: "center" }}><Text style={{ color: createMode === "pdf" ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>Import PDF</Text></Pressable>
            </View>
            {createMode === "pdf" ? (
              <View style={{ gap: 8 }}>
                <Pressable onPress={importPdf} style={{ paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(35,52,70,0.16)", backgroundColor: "rgba(35,52,70,0.08)", alignItems: "center", opacity: createBusy ? 0.65 : 1 }}>
                  <Text style={{ color: STUDIO.accent, fontWeight: "900" }}>{createBusy ? "Importing..." : "Choose PDF"}</Text>
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
                return <Pressable key={color} onPress={() => setCreateCover(color)} style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: color, borderWidth: selected ? 3 : 1, borderColor: selected ? STUDIO.accent : border, shadowColor: selected ? STUDIO.accent : "#000", shadowOpacity: selected ? 0.16 : 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }} />;
              })}
            </View>
              </>
            ) : (
              <Text style={{ color: STUDIO.muted, fontSize: 12 }}>
                This folder will be created {currentFolder ? `inside ${currentFolder.title || "the current folder"}` : "at the root of your library"}.
              </Text>
            )}
            {createError ? <Text style={{ color: "#b42318", fontWeight: "700", fontSize: 12 }}>{createError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <View style={{ flex: 1 }}><StudioButton label="Cancel" onPress={() => setCreateOpen(false)} /></View>
              <View style={{ flex: 1 }}><StudioButton label={createKind === "folder" ? "Create folder" : "Create"} onPress={commitCreate} tone="primary" disabled={createBusy || (createKind === "note" && createMode === "pdf" && !createPdfDoc)} /></View>
            </View>
            </StudioModalCard>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <Pressable onPress={() => setRenameOpen(false)} style={{ flex: 1, backgroundColor: "rgba(26,18,12,0.54)", justifyContent: "center", padding: 20 }}>
          <Pressable onPress={() => {}}>
            <StudioModalCard width={360}>
            <StudioModalHeader
              eyebrow="Refine title"
              title={renameType === "folder" ? "Rename folder." : "Rename note."}
              description={renameType === "folder" ? "Give this folder a clearer label so it is easier to scan in the library." : "Give this workspace a clearer name so it is easier to spot later."}
            />
            <TextInput value={renameValue} onChangeText={setRenameValue} placeholder={renameType === "folder" ? "Folder name" : "Note name"} placeholderTextColor="rgba(30,35,41,0.46)" style={{ height: 50, borderRadius: 18, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.56)", borderWidth: 1, borderColor: "rgba(77,55,34,0.14)", color: STUDIO.ink, fontWeight: "700" }} autoFocus />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><StudioButton label="Cancel" onPress={() => setRenameOpen(false)} /></View>
              <View style={{ flex: 1 }}><StudioButton label="Save" onPress={commitRename} tone="primary" /></View>
            </View>
            </StudioModalCard>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <Pressable onPress={() => setDeleteOpen(false)} style={{ flex: 1, backgroundColor: "rgba(26,18,12,0.54)", justifyContent: "center", padding: 20 }}>
          <Pressable onPress={() => {}}>
            <StudioModalCard width={360}>
            <StudioModalHeader
              eyebrow="Permanent action"
              title={deleteType === "folder" ? "Delete folder?" : "Delete note?"}
              description={deleteType === "folder" ? `Delete ${deleteTitle} and everything inside it.` : `Delete ${deleteTitle} permanently.`}
            />
            <View style={{ borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "rgba(156,67,52,0.18)", backgroundColor: "rgba(156,67,52,0.08)" }}>
              <Text style={{ color: STUDIO.danger, fontWeight: "800", fontSize: 12 }}>{deleteType === "folder" ? "This also deletes every note and subfolder inside it." : "This cannot be undone."}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><StudioButton label="Cancel" onPress={() => setDeleteOpen(false)} /></View>
              <View style={{ flex: 1 }}><StudioButton label="Delete" onPress={commitDelete} tone="danger" /></View>
            </View>
            </StudioModalCard>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={moveOpen} transparent animationType="fade" onRequestClose={() => setMoveOpen(false)}>
        <Pressable onPress={() => setMoveOpen(false)} style={{ flex: 1, backgroundColor: "rgba(26,18,12,0.54)", justifyContent: "center", padding: 20 }}>
          <Pressable onPress={() => {}}>
            <StudioModalCard width={400}>
              <StudioModalHeader
                eyebrow="Move item"
                title={`Move ${moveTitle}`}
                description="Choose the destination folder. Root keeps the item at the top level."
              />
              <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ gap: 10 }}>
                <Pressable
                  onPress={() => setMoveParentId(null)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: moveParentId === null ? "rgba(35,52,70,0.30)" : "rgba(77,55,34,0.14)",
                    backgroundColor: moveParentId === null ? "rgba(35,52,70,0.12)" : "rgba(255,250,244,0.68)",
                  }}
                >
                  <Text style={{ color: moveParentId === null ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>Root</Text>
                </Pressable>
                {moveDestinations.map((folder) => (
                  <Pressable
                    key={folder.id}
                    onPress={() => setMoveParentId(folder.id)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: moveParentId === folder.id ? "rgba(35,52,70,0.30)" : "rgba(77,55,34,0.14)",
                      backgroundColor: moveParentId === folder.id ? "rgba(35,52,70,0.12)" : "rgba(255,250,244,0.68)",
                    }}
                  >
                    <Text style={{ color: moveParentId === folder.id ? STUDIO.accent : STUDIO.ink, fontWeight: "900" }}>
                      {folder.title || "New folder"}
                    </Text>
                    <Text style={{ color: STUDIO.muted, fontSize: 12, marginTop: 4 }}>
                      {folder.childCount} item{folder.childCount === 1 ? "" : "s"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><StudioButton label="Cancel" onPress={() => setMoveOpen(false)} /></View>
                <View style={{ flex: 1 }}><StudioButton label="Move" onPress={commitMove} tone="primary" /></View>
              </View>
            </StudioModalCard>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
