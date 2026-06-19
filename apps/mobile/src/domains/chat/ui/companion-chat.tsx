/**
 * Intentive Chat Components — the spike wrapper over `@assistant-ui/react-native`
 * (#22, ADR 0009). This is the ONLY place the vendor package is imported; the
 * route renders `<CompanionChat/>` and never sees a vendor type.
 *
 * The wrapper is the deep module: a tiny interface (`<CompanionChat adapter?/>`)
 * hiding the runtime hookup, the adapter slot, custom message rows, a custom
 * composer, and the loading/error/retry surfaces. It accepts the Runtime Adapter
 * (dependency injection) so tests and the route can feed either the dev
 * Protocol transport or the production Protocol-backed adapter.
 *
 * assistant-ui primitive/runtime composition (niche vendor API):
 * https://www.assistant-ui.com/docs/runtimes/external-store
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { AccountState } from "@intentive/api-contract";
import { Image } from "expo-image";
import { useComposerSend, useExternalStoreRuntime } from "@assistant-ui/core/react";
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets, type Metrics } from "react-native-safe-area-context";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react-native";

import { createDevRuntimeAdapter } from "../runtime/dev-transport";
import {
  lightTheme,
  useMobileTheme,
  type MobileTheme,
  type MobileThemeColors,
} from "../../../design/theme";
import type { AccountStateSource } from "../../../providers/account-state";
import type { AgentStateOverride, RuntimeAdapter } from "../types/conversation";
import { deriveChatPresentation, type ChatPresentation } from "../service/chat-presentation";
import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { useCompanionRuntime } from "./use-companion-runtime";

export interface CompanionChatProps {
  /**
   * The chat domain runtime. Defaults to a Protocol-shaped dev transport with
   * no backend so simulator smoke tests still work offline.
   */
  readonly adapter?: RuntimeAdapter;
  readonly accountStateSource?: AccountStateSource;
  readonly accountStateRefreshKey?: unknown;
  readonly agentStateOverride?: AgentStateOverride;
  readonly initialSafeAreaMetrics?: Metrics;
  readonly onOpenAccount?: () => void;
}

export function CompanionChat({
  adapter,
  accountStateSource,
  accountStateRefreshKey,
  agentStateOverride,
  initialSafeAreaMetrics,
  onOpenAccount,
}: CompanionChatProps): React.JSX.Element {
  const resolvedAdapter = useMemo(() => adapter ?? createDevRuntimeAdapter(), [adapter]);

  return (
    <SafeAreaProvider initialMetrics={initialSafeAreaMetrics ?? CHAT_SAFE_AREA_INITIAL_METRICS}>
      <CompanionChatSurface
        adapter={resolvedAdapter}
        accountStateSource={accountStateSource}
        accountStateRefreshKey={accountStateRefreshKey}
        agentStateOverride={agentStateOverride}
        onOpenAccount={onOpenAccount}
      />
    </SafeAreaProvider>
  );
}

