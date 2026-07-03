/**
 * Acquisition Source — the "How did you find us?" step of the Onboarding funnel
 * (name → acquisition source → grant permissions). A pure presentational step:
 * the user picks one option, and Continue calls the injected `onNext` to advance
 * locally within the funnel. It writes nothing to Launch State — only the
 * funnel's last step completes the gate (via `setOnboarding`).
 *
 * TODO(polish): send the chosen source to an acquisition-analytics sink; for the
 * scaffold the selection advances the funnel without being recorded anywhere.
 */
import { useState } from "react";
import { StyleSheet } from "react-native";

import {
  ONBOARDING_ICONS,
  OnboardingAction,
  OnboardingChoiceList,
  OnboardingScreen,
  OnboardingTextInput,
  OnboardingTitle,
  type OnboardingChoice,
} from "../../../design/onboarding";

const SOURCES = [
  { id: "tiktok", label: "TikTok", icon: "sf:music.note" },
  { id: "youtube", label: "YouTube", icon: ONBOARDING_ICONS.youtube, iconTintColor: null },
  { id: "instagram", label: "Instagram", icon: ONBOARDING_ICONS.instagram, iconTintColor: null },
  { id: "x-twitter", label: "X (Twitter)", icon: ONBOARDING_ICONS.x },
  { id: "reddit", label: "Reddit", icon: "sf:bubble.left.and.bubble.right.fill" },
  { id: "linkedin", label: "LinkedIn", icon: ONBOARDING_ICONS.linkedin, iconTintColor: null },
  { id: "friend", label: "Friend / word of mouth", icon: "sf:person.2.fill" },
  { id: "coworker", label: "Coworker", icon: "sf:briefcase.fill" },
  { id: "event", label: "Event", icon: "sf:calendar" },
  { id: "app-store", label: "App Store", icon: "sf:apple.logo" },
  { id: "google", label: "Google Search", icon: ONBOARDING_ICONS.google, iconTintColor: null },
  { id: "other", label: "Other", icon: "sf:ellipsis" },
] as const satisfies readonly OnboardingChoice[];

export function AcquisitionSourceStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack?: () => void;
}): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const [otherSource, setOtherSource] = useState("");
  const canContinue = selected !== null && (selected !== "other" || otherSource.trim().length > 0);

  function onSelectSource(source: string): void {
    setSelected((current) => (current === source ? null : source));
    if (source !== "other") {
      setOtherSource("");
    }
  }

  return (
    <OnboardingScreen
      backdrop="source"
      backdropLabel="Person discovering Intentive in daily work"
      contentStyle={styles.content}
      progress={{ current: 3, total: 6 }}
      onBack={onBack}
      scroll={false}
      sheetMaxHeightRatio={0.66}
    >
      <OnboardingTitle style={styles.title}>How did you find us?</OnboardingTitle>
      <OnboardingChoiceList
        choices={SOURCES}
        maxHeight={250}
        scrollTestID="acquisition-source-scroll"
        selectedId={selected}
        onSelect={onSelectSource}
      />
      {selected === "other" ? (
        <OnboardingTextInput
          accessibilityLabel="Other source"
          autoCapitalize="sentences"
          placeholder="Please specify"
          returnKeyType="done"
          value={otherSource}
          onChangeText={setOtherSource}
          onSubmitEditing={() => canContinue && onNext()}
        />
      ) : null}
      <OnboardingAction label="Continue" disabled={!canContinue} onPress={onNext} />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  title: {
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center",
  },
});
