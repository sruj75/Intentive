/**
 * Grant Permissions — the last step of the Onboarding funnel (name → acquisition
 * source → grant permissions). omi-style and deliberately simple: it explains why
 * notifications help, and Continue fires the notification permission ask and then
 * advances — always, whatever the user answers in the OS prompt.
 *
 * The permission ask is INJECTED as `requestNotificationPermission`, not imported
 * from the `notifications` domain: onboarding importing notifications would be a
 * cross-domain import (architecture lint forbids it). The `(onboarding)` route —
 * a composition point, not layer-linted — wires the real `expo-notifications`
 * port; tests inject a fake. This step requests notifications only (no location).
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  OnboardingAction,
  OnboardingPermissionRow,
  OnboardingScreen,
  OnboardingTitle,
} from "../../../design/onboarding";

/** Minimal shape of the injected ask — declared locally to avoid a cross-domain
 * import of the notifications port. The outcome is ignored: Continue always advances. */
export type RequestNotificationPermission = () => Promise<unknown>;

export function GrantPermissionsStep({
  requestNotificationPermission,
  onNext,
  onBack,
}: {
  requestNotificationPermission: RequestNotificationPermission;
  onNext: () => void;
  onBack?: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [notificationsChecked, setNotificationsChecked] = useState(false);
  const [followUpsChecked, setFollowUpsChecked] = useState(false);

  async function onContinue(): Promise<void> {
    setBusy(true);
    try {
      // Fire the OS ask; the answer never blocks onboarding.
      await requestNotificationPermission();
    } catch {
      // A thrown ask must not strand the funnel — advance regardless.
    } finally {
      onNext();
    }
  }

  return (
    <OnboardingScreen
      backdrop="permissions"
      backdropLabel="Intentive permission setup for timely companion follow-ups"
      progress={{ current: 4, total: 6 }}
      onBack={onBack}
      scroll={false}
      sheetMaxHeightRatio={0.54}
    >
      <View style={styles.header}>
        <OnboardingTitle style={styles.title}>Grant permissions</OnboardingTitle>
      </View>

      <View style={styles.permissions}>
        <OnboardingPermissionRow
          checked={notificationsChecked}
          title="Notifications"
          body="Enable check-ins and follow-ups without opening the app."
          onPress={() => setNotificationsChecked((checked) => !checked)}
        />
        <OnboardingPermissionRow
          checked={followUpsChecked}
          title="Companion follow-ups"
          body="Let Intentive surface important reminders at the right time."
          onPress={() => setFollowUpsChecked((checked) => !checked)}
        />
      </View>

      {/* The scaffold only has a notification permission port today. Continue
          asks for that permission and advances regardless of the OS answer. */}
      <OnboardingAction
        label="Continue"
        busy={busy}
        disabled={busy}
        onPress={() => void onContinue()}
      />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 6 },
  permissions: { gap: 16 },
  title: {
    fontSize: 32,
    lineHeight: 38,
    textAlign: "center",
  },
});
