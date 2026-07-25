import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { usePathname } from "expo-router";

import { brandAssets } from "../design/brand";
import { mobileTheme as theme } from "../design/theme";
import { resolveLaunchState } from "../domains/onboarding/service/resolve-launch-state";
import { routeForDestination } from "../domains/onboarding/service/route-for-destination";
import { useLaunchState } from "../providers/launch-state";

/**
 * The resolving-launch curtain — an opaque white surface held above the Router
 * until both (a) Launch State hydration resolves and (b) the Router reports the
 * pathname the resolved destination replaced into (`/` or `/chat`). This hides
 * the one-frame Identity Gate flash a returning user would otherwise see while
 * `/` is still mounted before `RootNavigator` replaces into `/chat` (ADR 0030).
 *
 * While shown, one transparent 96×96 brand mark is centered with a gentle
 * breathing pulse: scale `0.92 → 1.06` and opacity `0.72 → 1.0`, easing in and
 * out over 1.1 seconds in each direction. Under Reduce Motion the mark is shown
 * statically. There is exactly one VoiceOver label, "Loading Intentive," with
 * progress/busy semantics — no repeated announcements and no secondary spinner.
 */
export function LaunchCurtain(): React.JSX.Element | null {
  const { state } = useLaunchState();
  const pathname = usePathname();
  const destination = resolveLaunchState(state);
  const route = routeForDestination(destination);
  const target = route.kind === "replace" ? route.zone : null;
  // Visible while state is unknown (RESOLVING) or the Router has not yet reached
  // the resolved target pathname.
  const visible = destination === "RESOLVING" || (target !== null && pathname !== target);

  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0.72);

  useEffect(() => {
    if (!visible || reduceMotion) return;
    scale.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 1_100 }), withTiming(0.92, { duration: 1_100 })),
      -1,
    );
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 1_100 }), withTiming(0.72, { duration: 1_100 })),
      -1,
    );
  }, [visible, reduceMotion, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const icon = (
    <Image accessible={false} source={brandAssets.head} style={styles.icon} testID="launch-icon" />
  );

  return (
    <View
      accessibilityLabel="Loading Intentive"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      pointerEvents="auto"
      style={styles.curtain}
    >
      <View style={styles.mark}>
        {reduceMotion ? icon : <Animated.View style={animatedStyle}>{icon}</Animated.View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  curtain: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: theme.color.canvas,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  mark: { width: 96, height: 96, alignItems: "center", justifyContent: "center" },
  icon: { width: 96, height: 96 },
});
