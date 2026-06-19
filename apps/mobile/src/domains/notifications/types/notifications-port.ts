export interface NotificationsPort {
  requestPermission(): Promise<"granted" | "denied">;
  getExpoPushToken(): Promise<string | null>;
}
