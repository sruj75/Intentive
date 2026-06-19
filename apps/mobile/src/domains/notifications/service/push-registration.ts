import {
  NotificationsConfigurationError,
  type NotificationsPort,
} from "../types/notifications-port.js";
import type { RegisterDeviceDeps } from "./register-device.js";
import { registerDevice } from "./register-device.js";

export type PushRegistrationResult =
  | { status: "registered" }
  | { status: "retryable"; reason: "registration_unavailable" | "registration_failed" }
  | {
      status: "terminal";
      reason:
        | "permission_denied"
        | "notifications_unavailable"
        | "expo_token_unavailable"
        | "configuration_error";
    };

export interface PushRegistrationDeps extends RegisterDeviceDeps {
  readonly notifications: NotificationsPort;
  readonly getDeviceFingerprint: () => Promise<string>;
  readonly onError?: (error: unknown) => void;
}

export async function registerForPush(deps: PushRegistrationDeps): Promise<PushRegistrationResult> {
  try {
    const permission = await deps.notifications.requestPermission();
    if (permission === "unavailable") {
      return { status: "terminal", reason: "notifications_unavailable" };
    }
    if (permission !== "granted") return { status: "terminal", reason: "permission_denied" };

    const expoPushToken = await deps.notifications.getExpoPushToken();
    if (expoPushToken === null) return { status: "terminal", reason: "expo_token_unavailable" };

    const deviceFingerprint = await deps.getDeviceFingerprint();
    const registration = await registerDevice(deps, { deviceFingerprint, expoPushToken });
    return registration === null
      ? { status: "retryable", reason: "registration_unavailable" }
      : { status: "registered" };
  } catch (error) {
    deps.onError?.(error);
    return error instanceof NotificationsConfigurationError
      ? { status: "terminal", reason: "configuration_error" }
      : { status: "retryable", reason: "registration_failed" };
  }
}
