/**
 * Companion Chat route-entry composition.
 *
 * This is the single place the `chat` and `account` domains are wired together —
 * the Runtime Adapter, the Account State source, the Companion Chat surface, and
 * the Account Surface sheet. It lives in `src/entrypoints/` (not a domain)
 * because `chat/ui` cannot import `account/ui` under the domain-boundary lint;
 * route-entry composition is the lint-safe home for explicit cross-domain
 * wiring. The `(chat)/` route stays navigation-only and renders `<ChatEntry/>`.
 *
 * Production builds the adapter and Account State source from the Auth Adapter
 * and the Control Plane base URL; tests inject `adapter`, `accountStateSource`,
 * `controlPlaneBaseUrl`, and safe-area metrics directly.
 */
import { useMemo, useState, useSyncExternalStore } from "react";
import type { Metrics } from "react-native-safe-area-context";

import {
  createControlPlaneAccountStateSource,
  useAccountStateProjection,
  type AccountStateSource,
} from "../providers/account-state";
import { useOptionalAuthAdapter } from "../domains/auth/ui/auth-context";
import { AccountSurface } from "../domains/account/ui/account-surface";
import { createDevRuntimeAdapter } from "../domains/chat/runtime/dev-transport";
import {
  createRuntimeAdapter,
  defaultResolveTimeZone,
  type WebSocketLike,
} from "../domains/chat/runtime/runtime-adapter";
import { CompanionChat } from "../domains/chat/ui/companion-chat";
import type { RuntimeAdapter } from "../domains/chat/types/conversation";

export interface ChatEntryProps {
  readonly adapter?: RuntimeAdapter;
  readonly accountStateSource?: AccountStateSource;
  readonly controlPlaneBaseUrl?: string;
  readonly initialSafeAreaMetrics?: Metrics;
}

export function ChatEntry({
  adapter: injectedAdapter,
  accountStateSource: injectedAccountStateSource,
  controlPlaneBaseUrl,
  initialSafeAreaMetrics,
}: ChatEntryProps = {}): React.JSX.Element {
  const authAdapter = useOptionalAuthAdapter();
  const [accountVisible, setAccountVisible] = useState(false);
  const baseUrl = controlPlaneBaseUrl ?? process.env.EXPO_PUBLIC_CONTROL_PLANE_BASE_URL ?? "";

  const adapter = useMemo(() => {
    if (injectedAdapter) return injectedAdapter;
    if (baseUrl.trim().length === 0) return createDevRuntimeAdapter();

    return createRuntimeAdapter({
      baseUrl,
      getUserJwt: () => authAdapter?.getUserJwt() ?? Promise.resolve(null),
      fetch: (url, init) => globalThis.fetch(url, init),
      createWebSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
      clientVersion: "mobile-v1",
      now: () => new Date().toISOString(),
      id: () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      schedule: (fn, delayMs) => {
        const timer = setTimeout(fn, delayMs);
        return { cancel: () => clearTimeout(timer) };
      },
      resolveTimeZone: defaultResolveTimeZone,
    });
  }, [authAdapter, baseUrl, injectedAdapter]);

  const accountStateSource = useMemo(
    () =>
      injectedAccountStateSource ??
      createControlPlaneAccountStateSource({
        baseUrl,
        getUserJwt: () => authAdapter?.getUserJwt() ?? Promise.resolve(null),
        fetch: (url, init) => globalThis.fetch(url, init),
      }),
    [authAdapter, baseUrl, injectedAccountStateSource],
  );

  const { accountState, refreshAccountState } = useAccountStateProjection(accountStateSource);
  const runtimeState = useSyncExternalStore(adapter.subscribe, adapter.getState, adapter.getState);

  return (
    <>
      <CompanionChat
        adapter={adapter}
        accountState={accountState}
        initialSafeAreaMetrics={initialSafeAreaMetrics}
        onOpenAccount={() => {
          // Drop any stale identity from a prior session before the read resolves.
          refreshAccountState({ clearBeforeRead: true });
          setAccountVisible(true);
        }}
      />
      <AccountSurface
        accountState={accountState}
        controlPlaneBaseUrl={baseUrl}
        onSignOut={() => authAdapter?.signOut() ?? Promise.resolve()}
        runtimeConnectionState={runtimeState.connectionState}
        visible={accountVisible}
        onClose={() => {
          setAccountVisible(false);
          // Re-read so the Mac setup banner reflects a newly registered Desktop Client.
          refreshAccountState();
        }}
      />
    </>
  );
}