function CompanionChatSurface({
  adapter,
  accountStateSource,
  accountStateRefreshKey,
  agentStateOverride,
  onOpenAccount,
}: {
  readonly adapter: RuntimeAdapter;
  readonly accountStateSource?: AccountStateSource;
  readonly accountStateRefreshKey?: unknown;
  readonly agentStateOverride?: AgentStateOverride;
  readonly onOpenAccount?: () => void;
}): React.JSX.Element {
  const state = useSyncExternalStore(adapter.subscribe, adapter.getState, adapter.getState);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [macSetupBannerDismissed, setMacSetupBannerDismissed] = useState(false);
  const presentation = deriveChatPresentation(state, {
    accountState,
    agentStateOverride,
    macSetupBannerDismissed,
  });
  const externalStore = useCompanionRuntime(adapter);
  const runtime = useExternalStoreRuntime(externalStore);
  const insets = useSafeAreaInsets();
  const [composerHeight, setComposerHeight] = useState(112);
  const theme = useMobileTheme();
  const visuals = useMemo(() => createChatVisuals(theme), [theme]);
  const styles = visuals.styles;
  const bottomInset = composerHeight + insets.bottom + 28;
  const topChromeTop = deriveTopChromeTop(insets.top);
  const continuityTop = deriveContinuityTop(insets.top);
  const messagesTop = deriveMessagesTop(insets.top);

  useEffect(() => {
    if (!accountStateSource) {
      setAccountState(null);
      return undefined;
    }
    let active = true;
    void accountStateSource
      .read()
      .then((next) => {
        if (active) setAccountState(next);
      })
      .catch(() => {
        if (active) setAccountState(null);
      });

    return () => {
      active = false;
    };
  }, [accountStateRefreshKey, accountStateSource]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatVisualContext.Provider value={visuals}>
        <KeyboardAvoidingView
          behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
          style={styles.screen}
        >
          <ThreadPrimitive.Root style={styles.thread}>
            <TopChrome
              top={topChromeTop}
              presentation={presentation}
              onDismissMacSetup={() => setMacSetupBannerDismissed(true)}
              onOpenAccount={onOpenAccount}
            />
            <ContinuityEvents presentation={presentation} top={continuityTop} />
            <ThreadPrimitive.Messages
              components={{ UserMessage, AssistantMessage }}
              contentInsetAdjustmentBehavior="automatic"
              style={styles.messages}
              contentContainerStyle={[
                styles.messagesContent,
                { paddingBottom: bottomInset, paddingTop: messagesTop },
              ]}
              testID="intentive-message-list"
            />
            {presentation.protectedOpening.status === "pending" ? (
              <View testID="intentive-opening-pending" style={styles.openingDock}>
                <ComposingBubble />
              </View>
            ) : null}
            {state.agentState === "thinking" &&
            presentation.protectedOpening.status === "inactive" ? (
              <View testID="intentive-thinking" style={styles.openingDock}>
                <ComposingBubble />
              </View>
            ) : null}
            {presentation.protectedOpening.status === "failed" ? (
              <OpeningFailure
                copy={presentation.openingRecoveryCopy}
                onRetry={() => {
                  void adapter.connect();
                }}
              />
            ) : null}
            <Composer
              bottomInset={insets.bottom}
              onHeightChange={setComposerHeight}
              presentation={presentation}
            />
          </ThreadPrimitive.Root>
        </KeyboardAvoidingView>
      </ChatVisualContext.Provider>
    </AssistantRuntimeProvider>
  );
}

