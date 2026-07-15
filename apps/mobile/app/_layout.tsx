/** Expo Router is intentionally only the composition root for the local experience. */
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
    </GestureHandlerRootView>
  );
}
