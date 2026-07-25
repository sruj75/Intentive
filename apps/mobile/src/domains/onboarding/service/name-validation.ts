import { onboardingContent } from "../config/content.js";

export type NameValidationResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string };

export function validateFullName(value: string): NameValidationResult {
  const normalized = value.trim().split(/\s+/).filter(Boolean).join(" ");
  if (normalized.split(" ").filter(Boolean).length < 2) {
    return { ok: false, error: onboardingContent.name.error };
  }
  return { ok: true, value: normalized };
}
