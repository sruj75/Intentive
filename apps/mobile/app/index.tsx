/**
 * Splash — the initial route, shown while the resolver returns RESOLVING
 * (Launch State not yet hydrated). The root layout replaces this route once a
 * concrete destination is known.
 */
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function SplashRoute(): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center" },
});
