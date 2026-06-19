import type { NotificationsPort } from "../types/notifications-port";
import type { RegisterDeviceDeps } from "./register-device.js";
import { registerDevice } from "./register-device.js";

export interface PushRegistrationDeps extends RegisterDeviceDeps {
  readonly notifications: NotificationsPort;
  readonly getDeviceFingerprint: () => Promise<string>;
  readonly onError?: (error: unknown) => void;
}

export async function registerForPush(deps: PushRegistrationDeps): Promise<void> {
  try {
    const permission = await deps.notifications.requestPermission();
    if (permission !== "granted") return;

    const expoPushToken = await deps.notifications.getExpoPushToken();
    if (expoPushToken === null) return;

    const deviceFingerprint = await deps.getDeviceFingerprint();
    await registerDevice(deps, { deviceFingerprint, expoPushToken });
  } catch (error) {
    deps.onError?.(error);
  }
}
