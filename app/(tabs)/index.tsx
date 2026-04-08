import React, { Suspense } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

const EditorScreen = React.lazy(() => import("@/screens/EditorScreen"));

function EditorRouteFallback() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ECEDEF",
        gap: 12,
      }}
    >
      {Platform.OS === "web" ? (
        <Text style={{ color: "#121826", fontWeight: "800" }}>
          Loading editor...
        </Text>
      ) : null}
      <ActivityIndicator color="#2563EB" />
    </View>
  );
}

export default function IndexRoute() {
  return (
    <Suspense fallback={<EditorRouteFallback />}>
      <EditorScreen />
    </Suspense>
  );
}
