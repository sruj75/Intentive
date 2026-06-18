import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

export interface AdaptiveGlassSurfaceProps {
  readonly children: ReactNode;
  readonly isInteractive?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly fallbackStyle?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function AdaptiveGlassSurface({
  children,
  isInteractive = false,
  style,
  fallbackStyle,
  testID,
}: AdaptiveGlassSurfaceProps): React.JSX.Element {
  if (canUseLiquidGlass()) {
    return (
      <GlassView isInteractive={isInteractive} style={style} testID={testID}>
        {children}
      </GlassView>
    );
  }

  return (
    <View style={[styles.fallback, fallbackStyle, style]} testID={testID}>
      {children}
    </View>
  );
}

function canUseLiquidGlass(): boolean {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderColor: "rgba(45, 39, 31, 0.12)",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
