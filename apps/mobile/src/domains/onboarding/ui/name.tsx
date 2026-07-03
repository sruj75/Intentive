/**
 * Name — the first step of the Onboarding funnel (name → acquisition source →
 * grant permissions), the one collapsed gate for the one-time personalization
 * sequence (see apps/mobile/docs/adr/0019-*). A pure presentational step: it
 * collects a display name and calls the injected `onNext` to advance locally
 * within the funnel. It writes nothing to Launch State — only the funnel's last
 * step completes the gate (via `setOnboarding`). The name value is intentionally
 * not modeled in Launch State.
 *
 * TODO(polish): persist the entered name to the Control Plane (packages/api-contract);
 * for the scaffold it advances the funnel without being stored anywhere.
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  OnboardingAction,
  OnboardingScreen,
  OnboardingTextInput,
  OnboardingTitle,
} from "../../../design/onboarding";

export function NameStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack?: () => void;
}): React.JSX.Element {
  const [name, setName] = useState("");
  const canContinue = name.trim().length > 0;

  return (
    <OnboardingScreen
      backdrop="name"
      backdropLabel="Person introducing themself to Intentive"
      progress={{ current: 2, total: 6 }}
      onBack={onBack}
      sheetMaxHeightRatio={0.48}
    >
      <View style={styles.body}>
        <OnboardingTitle style={styles.title}>Want to go by something else?</OnboardingTitle>
        <OnboardingTextInput
          accessibilityLabel="Your name"
          value={name}
          onChangeText={setName}
          placeholder="Enter your name"
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => canContinue && onNext()}
        />
      </View>

      <OnboardingAction label="Continue" disabled={!canContinue} onPress={onNext} />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 28 },
  title: {
    fontSize: 22,
    lineHeight: 27,
    textAlign: "center",
  },
});
