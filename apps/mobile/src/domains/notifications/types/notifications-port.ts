export class NotificationsConfigurationError extends Error {
  override readonly name = "NotificationsConfigurationError";
}

export interface NotificationsPort {
  requestPermission(): Promise<"granted" | "denied">;
  getExpoPushToken(): Promise<string | null>;
}
