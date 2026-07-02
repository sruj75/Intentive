/**
 * Onboarding Funnel — the one collapsed gate for the one-time personalization
 * sequence (name → acquisition source → grant permissions). These three steps
 * never independently re-trigger, so they are a single gate, not three (see
 * apps/mobile/docs/adr/0019-*). The funnel owns the LOCAL step state and steps
 * forward within itself; this stays below the resolver's granularity — the
 * resolver reports MISSING_ONBOARDING the whole time and never clobbers the
 * local navigation because the route zone (`/(onboarding)`) does not change.
 *
 * Only the funnel completes the gate: after the last step it writes
 * `onboarding: "completed"` via the store's `setOnboarding` mutator, and the
 * resolver/root layout then owns the Launch Route to the next zone. The child
 * steps write nothing and never navigate — they only call `onNext`.
 *
 * The notification ask is injected (`requestNotificationPermission`) and threaded
 * to the Grant Permissions step, so this domain imports nothing notification-related.
 */
import { useState } from "react";

import { useLaunchState } from "../../../providers/launch-state";
import { AcquisitionSourceStep } from "./acquisition-source";
import { GrantPermissionsStep, type RequestNotificationPermission } from "./grant-permissions";
import { NameStep } from "./name";

type FunnelStep = "name" | "source" | "permissions";

export function OnboardingFunnel({
  requestNotificationPermission,
}: {
  requestNotificationPermission: RequestNotificationPermission;
}): React.JSX.Element {
  const { setOnboarding } = useLaunchState();
  const [step, setStep] = useState<FunnelStep>("name");

  switch (step) {
    case "name":
      return <NameStep onNext={() => setStep("source")} />;
    case "source":
      return <AcquisitionSourceStep onNext={() => setStep("permissions")} />;
    case "permissions":
      return (
        <GrantPermissionsStep
          requestNotificationPermission={requestNotificationPermission}
          onNext={() => setOnboarding("completed")}
        />
      );
  }
}
