import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import type { NotificationsPort } from "../types/notifications-port";

export function createExpoNotificationsPort(): NotificationsPort {
  return {
    async requestPermission() {
      if (!Device.isDevice) return "denied";

      const existing = await Notifications.getPermissionsAsync();
      if (existing.status === "granted") return "granted";

      const requested = await Notifications.requestPermissionsAsync();
      return requested.status === "granted" ? "granted" : "denied";
    },

    async getExpoPushToken() {
      if (!Device.isDevice) return null;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const token = await Notifications.getExpoPushTokenAsync(
        typeof projectId === "string" ? { projectId } : undefined,
      );
      return token.data;
    },
  };
}
