import type { PostInternalNotificationsCheckReceiptsResponse } from "@intentive/api-contract";

import type { ExpoPushSender } from "../repo/expo-push-sender.js";
import type {
  NotificationTicketRecordInput,
  NotificationTicketsRepo,
} from "../repo/notification-tickets.js";

export interface ExpoPushTarget {
  deviceId: string;
  expoPushToken: string;
}

export interface NotificationsDevicesPort {
  listExpoPushTargetsForUser(userId: string): Promise<ExpoPushTarget[]>;
  clearExpoPushToken(deviceId: string, expoPushToken: string): Promise<void>;
}

export interface PushToUserInput {
  userId: string;
  previewText: string;
  messageId: string;
}

export interface NotificationsService {
  pushToUser(input: PushToUserInput): Promise<{ delivered: boolean; deviceCount: number }>;
  checkPendingReceipts(input?: {
    limit?: number;
  }): Promise<PostInternalNotificationsCheckReceiptsResponse>;
}

export function createNotificationsService(deps: {
  devices: NotificationsDevicesPort;
  sender: ExpoPushSender;
  tickets: NotificationTicketsRepo;
}): NotificationsService {
  return {
    async pushToUser({ userId, previewText, messageId }) {
      const targets = await deps.devices.listExpoPushTargetsForUser(userId);
      if (targets.length === 0) return { delivered: false, deviceCount: 0 };

      const tickets = await deps.sender.send(
        targets.map((target) => ({
          to: target.expoPushToken,
          body: previewText,
          data: { message_id: messageId },
        })),
      );

      const accepted: NotificationTicketRecordInput[] = [];
      for (let i = 0; i < tickets.length; i += 1) {
        const ticket = tickets[i];
        const target = targets[i];
        if (!ticket || !target) continue;

        if (ticket.status === "ok") {
          accepted.push({
            ticketId: ticket.id,
            deviceId: target.deviceId,
            expoPushToken: target.expoPushToken,
            messageId,
          });
          continue;
        }

        if (isImmediateDeadTokenError(ticket.error)) {
          await deps.devices.clearExpoPushToken(target.deviceId, target.expoPushToken);
        }
      }

      await deps.tickets.recordTickets(accepted);
      return { delivered: accepted.length > 0, deviceCount: targets.length };
    },

    async checkPendingReceipts({ limit } = {}) {
      const unchecked = await deps.tickets.listUnchecked(limit);
      if (unchecked.length === 0) return { checked: 0, cleared: 0 };

      const receipts = await deps.sender.getReceipts(unchecked.map((ticket) => ticket.ticketId));
      let cleared = 0;

      for (const ticket of unchecked) {
        const receipt = receipts[ticket.ticketId];
        if (receipt?.status === "error" && receipt.error === "DeviceNotRegistered") {
          await deps.devices.clearExpoPushToken(ticket.deviceId, ticket.expoPushToken);
          cleared += 1;
        }
      }

      await deps.tickets.markChecked(unchecked.map((ticket) => ticket.id));
      return { checked: unchecked.length, cleared };
    },
  };
}

function isImmediateDeadTokenError(error: string | undefined): boolean {
  return error === "DeviceNotRegistered" || error === "InvalidCredentials";
}
