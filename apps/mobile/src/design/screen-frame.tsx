import type { ReactNode } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SceneTransition } from "./primitives";
import { mobileTheme as theme } from "./theme";

export function ScreenFrame({
  children,
  sceneKey,
}: {
  readonly children: ReactNode;
  readonly sceneKey: string;
}) {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea} testID="experience-app">
      <StatusBar style="dark" />
      <SceneTransition sceneKey={sceneKey}>{children}</SceneTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: theme.color.canvas } });
