import type { ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeInUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { IdentityControl, OrbitalMark, PrimaryButton } from "../../../design/primitives";
import { mobileTheme as theme } from "../../../design/theme";
import { chatContent as content } from "../config/content";
import type { AccountSettingsActions } from "../../account/types/settings";
import type { ConversationSession, ConversationTimelineItem } from "../types/conversation-timeline";
import { DrawerOverlay } from "./drawer-overlay";

function SuggestionGroup({
  suggestions,
  disabled,
  onSelect,
}: {
  readonly suggestions: readonly string[];
  readonly disabled: boolean;
  readonly onSelect: (suggestion: string) => void;
}) {
  return (
    <View style={styles.suggestionGroup}>
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onSelect(suggestion)}
          style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
        >
          <Text selectable style={styles.suggestionText}>
            {suggestion}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ActivityDot({ delay }: { readonly delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
        -1,
      ),
    );
  }, [delay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.activityDot, animatedStyle]} />;
}

function TimelineRow({
  item,
  onSuggestionSelected,
}: {
  readonly item: ConversationTimelineItem;
  readonly onSuggestionSelected: (suggestion: string) => void;
}) {
  if (item.kind === "capability_card") {
    return (
      <Animated.View entering={FadeInUp} layout={LinearTransition} style={styles.capabilityCard}>
        <View style={styles.capabilityCopy}>
          <Text selectable style={styles.capabilityTitle}>
            {item.title}
          </Text>
          <Text selectable style={styles.capabilityBody}>
            {item.body}
          </Text>
          <PrimaryButton
            disabled
            label={item.actionLabel}
            onPress={() => undefined}
            style={styles.capabilityButton}
          />
        </View>
        <OrbitalMark compact />
      </Animated.View>
    );
  }

  if (item.kind === "suggestion_group") {
    return (
      <SuggestionGroup
        disabled={false}
        onSelect={onSuggestionSelected}
        suggestions={item.suggestions}
      />
    );
  }

  if (item.kind === "user_message") {
    return (
      <Animated.View entering={FadeInUp} layout={LinearTransition} style={styles.userMessageRow}>
        <View style={styles.userBubble}>
          <Text selectable style={styles.messageText}>
            {item.text}
          </Text>
        </View>
      </Animated.View>
    );
  }

  if (item.kind === "companion_message") {
    return (
      <Animated.View
        entering={FadeInUp}
        layout={LinearTransition}
        style={styles.companionMessageRow}
      >
        <Text selectable style={styles.companionMessageText}>
          {item.text}
        </Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      accessibilityLabel={
        item.phase === "thinking" ? content.thinkingLabel : content.composingLabel
      }
      entering={FadeInUp}
      layout={LinearTransition}
      style={styles.activityRow}
      testID={`chat-${item.phase}`}
    >
      {item.phase === "thinking" ? (
        <View style={styles.activityDots}>
          <ActivityDot delay={0} />
          <ActivityDot delay={160} />
          <ActivityDot delay={320} />
        </View>
      ) : (
        <Text style={styles.composingText}>…</Text>
      )}
    </Animated.View>
  );
}

function Composer({
  disabled,
  onChange,
  onSubmit,
  value,
}: {
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly value: string;
}) {
  return (
    <View style={styles.composerRow}>
      <OrbitalMark compact />
      <View style={[styles.composer, disabled && styles.composerDisabled]}>
        <TextInput
          accessibilityLabel={content.composerLabel}
          blurOnSubmit={false}
          editable={!disabled}
          enterKeyHint="send"
          multiline
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          placeholder={content.composerPlaceholder}
          placeholderTextColor={theme.color.mutedInk}
          returnKeyType="send"
          style={styles.composerInput}
          testID="composer-input"
          value={value}
        />
        <Pressable
          accessibilityLabel={content.attachmentUnavailable}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.composerAffordance}
        >
          <Text style={styles.composerIcon}>+</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={content.microphoneUnavailable}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.composerAffordance}
        >
          <Text style={styles.composerIcon}>♩</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ConversationScene({
  composerValue,
  firstName,
  initials,
  mode,
  onBeginEducation,
  onComposerChange,
  onLogout,
  onReplayEducation,
  proactiveSuggestions,
  renderSettings,
  session,
}: {
  readonly composerValue: string;
  readonly firstName: string;
  readonly initials: string;
  readonly mode: "welcome" | "ready";
  readonly onBeginEducation: () => void;
  readonly onComposerChange: (value: string) => void;
  readonly onLogout: () => void;
  readonly onReplayEducation: () => void;
  readonly proactiveSuggestions: boolean;
  readonly renderSettings: (actions: AccountSettingsActions) => ReactNode;
  readonly session: ConversationSession;
}) {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const [overlay, setOverlay] = useState<"none" | "drawer" | "settings">("none");
  const scrollRef = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const isWelcome = mode === "welcome";
  const submitComposer = () => {
    if (isWelcome || composerValue.trim().length === 0) return;
    session.send(composerValue);
    onComposerChange("");
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={styles.screen}
      testID="conversation-keyboard-avoiding"
    >
      <View style={styles.header}>
        <IdentityControl
          accessibilityLabel={content.openMenu}
          initials={initials}
          onPress={() => setOverlay("drawer")}
        />
      </View>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.thread, isWelcome && styles.welcomeThread]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (nearBottom.current) scrollRef.current?.scrollToEnd({ animated: true });
        }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          nearBottom.current =
            contentOffset.y + layoutMeasurement.height >= contentSize.height - 48;
        }}
        ref={scrollRef}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        testID="conversation-scroll"
      >
        {isWelcome ? (
          <View style={styles.welcome} testID="chat-welcome-state">
            <OrbitalMark />
            <Text selectable style={styles.welcomeTitle}>
              {content.welcome.title}
            </Text>
            <PrimaryButton
              label={content.welcome.action}
              onPress={onBeginEducation}
              style={styles.welcomeButton}
              testID="get-started"
            />
          </View>
        ) : (
          <View style={styles.timeline} testID="chat-ready-state">
            {snapshot.timeline.map((item) => {
              if (item.kind === "suggestion_group" && !proactiveSuggestions) {
                return null;
              }
              return (
                <TimelineRow item={item} key={item.id} onSuggestionSelected={onComposerChange} />
              );
            })}
          </View>
        )}
      </ScrollView>
      {isWelcome ? (
        <View style={styles.welcomeSuggestions}>
          <SuggestionGroup disabled onSelect={() => undefined} suggestions={content.suggestions} />
        </View>
      ) : null}
      <Composer
        disabled={isWelcome}
        onChange={onComposerChange}
        onSubmit={submitComposer}
        value={composerValue}
      />
      {overlay === "drawer" ? (
        <DrawerOverlay
          firstName={firstName}
          initials={initials}
          onClose={() => setOverlay("none")}
          onOpenSettings={() => setOverlay("settings")}
        />
      ) : null}
      {overlay === "settings"
        ? renderSettings({
            openDrawerLabel: content.openMenu,
            onOpenDrawer: () => setOverlay("drawer"),
            onReplayEducation: () => {
              setOverlay("none");
              onReplayEducation();
            },
            onLogout: () => {
              setOverlay("none");
              onLogout();
            },
          })
        : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.canvas },
  header: {
    minHeight: theme.component.chat.headerMinHeight,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: theme.space.md,
    zIndex: 2,
  },
  thread: { flexGrow: 1, padding: theme.space.md, gap: theme.space.lg },
  welcomeThread: { justifyContent: "center", alignItems: "center" },
  welcome: { alignItems: "center", gap: theme.space.lg, paddingHorizontal: theme.space.xl },
  welcomeTitle: {
    ...theme.type.bodyLarge,
    color: theme.color.ink,
    textAlign: "center",
    maxWidth: theme.component.chat.welcomeTitleMaxWidth,
  },
  welcomeButton: {
    minWidth: theme.component.chat.welcomeButtonMinWidth,
    minHeight: theme.component.chat.welcomeButtonMinHeight,
  },
  timeline: { flex: 1, gap: theme.space.lg },
  capabilityCard: {
    flexDirection: "row",
    gap: theme.space.md,
    alignItems: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.color.canvas,
    padding: theme.space.md,
    boxShadow: theme.shadow.card,
  },
  capabilityCopy: { flex: 1, gap: theme.space.xs },
  capabilityTitle: { ...theme.type.label, color: theme.color.ink },
  capabilityBody: { ...theme.type.caption, color: theme.color.mutedInk },
  capabilityButton: {
    alignSelf: "flex-start",
    minHeight: theme.component.chat.capabilityButtonMinHeight,
    paddingHorizontal: theme.space.sm,
  },
  suggestionGroup: { gap: theme.component.chat.suggestionGap, alignItems: "flex-start" },
  suggestion: {
    minHeight: theme.component.chat.suggestionMinHeight,
    justifyContent: "center",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.color.surfaceStrong,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    maxWidth: "94%",
  },
  suggestionPressed: { opacity: theme.component.interaction.subtlePressedOpacity },
  suggestionText: { ...theme.type.body, color: theme.color.ink },
  welcomeSuggestions: { paddingHorizontal: theme.space.xxl, paddingBottom: theme.space.sm },
  userMessageRow: { alignItems: "flex-end", paddingTop: theme.space.md },
  userBubble: {
    maxWidth: "82%",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceStrong,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
  },
  messageText: { ...theme.type.body, color: theme.color.ink },
  companionMessageRow: { alignItems: "flex-start", paddingVertical: theme.space.lg },
  companionMessageText: { ...theme.type.body, color: theme.color.ink, maxWidth: "92%" },
  activityRow: {
    minHeight: theme.component.chat.activityMinHeight,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  activityDots: {
    flexDirection: "row",
    gap: theme.component.chat.activityDotSize,
    paddingLeft: theme.space.xs,
  },
  activityDot: {
    width: theme.component.chat.activityDotSize,
    height: theme.component.chat.activityDotSize,
    borderRadius: theme.component.chat.activityDotSize / 2,
    backgroundColor: theme.color.secondaryInk,
  },
  composingText: { ...theme.type.bodyLarge, color: theme.color.secondaryInk },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.xs,
    paddingBottom: theme.space.sm,
  },
  composer: {
    flex: 1,
    minHeight: theme.component.chat.composerMinHeight,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceStrong,
    paddingLeft: theme.space.md,
    paddingRight: theme.space.xs,
  },
  composerDisabled: { opacity: theme.component.chat.composerDisabledOpacity },
  composerInput: {
    flex: 1,
    ...theme.type.body,
    color: theme.color.ink,
    maxHeight: theme.component.chat.composerInputMaxHeight,
    paddingVertical: theme.component.chat.composerInputVerticalPadding,
  },
  composerAffordance: {
    width: theme.component.chat.composerAffordanceWidth,
    height: theme.component.chat.composerAffordanceHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  composerIcon: {
    fontSize: theme.component.chat.composerIconSize,
    color: theme.color.secondaryInk,
  },
});
