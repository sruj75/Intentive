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
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";
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
import { getOrCreateDeviceFingerprint } from "../domains/notifications/repo/device-fingerprint";
import { createExpoNotificationsPort } from "../domains/notifications/repo/expo-notifications-port";
import {
  registerForPush,
  type PushRegistrationResult,
} from "../domains/notifications/service/push-registration";
import type {
  NotificationsPort,
  NotificationsSubscription,
} from "../domains/notifications/types/notifications-port";

const PUSH_REGISTRATION_RETRY_DELAY_MS = 60_000;

type PushRegistration = () => Promise<PushRegistrationResult>;

export interface PushRegistrationEvents {
  subscribeToForeground(listener: () => void): NotificationsSubscription;
  subscribeToPushTokenChanges(listener: () => void): NotificationsSubscription;
}

export interface ChatEntryProps {
  readonly adapter?: RuntimeAdapter;
  readonly accountStateSource?: AccountStateSource;
  readonly controlPlaneBaseUrl?: string;
  readonly initialSafeAreaMetrics?: Metrics;
  readonly pushRegistration?: PushRegistration;
  readonly pushRegistrationEvents?: PushRegistrationEvents;
}

export function ChatEntry({
  adapter: injectedAdapter,
  accountStateSource: injectedAccountStateSource,
  controlPlaneBaseUrl,
  initialSafeAreaMetrics,
  pushRegistration: injectedPushRegistration,
  pushRegistrationEvents: injectedPushRegistrationEvents,
}: ChatEntryProps = {}): React.JSX.Element {
  const authAdapter = useOptionalAuthAdapter();
  const [accountVisible, setAccountVisible] = useState(false);
  const didRegisterForPush = useRef(false);
  const pushRegistrationInFlight = useRef(false);
  const pendingPushRegistrationAttempt = useRef(false);
  const pendingPushRegistrationReset = useRef(false);
  const lastPushRegistrationResult = useRef<PushRegistrationResult | null>(null);
  const [pushRegistrationAttempt, setPushRegistrationAttempt] = useState(0);
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
  const notifications = useMemo<NotificationsPort | null>(() => {
    if (injectedPushRegistration) return null;
    if (!authAdapter || baseUrl.trim().length === 0) return null;
    return createExpoNotificationsPort();
  }, [authAdapter, baseUrl, injectedPushRegistration]);
  const pushRegistration = useMemo(() => {
    if (injectedPushRegistration) return injectedPushRegistration;
    if (!authAdapter || baseUrl.trim().length === 0 || !notifications) return null;

    return () =>
      registerForPush({
        baseUrl,
        getUserJwt: () => authAdapter.getUserJwt(),
        fetch: (url, init) => globalThis.fetch(url, init),
        notifications,
        getDeviceFingerprint: getOrCreateDeviceFingerprint,
        onError: (error) => console.warn("Push registration failed", error),
      });
  }, [authAdapter, baseUrl, injectedPushRegistration, notifications]);
  const pushRegistrationEvents = useMemo<PushRegistrationEvents | null>(() => {
    if (injectedPushRegistrationEvents) return injectedPushRegistrationEvents;
    if (!notifications) return null;

    return {
      subscribeToForeground(listener) {
        return AppState.addEventListener("change", (state: AppStateStatus) => {
          if (state === "active") listener();
        });
      },
      subscribeToPushTokenChanges(listener) {
        return notifications.subscribeToPushTokenChanges(listener);
      },
    };
  }, [injectedPushRegistrationEvents, notifications]);
  const requestPushRegistrationAttempt = useCallback((resetSuccessfulRegistration = false) => {
    if (resetSuccessfulRegistration) didRegisterForPush.current = false;
    if (pushRegistrationInFlight.current) {
      pendingPushRegistrationAttempt.current = true;
      pendingPushRegistrationReset.current =
        pendingPushRegistrationReset.current || resetSuccessfulRegistration;
      return;
    }

    setPushRegistrationAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (!pushRegistration || didRegisterForPush.current || pushRegistrationInFlight.current) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    pushRegistrationInFlight.current = true;

    void pushRegistration()
      .then((result) => {
        if (cancelled) return;
        lastPushRegistrationResult.current = result;
        if (result.status === "registered") {
          didRegisterForPush.current = true;
          return;
        }

        if (result.status === "terminal") return;

        retryTimer = setTimeout(() => {
          setPushRegistrationAttempt((attempt) => attempt + 1);
        }, PUSH_REGISTRATION_RETRY_DELAY_MS);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Push registration failed", error);
        lastPushRegistrationResult.current = {
          status: "retryable",
          reason: "registration_failed",
        };
        retryTimer = setTimeout(() => {
          requestPushRegistrationAttempt();
        }, PUSH_REGISTRATION_RETRY_DELAY_MS);
      })
      .finally(() => {
        if (!cancelled) {
          pushRegistrationInFlight.current = false;
          if (pendingPushRegistrationAttempt.current) {
            const resetSuccessfulRegistration = pendingPushRegistrationReset.current;
            pendingPushRegistrationAttempt.current = false;
            pendingPushRegistrationReset.current = false;
            requestPushRegistrationAttempt(resetSuccessfulRegistration);
          }
        }
      });

    return () => {
      cancelled = true;
      pushRegistrationInFlight.current = false;
      pendingPushRegistrationAttempt.current = false;
      pendingPushRegistrationReset.current = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [pushRegistration, pushRegistrationAttempt, requestPushRegistrationAttempt]);

  useEffect(() => {
    if (!pushRegistrationEvents) return;

    const foregroundSubscription = pushRegistrationEvents.subscribeToForeground(() => {
      const lastResult = lastPushRegistrationResult.current;
      if (lastResult?.status === "terminal" && lastResult.reason !== "permission_denied") return;

      requestPushRegistrationAttempt(lastResult?.status === "registered");
    });
    const pushTokenSubscription = pushRegistrationEvents.subscribeToPushTokenChanges(() => {
      requestPushRegistrationAttempt(true);
    });

    return () => {
      foregroundSubscription.remove();
      pushTokenSubscription.remove();
    };
  }, [pushRegistrationEvents, requestPushRegistrationAttempt]);

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
