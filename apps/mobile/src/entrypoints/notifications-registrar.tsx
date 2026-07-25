import { useEffect, useRef } from "react";

import type { PushRegistrationResult } from "../domains/notifications/service/push-registration";

/**
 * Runs push registration once per chat-ready signed-in period, as an effect,
 * from the persistent root layout (above both navigation zones) so navigation/re-mounts
 * never re-arm it within one signed-in period (ADR 0028 / 0030). Authentication
 * alone is insufficient: first-time users become eligible only after the
 * contextual Permissions Intro action completes onboarding. A
 * `false/null → true` eligibility transition attempts registration exactly
 * once; staying ready through rerenders/navigation does not; a `→ false`
 * logout resets the guard so a later signed-in period registers correctly.
 * With no injected `register` (the
 * offline default the `experience-journey` invariant test drives) it makes zero
 * calls. The real runner requests permission and POSTs to `/devices/register`,
 * resolving cleanly on denial or a missing token (denial and retryable failures
 * stay nonblocking and never re-prompt within one signed-in period).
 */
export function NotificationsRegistrar({
  registrationReady = false,
  register,
}: {
  readonly registrationReady?: boolean;
  readonly register?: () => Promise<PushRegistrationResult>;
} = {}): null {
  const lastRegistrationReadyRef = useRef<boolean | null>(null);
  useEffect(() => {
    const isReady = registrationReady === true;
    const previous = lastRegistrationReadyRef.current;
    lastRegistrationReadyRef.current = isReady;
    if (!isReady || !register) return;
    // Only a false/null → true transition attempts registration; staying signed
    // in (previous === true) is a no-op for this period.
    if (previous === true) return;
    void register();
  }, [registrationReady, register]);
  return null;
}
