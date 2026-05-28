import { z } from "zod";

export const ClientKind = z.enum(["mobile", "desktop", "android"]);
export type ClientKind = z.infer<typeof ClientKind>;

export const PreChatGateKind = z.enum([
  "identity",
  "consent_primer",
  "capture_permission_setup",
  "sibling_client_invitation",
]);
export type PreChatGateKind = z.infer<typeof PreChatGateKind>;
