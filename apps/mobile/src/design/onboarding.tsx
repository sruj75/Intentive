import { type ReactNode, useMemo } from "react";
import { Image, type ImageProps } from "expo-image";
import {
  ActivityIndicator,
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

import { useMobileTheme, type MobileThemeColors } from "./theme";

export type OnboardingBackdrop =
  | "welcome"
  | "privacy"
  | "name"
  | "source"
  | "permissions"
  | "mac"
  | "trial";

export type OnboardingIconSource = ImageProps["source"];

const ONBOARDING_BACKDROPS: Record<OnboardingBackdrop, OnboardingIconSource> = {
  welcome: require("../../assets/onboarding/welcome.png") as OnboardingIconSource,
  privacy: require("../../assets/onboarding/privacy.png") as OnboardingIconSource,
  name: require("../../assets/onboarding/name.png") as OnboardingIconSource,
  source: require("../../assets/onboarding/source.png") as OnboardingIconSource,
  permissions: require("../../assets/onboarding/permissions.png") as OnboardingIconSource,
  mac: require("../../assets/onboarding/mac.png") as OnboardingIconSource,
  trial: require("../../assets/onboarding/trial.png") as OnboardingIconSource,
};

export const ONBOARDING_ICONS = {
  apple: require("../../assets/onboarding/icons/apple.png") as OnboardingIconSource,
  google: require("../../assets/onboarding/icons/google.png") as OnboardingIconSource,
  instagram: require("../../assets/onboarding/icons/instagram.png") as OnboardingIconSource,
  linkedin: require("../../assets/onboarding/icons/linkedin.png") as OnboardingIconSource,
  x: require("../../assets/onboarding/icons/x.png") as OnboardingIconSource,
  youtube: require("../../assets/onboarding/icons/youtube.png") as OnboardingIconSource,
};

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
 * semantics stay in the caller.
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
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
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
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

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
  readonly leadingIcon?: OnboardingIconSource;
  readonly leadingIconTintColor?: string;
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
  leadingIcon,
  leadingIconTintColor,
  leading,
  testID,
  variant = "primary",
}: OnboardingActionProps): React.JSX.Element {
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
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
        <ActivityIndicator color={variant === "accent" ? "white" : "#090909"} />
      ) : (
        <>
          {leadingIcon ? (
            <Image
              contentFit="contain"
              source={leadingIcon}
              style={styles.actionIcon}
              tintColor={leadingIconTintColor}
            />
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
  readonly icon?: OnboardingIconSource;
  readonly iconTintColor?: string | null;
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
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

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
            {choice.icon ? (
              <View style={[styles.choiceGlyph, selected ? styles.choiceGlyphSelected : null]}>
                <Image
                  contentFit="contain"
                  source={choice.icon}
                  style={styles.choiceIcon}
                  tintColor={
                    choice.iconTintColor === null
                      ? undefined
                      : (choice.iconTintColor ?? (selected ? "#050505" : "white"))
                  }
                />
              </View>
            ) : choice.leading ? (
              <View style={[styles.choiceGlyph, selected ? styles.choiceGlyphSelected : null]}>
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
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

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
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

  return (
    <TextInput
      placeholderTextColor="#8A8A8A"
      selectionColor={theme.colors.action}
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
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function OnboardingBody({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function OnboardingFinePrint({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
  return <Text style={[styles.finePrint, style]}>{children}</Text>;
}

export function OnboardingSection({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
  return <View style={[styles.section, style]}>{children}</View>;
}

export function OnboardingInfoRow({
  title,
  body,
  marker,
}: {
  readonly title: string;
  readonly body: string;
  readonly marker?: string;
}): React.JSX.Element {
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

  return (
    <View style={styles.infoRow}>
      {marker ? (
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

function createStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: "#050505",
      flex: 1,
      overflow: "hidden",
    },
    backdropScrim: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
      backgroundColor: "rgba(0, 0, 0, 0.18)",
    },
    bottomScrim: {
      bottom: 0,
      height: "46%",
      left: 0,
      position: "absolute",
      right: 0,
      backgroundColor: "rgba(0, 0, 0, 0.42)",
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
      backgroundColor: "rgba(0, 0, 0, 0.34)",
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
      color: "white",
      fontSize: 30,
      fontWeight: "500",
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
      backgroundColor: "rgba(255, 255, 255, 0.42)",
      borderRadius: 4,
      height: 7,
      width: 7,
    },
    progressDotActive: {
      backgroundColor: colors.action,
      width: 16,
    },
    stage: {
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      alignSelf: "stretch",
      backgroundColor: "#050505",
      borderTopLeftRadius: 40,
      borderTopRightRadius: 40,
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
      color: "white",
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: 0,
      lineHeight: 34,
    },
    body: {
      color: "rgba(255, 255, 255, 0.82)",
      fontSize: 15,
      lineHeight: 22,
    },
    finePrint: {
      color: "rgba(255, 255, 255, 0.56)",
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
    },
    action: {
      alignItems: "center",
      alignSelf: "stretch",
      borderRadius: 999,
      borderCurve: "continuous",
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      height: 56,
      paddingHorizontal: 24,
      paddingVertical: 0,
    },
    actionPrimary: {
      backgroundColor: "white",
    },
    actionSecondary: {
      backgroundColor: "#1D1D1D",
      borderColor: "rgba(255, 255, 255, 0.12)",
      borderWidth: 1,
    },
    actionAccent: {
      backgroundColor: colors.action,
    },
    actionDisabled: {
      opacity: 0.45,
    },
    actionText: {
      fontSize: 18,
      fontWeight: "600",
    },
    actionIcon: {
      height: 22,
      width: 22,
    },
    actionLeading: {
      fontSize: 20,
      fontWeight: "700",
      minWidth: 22,
      textAlign: "center",
    },
    actionPrimaryText: {
      color: "#070707",
    },
    actionSecondaryText: {
      color: "white",
    },
    actionAccentText: {
      color: "white",
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
      backgroundColor: "rgba(5, 5, 5, 0.82)",
      bottom: 0,
      height: 22,
      left: 0,
      position: "absolute",
      right: 0,
    },
    choice: {
      alignItems: "center",
      backgroundColor: "#1D1D1D",
      borderColor: "rgba(255, 255, 255, 0.28)",
      borderRadius: 40,
      borderCurve: "continuous",
      borderWidth: 1,
      flexDirection: "row",
      gap: 14,
      minHeight: 50,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    choiceSelected: {
      backgroundColor: "white",
      borderColor: "white",
    },
    choiceGlyph: {
      alignItems: "center",
      borderRadius: 10,
      height: 20,
      justifyContent: "center",
      width: 20,
    },
    choiceGlyphSelected: {
      backgroundColor: "rgba(0, 0, 0, 0.08)",
    },
    choiceGlyphText: {
      color: "white",
      fontSize: 15,
      fontWeight: "700",
    },
    choiceGlyphTextSelected: {
      color: "#050505",
    },
    choiceCopy: {
      flex: 1,
      gap: 2,
    },
    choiceLabel: {
      color: "white",
      fontSize: 15,
      fontWeight: "500",
    },
    choiceLabelSelected: {
      color: "#050505",
    },
    choiceDetail: {
      color: "rgba(255, 255, 255, 0.58)",
      fontSize: 12,
      lineHeight: 16,
    },
    choiceDetailSelected: {
      color: "rgba(0, 0, 0, 0.58)",
    },
    choiceIcon: {
      height: 18,
      width: 18,
    },
    permissionRow: {
      alignItems: "center",
      backgroundColor: "#1D1D1D",
      borderColor: "rgba(255, 255, 255, 0.12)",
      borderRadius: 16,
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
      color: "white",
      fontSize: 16,
      fontWeight: "600",
    },
    permissionBody: {
      color: "rgba(255, 255, 255, 0.62)",
      fontSize: 12,
      lineHeight: 16,
    },
    permissionCheck: {
      alignItems: "center",
      borderColor: "rgba(255, 255, 255, 0.52)",
      borderRadius: 5,
      borderCurve: "continuous",
      borderWidth: 2,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    permissionCheckActive: {
      backgroundColor: "white",
      borderColor: "white",
    },
    permissionCheckText: {
      color: "#050505",
      fontSize: 14,
      fontWeight: "900",
      lineHeight: 17,
    },
    input: {
      backgroundColor: "#1D1D1D",
      borderColor: "rgba(255, 255, 255, 0.12)",
      borderRadius: 16,
      borderCurve: "continuous",
      borderWidth: 1,
      color: "white",
      fontSize: 18,
      fontWeight: "500",
      minHeight: 64,
      paddingHorizontal: 24,
      paddingVertical: 20,
      textAlign: "center",
    },
    section: {
      gap: 11,
    },
    infoRow: {
      backgroundColor: "#1D1D1D",
      borderColor: "rgba(255, 255, 255, 0.1)",
      borderRadius: 18,
      borderCurve: "continuous",
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    infoMarker: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.09)",
      borderRadius: 13,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    infoMarkerText: {
      color: "white",
      fontSize: 12,
      fontWeight: "800",
    },
    infoCopy: {
      flex: 1,
      gap: 3,
    },
    infoTitle: {
      color: "white",
      fontSize: 14,
      fontWeight: "700",
    },
    infoBody: {
      color: "rgba(255, 255, 255, 0.62)",
      fontSize: 12,
      lineHeight: 16,
    },
  });
}
