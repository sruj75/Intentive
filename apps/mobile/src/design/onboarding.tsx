import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Image, type ImageProps } from "expo-image";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fontFamily, onboardingColors, onboardingRadii } from "./onboarding-tokens";

export type OnboardingBackdrop = "welcome" | "privacy" | "name" | "source" | "permissions" | "mac";

export type OnboardingIconSource = ImageProps["source"];

const ONBOARDING_BACKDROPS: Record<OnboardingBackdrop, OnboardingIconSource> = {
  welcome: require("../../assets/onboarding/welcome.png") as OnboardingIconSource,
  privacy: require("../../assets/onboarding/privacy.png") as OnboardingIconSource,
  name: require("../../assets/onboarding/name.png") as OnboardingIconSource,
  source: require("../../assets/onboarding/source.png") as OnboardingIconSource,
  permissions: require("../../assets/onboarding/permissions.png") as OnboardingIconSource,
  mac: require("../../assets/onboarding/mac.png") as OnboardingIconSource,
};

/**
 * A muted monochrome brand glyph, drawn from FontAwesome6 via `@expo/vector-icons`
 * — one uniform icon language across onboarding (brand marks + system glyphs),
 * replacing the mixed color-PNG / SF-Symbol set. `set` picks the FA6 sub-family:
 * `fa6-brand` for logos (TikTok, YouTube…), `fa6-solid` for generic marks. See
 * apps/mobile/docs/adr/0021-*. System chrome elsewhere still uses SF Symbols.
 */
export type OnboardingGlyphSet = "fa6-brand" | "fa6-solid";

export interface OnboardingGlyph {
  readonly set: OnboardingGlyphSet;
  readonly name: string;
}

export function OnboardingGlyphIcon({
  glyph,
  size,
  color,
}: {
  readonly glyph: OnboardingGlyph;
  readonly size: number;
  readonly color: string;
}): React.JSX.Element {
  // FontAwesome6 selects its sub-family from boolean props; `brand`/`solid` map
  // straight onto our descriptor so a caller never touches the vendor API.
  return (
    <FontAwesome6
      name={glyph.name}
      size={size}
      color={color}
      brand={glyph.set === "fa6-brand"}
      solid={glyph.set === "fa6-solid"}
    />
  );
}

export interface OnboardingProgress {
  readonly current: number;
  readonly total: number;
}

