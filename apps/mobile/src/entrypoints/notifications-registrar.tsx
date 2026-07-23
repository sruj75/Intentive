import { useEffect, useRef } from "react";

import type { PushRegistrationResult } from "../domains/notifications/service/push-registration";

/**
 * Runs push registration once per signed-in period, as an effect, from the
 * persistent root layout (above both navigation zones) so navigation/re-mounts
 * never re-arm it within one signed-in period (ADR 0028 / 0030). It renders
 * nothing. The `signedIn` transition drives registration: a `false/null → true`
 * transition attempts registration exactly once; staying signed in through
 * rerenders/navigation does not; a `→ false` logout resets the guard so a later
 * signed-in period registers correctly. With no injected `register` (the
 * offline default the `experience-journey` invariant test drives) it makes zero
 * calls. The real runner requests permission and POSTs to `/devices/register`,
 * resolving cleanly on denial or a missing token (denial and retryable failures
 * stay nonblocking and never re-prompt within one signed-in period).
 */
export function NotificationsRegistrar({
  signedIn = false,
  register,
}: {
  readonly signedIn?: boolean;
  readonly register?: () => Promise<PushRegistrationResult>;
} = {}): null {
  const lastSignedInRef = useRef<boolean | null>(null);
  useEffect(() => {
    const isSignedIn = signedIn === true;
    const previous = lastSignedInRef.current;
    lastSignedInRef.current = isSignedIn;
    if (!isSignedIn || !register) return;
    // Only a false/null → true transition attempts registration; staying signed
    // in (previous === true) is a no-op for this period.
    if (previous === true) return;
    void register();
  }, [signedIn, register]);
  return null;
}
