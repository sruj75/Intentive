import { Stack } from "expo-router";

export default function MainLayout(): React.JSX.Element {
  // Push registration now owns the persistent signed-in lifecycle at the root
  // layout instead of this remounting (main) zone (ADR 0028 / 0030), so this
  // layout is back to a plain headerless Stack.
  return <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
}
