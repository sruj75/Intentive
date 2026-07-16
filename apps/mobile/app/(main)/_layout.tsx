import { Stack } from "expo-router";

export default function MainLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
}
