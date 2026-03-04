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
import {
  createNote,
  deleteNote,
  listNotes,
  saveNote,
  type NoteMeta,
} from "../../lib/notesStorage";

// Match Index theme
const WORKSPACE_BG = "#F1F3F6";
const TOPBAR_BG = "rgba(255,255,255,0.94)";
const TOPBAR_BORDER = "rgba(20,26,34,0.12)";
const BTN_BG = "rgba(20,26,34,0.06)";
const BTN_BORDER = "rgba(20,26,34,0.16)";
const TEXT_MAIN = "rgba(20,26,34,0.94)";
const TEXT_MUTED = "rgba(20,26,34,0.62)";
const ACCENT = "#2563EB";

const DEFAULT_COVER = "#8B5CF6";
const COVER_SWATCHES = [
  "#8B5CF6", // violet
  "#2563EB", // blue
  "#06B6D4", // cyan
  "#22C55E", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#EC4899", // pink
  "#A855F7", // purple
  "#111111", // black
  "#FFFFFF", // white
];

function fmtDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CoverIcon({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 150,
        height: 180,
        borderRadius: 16,
        backgroundColor: color,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      <View
        style={{
          position: "absolute",
          right: 18,
          top: 0,
          bottom: 0,
          width: 26,
          backgroundColor: "rgba(0,0,0,0.10)",
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 16,
          backgroundColor: "rgba(0,0,0,0.18)",
        }}
      />
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

  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode] = useState(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("No name");
  const [createCover, setCreateCover] = useState(DEFAULT_COVER);

  // Rename modal
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const n = await listNotes();
      setNotes(n);
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

  const grid = useMemo(() => notes, [notes]);

  const openNote = (id: string) => {
    router.push({
      pathname: "/(tabs)",
      params: { noteId: id },
    });
  };

  const openCreateModal = () => {
    setCreateTitle("No name");
    setCreateCover(DEFAULT_COVER);
    setCreateOpen(true);
  };

  const commitCreate = async () => {
    const title = createTitle.trim() || "No name";
    const id = await createNote(title, createCover);
    setCreateOpen(false);
    openNote(id);
  };

  const startRename = (n: NoteMeta) => {
    setRenameId(n.id);
    setRenameValue(n.title || "No name");
    setRenameOpen(true);
  };

  const commitRename = async () => {
    if (!renameId) return;
    const title = renameValue.trim() || "No name";
    await saveNote(renameId, { title });
    setRenameOpen(false);
    setRenameId(null);
    setRenameValue("");
    refresh();
  };

  const startDelete = (id: string) => {
    setDeleteId(id);
    setDeleteOpen(true);
  };

  const commitDelete = async () => {
    if (!deleteId) return;
    await deleteNote(deleteId);
    setDeleteOpen(false);
    setDeleteId(null);
    refresh();
  };

  return (
    <View style={{ flex: 1, backgroundColor: WORKSPACE_BG }}>
      {/* Header */}
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
            {loading ? "Loading…" : `${notes.length} note(s)`}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <HeaderButton
            label={editMode ? "Done" : "Edit"}
            onPress={() => setEditMode((v) => !v)}
          />
          <HeaderButton label="+ Create" onPress={openCreateModal} primary />
        </View>
      </View>

      {/* Grid */}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        {grid.length === 0 && !loading ? (
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
            <Text
              style={{ color: TEXT_MUTED, textAlign: "center", maxWidth: 320 }}
            >
              Create your first note and it’ll show up here.
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
              <Text style={{ color: "#fff", fontWeight: "900" }}>
                Create a note
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
            {grid.map((n) => {
              const cover = n.coverColor || DEFAULT_COVER;

              return (
                <View
                  key={n.id}
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
                      openNote(n.id);
                    }}
                    style={{ backgroundColor: "transparent" }}
                  >
                    <CoverIcon color={cover} />

                    <View style={{ marginTop: 10 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 16,
                          fontWeight: "900",
                          color: TEXT_MAIN,
                        }}
                      >
                        {n.title || "No name"}
                      </Text>
                      <Text
                        style={{
                          marginTop: 2,
                          color: TEXT_MUTED,
                          fontSize: 12,
                        }}
                      >
                        {fmtDate(n.updatedAt)}
                      </Text>
                    </View>
                  </Pressable>

                  {editMode ? (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <SmallActionButton
                        label="Rename"
                        onPress={() => startRename(n)}
                      />
                      <SmallActionButton
                        label="Delete"
                        danger
                        onPress={() => startDelete(n.id)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Create Modal */}
      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <Pressable
          onPress={() => setCreateOpen(false)}
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
              alignSelf: "center",
              width: 360,
              maxWidth: "100%",
              backgroundColor: "#FFFFFF",
              borderRadius: 18,
              padding: 16,
              gap: 12,
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.12)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.38)",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#121826" }}>
              Create note
            </Text>

            <TextInput
              value={createTitle}
              onChangeText={setCreateTitle}
              placeholder="Note name"
              placeholderTextColor="rgba(20,26,34,0.46)"
              style={{
                height: 46,
                borderRadius: 12,
                paddingHorizontal: 12,
                backgroundColor: "rgba(20,26,34,0.05)",
                borderWidth: 1,
                borderColor: "rgba(20,26,34,0.12)",
                color: "#121826",
                fontWeight: "700",
              }}
              autoFocus
            />

            <Text
              style={{ color: TEXT_MUTED, fontWeight: "800", marginTop: 4 }}
            >
              Cover color
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {COVER_SWATCHES.map((c) => {
                const selected = c.toLowerCase() === createCover.toLowerCase();
                const border =
                  c.toLowerCase() === "#ffffff"
                    ? "rgba(0,0,0,0.25)"
                    : "rgba(255,255,255,0.18)";

                return (
                  <Pressable
                    key={c}
                    onPress={() => setCreateCover(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      backgroundColor: c,
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected ? "#fff" : border,
                    }}
                  />
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable
                onPress={() => setCreateOpen(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(20,26,34,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(20,26,34,0.12)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#121826", fontWeight: "900" }}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={commitCreate}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: ACCENT,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameOpen(false)}
      >
        <Pressable
          onPress={() => setRenameOpen(false)}
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
              alignSelf: "center",
              width: 340,
              maxWidth: "100%",
              backgroundColor: "#FFFFFF",
              borderRadius: 18,
              padding: 16,
              gap: 12,
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.12)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.38)",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#121826" }}>
              Rename note
            </Text>

            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Note name"
              placeholderTextColor="rgba(20,26,34,0.46)"
              style={{
                height: 46,
                borderRadius: 12,
                paddingHorizontal: 12,
                backgroundColor: "rgba(20,26,34,0.05)",
                borderWidth: 1,
                borderColor: "rgba(20,26,34,0.12)",
                color: "#121826",
                fontWeight: "700",
              }}
              autoFocus
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setRenameOpen(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(20,26,34,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(20,26,34,0.12)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#121826", fontWeight: "900" }}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={commitRename}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: ACCENT,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Modal */}
      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteOpen(false)}
      >
        <Pressable
          onPress={() => setDeleteOpen(false)}
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
              alignSelf: "center",
              width: 340,
              maxWidth: "100%",
              backgroundColor: "#FFFFFF",
              borderRadius: 18,
              padding: 16,
              gap: 12,
              borderWidth: 1,
              borderColor: "rgba(20,26,34,0.12)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.38)",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#121826" }}>
              Delete note?
            </Text>
            <Text style={{ color: TEXT_MUTED }}>This can’t be undone.</Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setDeleteOpen(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(20,26,34,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(20,26,34,0.12)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#121826", fontWeight: "900" }}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={commitDelete}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: "#ff3b30",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
