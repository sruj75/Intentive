import { CLIENT_KINDS } from "@intentive/domain-types";
import { z } from "zod";

// Derived from the canonical tuple in @intentive/domain-types — the single
// source of truth for Client Kinds across the wire packages.
export const ClientKind = z.enum(CLIENT_KINDS);
export type ClientKind = z.infer<typeof ClientKind>;

export const PreChatGateKind = z.enum([
  "identity",
  "consent_primer",
  "capture_permission_setup",
  "sibling_client_invitation",
]);
export type PreChatGateKind = z.infer<typeof PreChatGateKind>;
