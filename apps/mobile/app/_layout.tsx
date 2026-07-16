import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ProfileProvider } from "../src/providers/profile/profile-provider";

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProfileProvider>
        <Stack screenOptions={{ headerShown: false, animation: "none" }} />
      </ProfileProvider>
    </GestureHandlerRootView>
  );
}
