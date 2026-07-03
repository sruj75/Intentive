/**
 * Sibling Client Invitation — the consent-done-but-no-Mac gate (#21). A
 * skippable, capability-honest invitation to set up the Desktop Client so the
 * companion gets fuller context. Its only first-party action is "Not now",
 * which writes `siblingInvitation: "skipped"` into Launch State via the store's
 * `setSiblingInvitation` mutator (the seam #18 left); the resolver/root layout
 * owns the Launch Route — this gate never navigates itself.
 *
 * The phone cannot connect the Mac, so it never writes `completed`: a real
 * `completed` is server-observed (the Mac registers via #27 and `GET /me`
 * reports it, #26). The `__DEV__`-only button exercises that path without a
 * backend (per ADR 0012's dev-affordance pattern); it never ships. Guidance is
 * static — no link, QR, email handoff, or pairing (that is #27). Copy is
 * capability-honest: it describes what connecting the Mac *would* improve, never
 * claiming the companion already has Mac context. A "required/blocking" variant
 * is deferred to in-chat contextual prompts (#41). See ADR 0014.
 */
import { StyleSheet, View } from "react-native";

import {
  OnboardingAction,
  OnboardingBody,
  OnboardingInfoRow,
  OnboardingScreen,
  OnboardingTitle,
} from "../../../design/onboarding";
import { useLaunchState } from "../../../providers/launch-state";

export function SiblingInvitation(): React.JSX.Element {
  const { setSiblingInvitation } = useLaunchState();

  return (
    <OnboardingScreen
      backdrop="mac"
      backdropLabel="Intentive Mac setup for fuller companion context"
      contentStyle={styles.content}
      progress={{ current: 5, total: 6 }}
      sheetMaxHeightRatio={0.66}
    >
      <OnboardingTitle>Set up Intentive on your Mac</OnboardingTitle>
      <OnboardingBody>
        Intentive on your Mac gives your companion fuller context — it&apos;s optional, and chat
        works on your phone without it.
      </OnboardingBody>

      <View style={styles.points}>
        <OnboardingInfoRow
          marker="M"
          title="Fuller context"
          body="When Intentive runs on your Mac, it can see how you work, so your companion picks up on more."
        />
        <OnboardingInfoRow
          marker="F"
          title="Better follow-ups"
          body="With that context, check-ins and nudges land closer to what actually matters."
        />
      </View>

      <OnboardingBody style={styles.guidance}>
        Download Intentive for Mac at intentive.app.
      </OnboardingBody>

      <OnboardingAction label="Not now" onPress={() => setSiblingInvitation("skipped")} />

      {__DEV__ ? (
        <OnboardingAction
          variant="secondary"
          label="Mark Mac connected (dev)"
          onPress={() => setSiblingInvitation("completed")}
        />
      ) : null}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 15 },
  points: { alignSelf: "stretch", gap: 9 },
  guidance: { fontSize: 13, lineHeight: 19, textAlign: "center" },
});
