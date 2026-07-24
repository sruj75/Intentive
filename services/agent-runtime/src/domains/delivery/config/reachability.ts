import type { ClientKind } from "@intentive/protocol";

export const CHAT_CAPABLE_KINDS: ReadonlySet<ClientKind> = new Set(["mobile"]);

export function isChatCapable(kind: ClientKind): boolean {
  return CHAT_CAPABLE_KINDS.has(kind);
}
