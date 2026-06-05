/**
 * Pre-Chat Gate zone — shared chrome for the gate screens (no header). The gate
 * sequence and route replacements are owned by the root layout's resolver, not here.
 */
import { Stack } from "expo-router";

export default function GatesLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
