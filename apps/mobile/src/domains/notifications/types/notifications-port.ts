export class NotificationsConfigurationError extends Error {
  override readonly name = "NotificationsConfigurationError";
}

export interface NotificationsSubscription {
  remove(): void;
}

export interface NotificationsPort {
  requestPermission(): Promise<"granted" | "denied" | "unavailable">;
  getExpoPushToken(): Promise<string | null>;
  subscribeToPushTokenChanges(listener: () => void): NotificationsSubscription;
}
