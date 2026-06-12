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
 * Visuals here are deliberately PLAIN placeholders. Liquid Glass message rows,
 * the floating Composer, safe-area/keyboard handling, and Dynamic Type are #45.
 * Protocol, routing, and Agent State semantics live behind the Runtime Adapter.
 *
 * assistant-ui primitive/runtime composition (niche vendor API):
 * https://www.assistant-ui.com/docs/runtimes/external-store
 */
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react-native";
import { useExternalStoreRuntime } from "@assistant-ui/core/react";

import { createDevRuntimeAdapter } from "../runtime/dev-transport";
import type { RuntimeAdapter } from "../types/conversation";
import { useCompanionRuntime } from "./use-companion-runtime";

export interface CompanionChatProps {
  /**
   * The chat domain runtime. Defaults to a Protocol-shaped dev transport with
   * no backend so simulator smoke tests still work offline.
   */
  readonly adapter?: RuntimeAdapter;
}

export function CompanionChat({ adapter }: CompanionChatProps): React.JSX.Element {
  const resolvedAdapter = useMemo(() => adapter ?? createDevRuntimeAdapter(), [adapter]);
  const externalStore = useCompanionRuntime(resolvedAdapter);
  const runtime = useExternalStoreRuntime(externalStore);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root style={styles.screen}>
        <ThreadPrimitive.Messages
          components={{ UserMessage, AssistantMessage }}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
        />
        <ThreadPrimitive.If running>
          <View testID="intentive-thinking" style={styles.thinking}>
            <Text style={styles.thinkingText}>Thinking…</Text>
          </View>
        </ThreadPrimitive.If>
        <Composer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

/**
 * Intentive-owned user row — plain placeholder bubble proving vendor message
 * visuals are fully overridable. Liquid Glass styling is #45.
 */
function UserMessage(): React.JSX.Element {
  return (
    <MessagePrimitive.Root testID="intentive-user-row" style={[styles.row, styles.userRow]}>
      <MessagePrimitive.Content
        renderText={({ part }) => <Text style={styles.userText}>{part.text}</Text>}
      />
    </MessagePrimitive.Root>
  );
}

/**
 * Intentive-owned Companion row — renders the canned reply streamed by the dev
 * adapter (or, under #33, the Protocol-backed adapter). Plain placeholder only.
 */
function AssistantMessage(): React.JSX.Element {
  return (
    <MessagePrimitive.Root
      testID="intentive-assistant-row"
      style={[styles.row, styles.assistantRow]}
    >
      <MessagePrimitive.Content
        renderText={({ part }) => <Text style={styles.assistantText}>{part.text}</Text>}
      />
      {/* Renders only when this Companion message carries an error. Quiet inline
          recovery with a single retry — the streaming/Agent-State-driven version
          is #33; the Liquid Glass presentation is #45. */}
      <ErrorPrimitive.Root testID="intentive-error" style={styles.error}>
        <ErrorPrimitive.Message style={styles.errorText} />
        <ActionBarPrimitive.Reload testID="intentive-retry" style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </ActionBarPrimitive.Reload>
      </ErrorPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

/**
 * Intentive-owned composer — replaces the vendor stock footer entirely, proving
 * the composer slot is override-able. Plain visuals only (no floating Liquid
 * Glass, no keyboard/safe-area handling — that is #45).
 */
function Composer(): React.JSX.Element {
  return (
    <ComposerPrimitive.Root style={styles.composer}>
      <ComposerPrimitive.Input
        testID="intentive-composer-input"
        placeholder="Message your companion"
        style={styles.input}
      />
      <ComposerPrimitive.Send testID="intentive-composer-send" style={styles.send}>
        <Text style={styles.sendText}>Send</Text>
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12 },
  messages: { flex: 1 },
  messagesContent: { gap: 8, paddingVertical: 8 },
  row: { maxWidth: "85%", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  userRow: { alignSelf: "flex-end", backgroundColor: "#1f6feb" },
  assistantRow: { alignSelf: "flex-start", backgroundColor: "#e5e5ea" },
  userText: { color: "white", fontSize: 15 },
  assistantText: { color: "#111", fontSize: 15 },
  thinking: { alignSelf: "flex-start", paddingHorizontal: 4, paddingVertical: 2 },
  thinkingText: { fontSize: 13, fontStyle: "italic", opacity: 0.6 },
  error: { gap: 6, marginTop: 4 },
  errorText: { fontSize: 13, color: "#b00020" },
  retry: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#b00020",
  },
  retryText: { fontSize: 13, color: "#b00020", fontWeight: "600" },
  composer: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#888",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  send: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1f6feb",
  },
  sendText: { color: "white", fontSize: 15, fontWeight: "600" },
});
