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
  OnboardingAction,
  OnboardingChoiceList,
  OnboardingScreen,
  OnboardingTextInput,
  OnboardingTitle,
  type OnboardingChoice,
} from "../../../design/onboarding";

// One uniform, muted, monochrome glyph language: FA6 brand marks for the
// platforms, FA6 solid marks for the generic sources — mirroring OMI. No
// color-PNG logos and no SF Symbols in the list (see apps/mobile/docs/adr/0021-*).
const SOURCES = [
  { id: "tiktok", label: "TikTok", glyph: { set: "fa6-brand", name: "tiktok" } },
  { id: "youtube", label: "YouTube", glyph: { set: "fa6-brand", name: "youtube" } },
  { id: "instagram", label: "Instagram", glyph: { set: "fa6-brand", name: "instagram" } },
  { id: "x-twitter", label: "X (Twitter)", glyph: { set: "fa6-brand", name: "x-twitter" } },
  { id: "reddit", label: "Reddit", glyph: { set: "fa6-brand", name: "reddit" } },
  { id: "linkedin", label: "LinkedIn", glyph: { set: "fa6-brand", name: "linkedin" } },
  {
    id: "friend",
    label: "Friend / word of mouth",
    glyph: { set: "fa6-solid", name: "user-group" },
  },
  { id: "coworker", label: "Coworker", glyph: { set: "fa6-solid", name: "briefcase" } },
  { id: "event", label: "Event", glyph: { set: "fa6-solid", name: "calendar-day" } },
  { id: "app-store", label: "App Store", glyph: { set: "fa6-brand", name: "apple" } },
  { id: "google", label: "Google Search", glyph: { set: "fa6-brand", name: "google" } },
  { id: "other", label: "Other", glyph: { set: "fa6-solid", name: "ellipsis" } },
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
    // radio semantics: tapping a row selects it; re-tapping the chosen row is a
    // no-op, never a clear. Clearing would strand the user on a disabled Continue.
    setSelected(source);
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