function UserMessage(): React.JSX.Element {
  const { styles } = useChatVisuals();
  return (
    <MessagePrimitive.Root testID="intentive-user-row" style={[styles.row, styles.userRow]}>
      <MessagePrimitive.Content
        renderText={({ part }) => <Text style={styles.userText}>{part.text}</Text>}
      />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage(): React.JSX.Element {
  const { styles } = useChatVisuals();
  return (
    <MessagePrimitive.Root
      testID="intentive-assistant-row"
      style={[styles.row, styles.assistantRow]}
    >
      <MessagePrimitive.Content
        renderText={({ part }) => <Text style={styles.assistantText}>{part.text}</Text>}
      />
      <ErrorPrimitive.Root testID="intentive-error" style={styles.error}>
        <ErrorPrimitive.Message style={styles.errorText} />
        <ActionBarPrimitive.Reload testID="intentive-retry" style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </ActionBarPrimitive.Reload>
      </ErrorPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function TopChrome({
  top,
  presentation,
  onDismissMacSetup,
  onOpenAccount,
}: {
  readonly top: number;
  readonly presentation: ChatPresentation;
  readonly onDismissMacSetup: () => void;
  readonly onOpenAccount?: () => void;
}): React.JSX.Element {
  const { styles } = useChatVisuals();
  return (
    <View testID="intentive-top-chrome" style={[styles.topChrome, { top }]}>
      <AgentStateChip presentation={presentation} />
      <View style={styles.topChromeSpacer} />
      {presentation.macSetupBanner.visible ? (
        <MacSetupBanner
          copy={presentation.macSetupBanner.copy}
          onDismiss={onDismissMacSetup}
          onOpenAccount={onOpenAccount}
        />
      ) : null}
      <AccountAffordance onOpenAccount={onOpenAccount} />
    </View>
  );
}

function AgentStateChip({
  presentation,
}: {
  readonly presentation: ChatPresentation;
}): React.JSX.Element {
  const { styles } = useChatVisuals();
  return (
    <AdaptiveGlassSurface fallbackStyle={styles.glassFallback} style={styles.agentStateSurface}>
      <Text testID="intentive-agent-state" style={styles.agentStateText}>
        {presentation.agentState.label}
      </Text>
    </AdaptiveGlassSurface>
  );
}

function ContinuityEvents({
  presentation,
  top,
}: {
  readonly presentation: ChatPresentation;
  readonly top: number;
}): React.JSX.Element | null {
  const { styles } = useChatVisuals();
  const event = presentation.continuityEvents[presentation.continuityEvents.length - 1];
  if (!event) return null;

  return (
    <View
      testID="intentive-continuity-dock"
      style={[styles.continuityDock, { top }]}
      pointerEvents="none"
    >
      <Text testID="intentive-continuity-event" style={styles.continuityText}>
        {event.copy}
      </Text>
    </View>
  );
}

function MacSetupBanner({
  copy,
  onDismiss,
  onOpenAccount,
}: {
  readonly copy: string;
  readonly onDismiss: () => void;
  readonly onOpenAccount?: () => void;
}): React.JSX.Element {
  const { colors, styles } = useChatVisuals();
  return (
    <AdaptiveGlassSurface fallbackStyle={styles.glassFallback} style={styles.macSetupSurface}>
      <Pressable
        accessibilityLabel={copy}
        accessibilityRole="button"
        onPress={onOpenAccount}
        style={styles.macSetupButton}
        testID="intentive-mac-setup-banner"
      >
        <Text numberOfLines={1} style={styles.macSetupText}>
          {copy}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Dismiss Mac setup"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onDismiss}
        style={styles.macSetupDismiss}
      >
        <Image source="sf:xmark" style={styles.macSetupDismissIcon} tintColor={colors.inkMuted} />
      </Pressable>
    </AdaptiveGlassSurface>
  );
}

function AccountAffordance({
  onOpenAccount,
}: {
  readonly onOpenAccount?: () => void;
}): React.JSX.Element {
  const { colors, styles } = useChatVisuals();
  return (
    <AdaptiveGlassSurface
      fallbackStyle={styles.glassFallback}
      isInteractive
      style={styles.accountSurface}
    >
      <Pressable
        accessibilityLabel="Open account"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onOpenAccount}
        style={styles.accountButton}
        testID="intentive-account-affordance"
      >
        <Image
          source="sf:person.crop.circle"
          style={styles.accountIcon}
          tintColor={colors.inkMuted}
        />
      </Pressable>
    </AdaptiveGlassSurface>
  );
}

function OpeningFailure({
  copy,
  onRetry,
}: {
  readonly copy: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  const { styles } = useChatVisuals();
  return (
    <View
      testID="intentive-opening-failed"
      style={[styles.row, styles.assistantRow, styles.failure]}
    >
      <Text selectable style={styles.assistantText}>
        {copy}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.retry}
        testID="intentive-opening-retry"
      >
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

function ComposingBubble(): React.JSX.Element {
  const { styles } = useChatVisuals();
  return (
    <View style={[styles.row, styles.assistantRow, styles.composingBubble]}>
      <View style={styles.composingDot} />
      <View style={styles.composingDot} />
      <View style={styles.composingDot} />
    </View>
  );
}

function Composer({
  bottomInset,
  onHeightChange,
  presentation,
}: {
  readonly bottomInset: number;
  readonly onHeightChange: (height: number) => void;
  readonly presentation: ChatPresentation;
}): React.JSX.Element {
  const { colors, styles } = useChatVisuals();
  const { disabled: sendDisabled, send } = useComposerSend();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice === null) return undefined;
    const timer = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(timer);
  }, [notice]);

  const onSendPress = () => {
    if (!presentation.canSend) {
      setNotice(presentation.waitingToStartCopy);
      return;
    }
    if (sendDisabled) return;
    send();
  };

  const onLayout = (event: LayoutChangeEvent) => {
    onHeightChange(event.nativeEvent.layout.height);
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.composerDock, { paddingBottom: bottomInset + 10 }]}
      testID="intentive-composer-dock"
    >
      {notice === null ? null : (
        <Text selectable style={styles.notice}>
          {notice}
        </Text>
      )}
      <AdaptiveGlassSurface
        fallbackStyle={styles.glassFallback}
        style={styles.composerGlass}
        testID="intentive-composer-floating"
      >
        <ComposerPrimitive.Root style={styles.composer}>
          <ComposerPrimitive.Input
            multiline
            numberOfLines={1}
            scrollEnabled
            submitMode="none"
            testID="intentive-composer-input"
            placeholder="Message your Companion"
            placeholderTextColor={colors.inkSubtle}
            style={styles.input}
          />
          <Pressable
            accessibilityLabel="Send message"
            accessibilityRole="button"
            accessibilityState={{ disabled: !presentation.canSend || sendDisabled }}
            hitSlop={8}
            onPress={onSendPress}
            style={[styles.send, (!presentation.canSend || sendDisabled) && styles.sendUnavailable]}
            testID="intentive-composer-send"
          >
            <Image
              source="sf:arrow.up"
              style={styles.sendIcon}
              testID="intentive-composer-send-icon"
              tintColor={colors.userText}
            />
          </Pressable>
        </ComposerPrimitive.Root>
      </AdaptiveGlassSurface>
    </View>
  );
}

