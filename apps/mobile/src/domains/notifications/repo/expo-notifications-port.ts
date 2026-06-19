import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { resolveExpoProjectId } from "../config/expo-project-id";
import {
  NotificationsConfigurationError,
  type NotificationsPort,
} from "../types/notifications-port.js";

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
      const projectId = resolveExpoProjectId(Constants);
      if (!projectId) {
        throw new NotificationsConfigurationError(
          "Expo project ID is required to fetch an Expo Push Token",
        );
      }

      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      return token.data;
    },
  };
}
