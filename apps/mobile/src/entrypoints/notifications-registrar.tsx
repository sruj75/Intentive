import { useEffect, useRef } from "react";

import type { PushRegistrationResult } from "../domains/notifications/service/push-registration";

/**
 * Runs push registration once, as an effect, after the client is signed in. It
 * renders nothing — the `(main)` layout mounts it beside the chat Stack (ADR
 * 0028). With no injected `register` (the offline default the `experience-journey`
 * invariant test drives) it makes zero calls; the real runner requests permission
 * and POSTs to `/devices/register`, resolving cleanly on denial or a missing token.
 */
export function NotificationsRegistrar({
  signedIn = false,
  register,
}: {
  readonly signedIn?: boolean;
  readonly register?: () => Promise<PushRegistrationResult>;
} = {}): null {
  const attempted = useRef(false);
  useEffect(() => {
    if (!signedIn || !register || attempted.current) return;
    // One attempt per app session: permission is a terminal user decision and a
    // successful register is idempotent server-side, so we never re-prompt here.
    attempted.current = true;
    void register();
  }, [signedIn, register]);
  return null;
}
