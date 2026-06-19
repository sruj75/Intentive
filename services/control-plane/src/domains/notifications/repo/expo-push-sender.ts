import { Expo } from "expo-server-sdk";

export interface ExpoPushMessage {
  to: string;
  body: string;
  data?: Record<string, unknown>;
}

export type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; token: string; error?: string };

export type ExpoPushReceipt = { status: "ok" } | { status: "error"; error?: string };

export interface ExpoPushSender {
  send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>>;
}

export function createExpoPushSender(config: { accessToken?: string }): ExpoPushSender {
  const expo = new Expo(config.accessToken ? { accessToken: config.accessToken } : undefined);

  return {
    async send(messages) {
      const tickets: ExpoPushTicket[] = [];
      let offset = 0;

      for (const chunk of expo.chunkPushNotifications(messages)) {
        const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
        for (let i = 0; i < chunkTickets.length; i += 1) {
          const raw = chunkTickets[i];
          const token = messages[offset + i]?.to ?? "";
          if (raw?.status === "ok") {
            tickets.push({ status: "ok", id: raw.id });
          } else {
            tickets.push({
              status: "error",
              token,
              error: expoErrorCode(raw),
            });
          }
        }
        offset += chunk.length;
      }

      return tickets;
    },

    async getReceipts(ticketIds) {
      const receipts: Record<string, ExpoPushReceipt> = {};

      for (const chunk of expo.chunkPushNotificationReceiptIds(ticketIds)) {
        const chunkReceipts = await expo.getPushNotificationReceiptsAsync(chunk);
        for (const [ticketId, receipt] of Object.entries(chunkReceipts)) {
          receipts[ticketId] =
            receipt.status === "ok"
              ? { status: "ok" }
              : { status: "error", error: expoErrorCode(receipt) };
        }
      }

      return receipts;
    },
  };
}

function expoErrorCode(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const details = "details" in raw ? raw.details : undefined;
  if (details && typeof details === "object" && "error" in details) {
    return typeof details.error === "string" ? details.error : undefined;
  }
  if ("message" in raw) {
    return typeof raw.message === "string" ? raw.message : undefined;
  }
  return undefined;
}
