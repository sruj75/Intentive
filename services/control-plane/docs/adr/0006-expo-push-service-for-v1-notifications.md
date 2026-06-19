# Expo Push Service for v1 Notifications

Status: accepted

v1 Mobile uses Expo, so the Control Plane stores **Expo Push Tokens** and sends through Expo Push Service instead of calling APNs or FCM directly. This keeps notification delivery behind the Control Plane boundary while following Expo's standard server pattern: send pushes, store ticket ids, check receipts later, and clear `expo_push_token` when Expo reports `DeviceNotRegistered`.

## Considered Options

- **Direct APNs/FCM.** Rejected for v1 because Mobile is Expo-based and direct provider delivery would add credential and platform-specific machinery before the product needs it.
- **Store Expo tokens in `apns_token`.** Rejected because the field would lie about what it contains and future work would likely build against the wrong provider model.
- **Delete device rows on dead tokens.** Rejected because a dead notification route does not prove the device identity is gone; dead-token cleanup clears `expo_push_token` and keeps the row.

## Consequences

- `POST /devices/register` should accept and persist `expo_push_token`.
- Because production Control Plane migrations are not applied until #50, #49 should rewrite the existing v1 device schema/contract from `apns_token`/`fcm_token` to `expo_push_token` instead of adding a corrective migration that preserves the wrong pre-production shape.
- `POST /internal/notifications/push` reports immediate Expo acceptance: `delivered: true` means at least one Expo push ticket was accepted, not that the user definitely saw the notification.
- `device_count` means the number of Expo Push Tokens attempted.
- Receipt checking belongs to the Control Plane and is triggered by a protected maintenance path, not by the Agent Runtime.
- Receipt checking should run in bounded batches through a protected maintenance endpoint, with an optional `limit` and a response such as `{ checked, cleared }`; it must not try to drain every pending ticket in one request.
