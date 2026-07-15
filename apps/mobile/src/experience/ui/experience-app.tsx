import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { experienceTheme as theme } from "../theme";
import { useExperience } from "./experience-provider";
import { ConversationScene } from "./conversation-scene";
import { EducationScene } from "./education-scene";
import { AuthScene, FriendsIntroScene, NameScene, PermissionsIntroScene } from "./intro-scenes";
import { SceneTransition } from "./primitives";

function CurrentScene() {
  const { snapshot } = useExperience();

  switch (snapshot.scene) {
    case "auth":
      return <AuthScene />;
    case "name":
      return <NameScene />;
    case "friends_intro":
      return <FriendsIntroScene />;
    case "permissions_intro":
      return <PermissionsIntroScene />;
    case "education":
      return <EducationScene />;
    case "chat":
      return <ConversationScene />;
  }
}

export function ExperienceApp() {
  const { snapshot } = useExperience();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea} testID="experience-app">
      <StatusBar style="dark" />
      <SceneTransition sceneKey={snapshot.scene}>
        <CurrentScene />
      </SceneTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: theme.color.canvas } });