export interface OnboardingScreenProps {
  readonly backdrop: OnboardingBackdrop;
  readonly backdropLabel: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly progress?: OnboardingProgress;
  readonly onBack?: () => void;
  readonly sheetMaxHeightRatio?: number;
  readonly sheetTestID?: string;
  readonly scroll?: boolean;
  readonly contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Presentation shell for the pre-chat onboarding system. It owns the Omi-style
 * visual decisions once: full-screen imagery, top controls, bottom sheet
 * geometry, safe areas, keyboard avoidance, and scroll containment. Gate
 * semantics stay in the caller. The Free Trial gate is the one surface that
 * intentionally does NOT use this shell (it is full-bleed dark, no backdrop).
 */
export function OnboardingScreen({
  backdrop,
  backdropLabel,
  children,
  footer,
  progress,
  onBack,
  sheetMaxHeightRatio = 0.7,
  sheetTestID = "onboarding-bottom-sheet",
  scroll = true,
  contentStyle,
}: OnboardingScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetMaxHeight = Math.round(height * sheetMaxHeightRatio);

  const content = (
    <View style={[styles.sheetContent, contentStyle]}>
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <Image
        accessibilityLabel={backdropLabel}
        accessible
        contentFit="cover"
        source={ONBOARDING_BACKDROPS[backdrop]}
        style={StyleSheet.absoluteFill}
        testID="onboarding-backdrop"
      />
      <View pointerEvents="none" style={styles.backdropScrim} />
      <View pointerEvents="none" style={styles.bottomScrim} />

      {progress || onBack ? (
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          {onBack ? (
            <Pressable
              accessibilityLabel="Back"
              accessibilityRole="button"
              hitSlop={12}
              style={styles.backButton}
              onPress={onBack}
            >
              <Text style={styles.backButtonText}>‹</Text>
            </Pressable>
          ) : (
            <View style={styles.backButtonPlaceholder} />
          )}
          {progress ? <OnboardingProgressDots progress={progress} /> : <View />}
          <View style={styles.backButtonPlaceholder} />
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.stage}
      >
        <View
          style={[
            styles.sheet,
            {
              maxHeight: sheetMaxHeight,
              paddingBottom: Math.max(insets.bottom, 16) + 18,
            },
          ]}
          testID={sheetTestID}
        >
          {scroll ? (
            <ScrollView
              alwaysBounceVertical={false}
              contentContainerStyle={styles.scrollContent}
              contentInsetAdjustmentBehavior="never"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {content}
            </ScrollView>
          ) : (
            content
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function OnboardingProgressDots({
  progress,
}: {
  readonly progress: OnboardingProgress;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={`Step ${progress.current} of ${progress.total}`}
      accessibilityRole="progressbar"
      style={styles.progress}
      testID="onboarding-progress"
    >
      {Array.from({ length: progress.total }).map((_, index) => {
        const isActive = index + 1 === progress.current;
        return (
          <View
            key={index}
            style={[styles.progressDot, isActive ? styles.progressDotActive : null]}
          />
        );
      })}
    </View>
  );
}

export interface OnboardingActionProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly leadingGlyph?: OnboardingGlyph;
  readonly leading?: string;
  readonly testID?: string;
  readonly variant?: "primary" | "secondary" | "accent";
}

export function OnboardingAction({
  label,
  onPress,
  accessibilityLabel,
  busy = false,
  disabled = false,
  leadingGlyph,
  leading,
  testID,
  variant = "primary",
}: OnboardingActionProps): React.JSX.Element {
  const isDisabled = disabled || busy;
  const buttonStyle =
    variant === "accent"
      ? styles.actionAccent
      : variant === "secondary"
        ? styles.actionSecondary
        : styles.actionPrimary;
  const textStyle =
    variant === "accent"
      ? styles.actionAccentText
      : variant === "secondary"
        ? styles.actionSecondaryText
        : styles.actionPrimaryText;
  const glyphColor =
    variant === "accent"
      ? onboardingColors.accentInk
      : variant === "secondary"
        ? onboardingColors.ink
        : onboardingColors.inkInverse;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: isDisabled }}
      disabled={isDisabled}
      style={[styles.action, buttonStyle, isDisabled ? styles.actionDisabled : null]}
      testID={testID}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator
          color={variant === "accent" ? onboardingColors.accentInk : onboardingColors.inkInverse}
        />
      ) : (
        <>
          {leadingGlyph ? (
            <OnboardingGlyphIcon glyph={leadingGlyph} size={20} color={glyphColor} />
          ) : null}
          {leading ? <Text style={[styles.actionLeading, textStyle]}>{leading}</Text> : null}
          <Text numberOfLines={1} style={[styles.actionText, textStyle]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export interface OnboardingChoice {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly glyph?: OnboardingGlyph;
  readonly leading?: string;
}

export function OnboardingChoiceList({
  choices,
  selectedId,
  onSelect,
  maxHeight,
  scrollTestID,
}: {
  readonly choices: readonly OnboardingChoice[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly maxHeight?: number;
  readonly scrollTestID?: string;
}): React.JSX.Element {
  const list = (
    <View style={styles.choiceList}>
      {choices.map((choice) => {
        const selected = selectedId === choice.id;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            key={choice.id}
            style={[styles.choice, selected ? styles.choiceSelected : null]}
            onPress={() => onSelect(choice.id)}
          >
            {choice.glyph ? (
              <View style={styles.choiceGlyph}>
                <OnboardingGlyphIcon
                  glyph={choice.glyph}
                  size={18}
                  color={selected ? onboardingColors.glyphSelected : onboardingColors.glyph}
                />
              </View>
            ) : choice.leading ? (
              <View style={styles.choiceGlyph}>
                <Text
                  style={[styles.choiceGlyphText, selected ? styles.choiceGlyphTextSelected : null]}
                >
                  {choice.leading}
                </Text>
              </View>
            ) : null}
            <View style={styles.choiceCopy}>
              <Text style={[styles.choiceLabel, selected ? styles.choiceLabelSelected : null]}>
                {choice.label}
              </Text>
              {choice.detail ? (
                <Text style={[styles.choiceDetail, selected ? styles.choiceDetailSelected : null]}>
                  {choice.detail}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  if (maxHeight) {
    return (
      <View style={[styles.scrollableChoiceFrame, { maxHeight }]}>
        <ScrollView
          alwaysBounceVertical={false}
          contentContainerStyle={styles.scrollableChoiceContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          testID={scrollTestID}
        >
          {list}
        </ScrollView>
        <View pointerEvents="none" style={styles.choiceScrollFade} />
      </View>
    );
  }

  return list;
}

export function OnboardingPermissionRow({
  title,
  body,
  checked = false,
  onPress,
}: {
  readonly title: string;
  readonly body: string;
  readonly checked?: boolean;
  readonly onPress?: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.permissionRow}
      onPress={onPress}
    >
      <View style={styles.permissionCopy}>
        <Text style={styles.permissionTitle}>{title}</Text>
        <Text style={styles.permissionBody}>{body}</Text>
      </View>
      <View style={[styles.permissionCheck, checked ? styles.permissionCheckActive : null]}>
        {checked ? <Text style={styles.permissionCheckText}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

export function OnboardingTextInput({ style, ...props }: TextInputProps): React.JSX.Element {
  return (
    <TextInput
      placeholderTextColor={onboardingColors.placeholder}
      selectionColor={onboardingColors.accent}
      style={[styles.input, style]}
      {...props}
    />
  );
}

export function OnboardingTitle({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function OnboardingBody({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function OnboardingFinePrint({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  return <Text style={[styles.finePrint, style]}>{children}</Text>;
}

export function OnboardingSection({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return <View style={[styles.section, style]}>{children}</View>;
}

export function OnboardingInfoRow({
  title,
  body,
  marker,
  markerGlyph,
}: {
  readonly title: string;
  readonly body: string;
  readonly marker?: string;
  readonly markerGlyph?: OnboardingGlyph;
}): React.JSX.Element {
  return (
    <View style={styles.infoRow}>
      {markerGlyph ? (
        <View style={styles.infoMarker}>
          <OnboardingGlyphIcon glyph={markerGlyph} size={13} color={onboardingColors.accent} />
        </View>
      ) : marker ? (
        <View style={styles.infoMarker}>
          <Text style={styles.infoMarkerText}>{marker}</Text>
        </View>
      ) : null}
      <View style={styles.infoCopy}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoBody}>{body}</Text>
      </View>
    </View>
  );
}

/**
 * Subtle staggered entrance (fade + rise) for onboarding content. Honors the
 * OS "Reduce Motion" setting — when reduced, content appears immediately with no
 * transform. Uses RN `Animated` (Reanimated is not a dependency); the native
 * driver keeps it off the JS thread.
 */
export function OnboardingReveal({
  children,
  index = 0,
  style,
}: {
  readonly children: ReactNode;
  readonly index?: number;
  readonly style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => active && setReduceMotion(enabled))
      .catch(() => active && setReduceMotion(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 360,
      delay: 90 + index * 80,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, index, progress]);

  // Until we know the reduce-motion preference, render at rest (no flash of a
  // transformed frame that would then need to un-transform).
  if (reduceMotion === null) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: onboardingColors.canvas,
    flex: 1,
    overflow: "hidden",
  },
  backdropScrim: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: onboardingColors.scrimSoft,
  },
  bottomScrim: {
    bottom: 0,
    height: "46%",
    left: 0,
    position: "absolute",
    right: 0,
    backgroundColor: onboardingColors.scrimStrong,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    paddingHorizontal: 18,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: onboardingColors.control,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  backButtonPlaceholder: {
    height: 36,
    width: 36,
  },
  backButtonText: {
    color: onboardingColors.ink,
    fontFamily: fontFamily(500),
    fontSize: 30,
    lineHeight: 30,
    marginTop: -2,
  },
  progress: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 36,
  },
  progressDot: {
    backgroundColor: onboardingColors.dotIdle,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  progressDotActive: {
    backgroundColor: onboardingColors.accent,
    width: 16,
  },
  stage: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    alignSelf: "stretch",
    backgroundColor: onboardingColors.sheet,
    borderTopLeftRadius: onboardingRadii.sheet,
    borderTopRightRadius: onboardingRadii.sheet,
    borderCurve: "continuous",
    boxShadow: "0 -16px 44px rgba(0, 0, 0, 0.38)",
    paddingHorizontal: 32,
    paddingTop: 26,
  },
  scrollContent: {
    flexGrow: 1,
  },
  sheetContent: {
    gap: 18,
  },
  footer: {
    gap: 10,
    paddingTop: 2,
  },
  title: {
    color: onboardingColors.ink,
    fontFamily: fontFamily(800),
    fontSize: 28,
    letterSpacing: -0.3,
    lineHeight: 34,
  },
  body: {
    color: onboardingColors.inkMuted,
    fontFamily: fontFamily(400),
    fontSize: 15,
    lineHeight: 22,
  },
  finePrint: {
    color: onboardingColors.inkSubtle,
    fontFamily: fontFamily(500),
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  action: {
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: onboardingRadii.pill,
    borderCurve: "continuous",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    height: 56,
    paddingHorizontal: 24,
    paddingVertical: 0,
  },
  actionPrimary: {
    backgroundColor: onboardingColors.surfaceSelected,
  },
  actionSecondary: {
    backgroundColor: onboardingColors.surface,
    borderColor: onboardingColors.borderStrong,
    borderWidth: 1,
  },
  actionAccent: {
    backgroundColor: onboardingColors.accent,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionText: {
    fontFamily: fontFamily(700),
    fontSize: 18,
  },
  actionLeading: {
    fontFamily: fontFamily(700),
    fontSize: 20,
    minWidth: 22,
    textAlign: "center",
  },
  actionPrimaryText: {
    color: onboardingColors.inkInverse,
  },
  actionSecondaryText: {
    color: onboardingColors.ink,
  },
  actionAccentText: {
    color: onboardingColors.accentInk,
  },
  choiceList: {
    gap: 10,
  },
  scrollableChoiceFrame: {
    overflow: "hidden",
    position: "relative",
  },
  scrollableChoiceContent: {
    paddingBottom: 20,
  },
  choiceScrollFade: {
    backgroundColor: onboardingColors.listFade,
    bottom: 0,
    height: 22,
    left: 0,
    position: "absolute",
    right: 0,
  },
  choice: {
    alignItems: "center",
    backgroundColor: onboardingColors.surface,
    borderColor: onboardingColors.borderStrong,
    borderRadius: onboardingRadii.pill,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 50,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  choiceSelected: {
    backgroundColor: onboardingColors.surfaceSelected,
    borderColor: onboardingColors.surfaceSelected,
  },
  choiceGlyph: {
    alignItems: "center",
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  choiceGlyphText: {
    color: onboardingColors.glyph,
    fontFamily: fontFamily(700),
    fontSize: 15,
  },
  choiceGlyphTextSelected: {
    color: onboardingColors.glyphSelected,
  },
  choiceCopy: {
    flex: 1,
    gap: 2,
  },
  choiceLabel: {
    color: onboardingColors.ink,
    fontFamily: fontFamily(600),
    fontSize: 15,
  },
  choiceLabelSelected: {
    color: onboardingColors.inkInverse,
  },
  choiceDetail: {
    color: onboardingColors.inkSubtle,
    fontFamily: fontFamily(500),
    fontSize: 12,
    lineHeight: 16,
  },
  choiceDetailSelected: {
    color: onboardingColors.inkInverseMuted,
  },
  permissionRow: {
    alignItems: "center",
    backgroundColor: onboardingColors.surface,
    borderColor: onboardingColors.border,
    borderRadius: onboardingRadii.card,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    gap: 16,
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  permissionCopy: {
    flex: 1,
    gap: 4,
  },
  permissionTitle: {
    color: onboardingColors.ink,
    fontFamily: fontFamily(700),
    fontSize: 16,
  },
  permissionBody: {
    color: onboardingColors.inkMuted,
    fontFamily: fontFamily(500),
    fontSize: 12,
    lineHeight: 16,
  },
  permissionCheck: {
    alignItems: "center",
    borderColor: onboardingColors.borderStrong,
    borderRadius: 6,
    borderCurve: "continuous",
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  permissionCheckActive: {
    backgroundColor: onboardingColors.accent,
    borderColor: onboardingColors.accent,
  },
  permissionCheckText: {
    color: onboardingColors.accentInk,
    fontFamily: fontFamily(800),
    fontSize: 14,
    lineHeight: 17,
  },
  input: {
    backgroundColor: onboardingColors.surface,
    borderColor: onboardingColors.border,
    borderRadius: onboardingRadii.field,
    borderCurve: "continuous",
    borderWidth: 1,
    color: onboardingColors.ink,
    fontFamily: fontFamily(600),
    fontSize: 18,
    minHeight: 64,
    paddingHorizontal: 24,
    paddingVertical: 20,
    textAlign: "center",
  },
  section: {
    gap: 11,
  },
  infoRow: {
    backgroundColor: onboardingColors.surface,
    borderColor: onboardingColors.border,
    borderRadius: onboardingRadii.card,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  infoMarker: {
    alignItems: "center",
    backgroundColor: "rgba(107, 158, 138, 0.16)",
    borderRadius: 13,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  infoMarkerText: {
    color: onboardingColors.accent,
    fontFamily: fontFamily(800),
    fontSize: 12,
  },
  infoCopy: {
    flex: 1,
    gap: 3,
  },
  infoTitle: {
    color: onboardingColors.ink,
    fontFamily: fontFamily(700),
    fontSize: 14,
  },
  infoBody: {
    color: onboardingColors.inkMuted,
    fontFamily: fontFamily(500),
    fontSize: 12,
    lineHeight: 16,
  },
});