interface ChatVisuals {
  readonly colors: MobileThemeColors;
  readonly styles: ReturnType<typeof createChatStyles>;
}

const ChatVisualContext = createContext<ChatVisuals>(createChatVisualsForTheme(lightTheme));

function createChatVisuals(theme: MobileTheme): ChatVisuals {
  return createChatVisualsForTheme(theme);
}

function createChatVisualsForTheme(theme: MobileTheme): ChatVisuals {
  return {
    colors: theme.colors,
    styles: createChatStyles(theme.colors),
  };
}

function useChatVisuals(): ChatVisuals {
  return useContext(ChatVisualContext);
}

const CHAT_SAFE_AREA_INITIAL_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
};

const TOP_CHROME_MIN_TOP = 18;
const TOP_CHROME_SAFE_AREA_GAP = 8;
const TOP_CHROME_ESTIMATED_HEIGHT = 42;
const CONTINUITY_DOCK_GAP = 8;
const CONTINUITY_DOCK_ESTIMATED_HEIGHT = 30;
const MESSAGE_TOP_GAP = 20;

function deriveTopChromeTop(topInset: number): number {
  return Math.max(topInset + TOP_CHROME_SAFE_AREA_GAP, TOP_CHROME_MIN_TOP);
}

function deriveContinuityTop(topInset: number): number {
  return deriveTopChromeTop(topInset) + TOP_CHROME_ESTIMATED_HEIGHT + CONTINUITY_DOCK_GAP;
}

function deriveMessagesTop(topInset: number): number {
  return deriveContinuityTop(topInset) + CONTINUITY_DOCK_ESTIMATED_HEIGHT + MESSAGE_TOP_GAP;
}

function createChatStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    thread: { flex: 1, backgroundColor: colors.canvas },
    messages: { flex: 1 },
    messagesContent: {
      gap: 10,
      paddingHorizontal: 18,
    },
    row: {
      maxWidth: "84%",
      borderRadius: 22,
      borderCurve: "continuous",
      paddingHorizontal: 15,
      paddingVertical: 11,
    },
    userRow: {
      alignSelf: "flex-end",
      backgroundColor: colors.user,
      boxShadow: `0 8px 18px ${colors.userBubbleShadow}`,
    },
    assistantRow: {
      alignSelf: "flex-start",
      backgroundColor: colors.companion,
      borderColor: colors.line,
      borderWidth: StyleSheet.hairlineWidth,
      boxShadow: `0 8px 24px ${colors.companionBubbleShadow}`,
    },
    userText: { color: colors.userText, fontSize: 16, lineHeight: 22 },
    assistantText: { color: colors.ink, fontSize: 16, lineHeight: 22 },
    openingDock: {
      bottom: 116,
      left: 18,
      position: "absolute",
      right: 18,
    },
    composingBubble: {
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    composingDot: {
      backgroundColor: colors.inkSubtle,
      borderRadius: 4,
      height: 7,
      opacity: 0.8,
      width: 7,
    },
    failure: {
      bottom: 116,
      gap: 10,
      left: 18,
      position: "absolute",
      right: 18,
    },
    error: { gap: 6, marginTop: 4 },
    errorText: { color: colors.danger, fontSize: 13 },
    retry: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.dangerBorder,
    },
    retryText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
    topChrome: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      left: 16,
      position: "absolute",
      right: 16,
      zIndex: 5,
    },
    topChromeSpacer: { flex: 1 },
    agentStateSurface: {
      borderRadius: 999,
      borderCurve: "continuous",
      overflow: "hidden",
    },
    agentStateText: {
      color: colors.inkMuted,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 16,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    continuityDock: {
      alignItems: "center",
      left: 18,
      position: "absolute",
      right: 18,
      zIndex: 2,
    },
    continuityText: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      color: colors.inkMuted,
      fontSize: 12,
      fontWeight: "600",
      overflow: "hidden",
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    macSetupSurface: {
      alignItems: "center",
      borderRadius: 999,
      borderCurve: "continuous",
      flexDirection: "row",
      maxWidth: 230,
      minHeight: 42,
      overflow: "hidden",
    },
    macSetupButton: {
      flexShrink: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingLeft: 12,
      paddingRight: 4,
    },
    macSetupText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 16,
    },
    macSetupDismiss: {
      alignItems: "center",
      height: 42,
      justifyContent: "center",
      width: 34,
    },
    macSetupDismissIcon: { height: 12, width: 12 },
    accountSurface: {
      borderRadius: 999,
      borderCurve: "continuous",
      overflow: "hidden",
    },
    accountButton: {
      alignItems: "center",
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    accountIcon: { height: 23, width: 23 },
    glassFallback: {
      backgroundColor: colors.elevated,
      borderColor: colors.line,
      borderWidth: StyleSheet.hairlineWidth,
    },
    composerDock: {
      bottom: 0,
      gap: 7,
      left: 12,
      paddingHorizontal: 4,
      position: "absolute",
      right: 12,
      zIndex: 3,
    },
    composerGlass: {
      borderRadius: 28,
      borderCurve: "continuous",
      overflow: "hidden",
      boxShadow: `0 16px 32px ${colors.glassShadow}`,
    },
    composer: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 10,
      padding: 10,
    },
    input: {
      flex: 1,
      maxHeight: 122,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: colors.ink,
      fontSize: 16,
      lineHeight: 21,
    },
    send: {
      alignItems: "center",
      backgroundColor: colors.action,
      borderRadius: 999,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    sendUnavailable: {
      backgroundColor: colors.actionDisabled,
    },
    sendIcon: { height: 17, width: 17 },
    notice: {
      alignSelf: "center",
      backgroundColor: colors.notice,
      borderRadius: 999,
      color: colors.noticeText,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
  });
}
