import type { NotificationsPort } from "../types/notifications-port";
import type { RegisterDeviceDeps } from "./register-device.js";
import { registerDevice } from "./register-device.js";

export interface PushRegistrationDeps extends RegisterDeviceDeps {
  readonly notifications: NotificationsPort;
  readonly getDeviceFingerprint: () => Promise<string>;
  readonly onError?: (error: unknown) => void;
}

export async function registerForPush(deps: PushRegistrationDeps): Promise<boolean> {
  try {
    const permission = await deps.notifications.requestPermission();
    if (permission !== "granted") return false;

    const expoPushToken = await deps.notifications.getExpoPushToken();
    if (expoPushToken === null) return false;

    const deviceFingerprint = await deps.getDeviceFingerprint();
    const registration = await registerDevice(deps, { deviceFingerprint, expoPushToken });
    return registration !== null;
  } catch (error) {
    deps.onError?.(error);
    return false;
  }
}
