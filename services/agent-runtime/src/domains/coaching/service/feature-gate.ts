import type { FlagClient } from "@intentive/providers/flags";

const DESKTOP_COACHING_FLAG = "desktop_coaching_v1";

export interface CoachingFeatureGate {
  isEnabled(userId: string): boolean;
}

/**
 * Founder Preview gate. The remote/default provider flag is necessary but not
 * sufficient: a User must also be explicitly present in the boot-time allowlist.
 */
export function createCoachingFeatureGate(params: {
  readonly flags: FlagClient;
  readonly founderUserIds: readonly string[];
}): CoachingFeatureGate {
  const founders = new Set(params.founderUserIds);
  return {
    isEnabled(userId) {
      return founders.has(userId) && params.flags.isEnabled(DESKTOP_COACHING_FLAG, userId);
    },
  };
}
