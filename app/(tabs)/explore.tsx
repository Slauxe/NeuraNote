import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { createNote, listNotes, type NoteMeta } from "../../lib/notesStorage";

const BG = "#f6f6f6";
const CARD_BG = "#fff";
const BORDER = "rgba(0,0,0,0.10)";
const MUTED = "rgba(0,0,0,0.55)";
const ACCENT = "#2563EB";

function fmtDate(ms: number) {
  const d = new Date(ms);
  // Simple: "Fri 8:11 PM"
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CoverIcon() {
  // simple purple “notebook” cover like your reference image
  return (
    <View
      style={{
        width: 150,
        height: 180,
        borderRadius: 16,
        backgroundColor: "#8B5CF6",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
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

export default function Explore() {
  const router = useRouter();

  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const n = await listNotes();
      setNotes(n);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh when screen appears (so when you go back from a note it updates timestamps)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Also refresh once on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const grid = useMemo(() => {
    return notes;
  }, [notes]);

  const openNote = (id: string) => {
    // Your drawing screen is app/(tabs)/index.tsx
    router.push({
      pathname: "/(tabs)",
      params: { noteId: id },
    });
  };

  const onCreate = async () => {
    const id = await createNote("No name");
    openNote(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View
        style={{
          paddingTop: 18,
          paddingHorizontal: 18,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontSize: 28, fontWeight: "800" }}>Explore</Text>
          <Text style={{ color: MUTED, marginTop: 2 }}>
            {loading ? "Loading…" : `${notes.length} note(s)`}
          </Text>
        </View>

        <Pressable
          onPress={onCreate}
          style={{
            backgroundColor: ACCENT,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>+ Create</Text>
        </Pressable>
      </View>

      {/* Grid */}
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        {grid.length === 0 && !loading ? (
          <View
            style={{
              marginTop: 50,
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800" }}>
              No notes yet
            </Text>
            <Text style={{ color: MUTED, textAlign: "center", maxWidth: 320 }}>
              Create your first note and it’ll show up here. Notes are saved as
              JSON files on your device.
            </Text>

            <Pressable
              onPress={onCreate}
              style={{
                marginTop: 10,
                backgroundColor: ACCENT,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                Create a note
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 22,
            }}
          >
            {grid.map((n) => (
              <Pressable
                key={n.id}
                onPress={() => openNote(n.id)}
                style={{
                  width: 170,
                  backgroundColor: "transparent",
                }}
              >
                <CoverIcon />

                <View style={{ marginTop: 10 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 16, fontWeight: "800" }}
                  >
                    {n.title || "No name"}
                  </Text>
                  <Text style={{ marginTop: 2, color: MUTED, fontSize: 12 }}>
                    {fmtDate(n.updatedAt)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
