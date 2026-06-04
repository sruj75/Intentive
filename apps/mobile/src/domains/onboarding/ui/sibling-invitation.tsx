/**
 * Sibling Client Invitation — the consent-done-but-no-Mac gate (#21). A
 * skippable, capability-honest invitation to set up the Desktop Client so the
 * companion gets fuller context. Its only first-party action is "Not now",
 * which writes `siblingInvitation: "skipped"` into Launch State via the store's
 * `setSiblingInvitation` mutator (the seam #18 left); the resolver/root layout
 * owns the redirect — this screen never navigates itself.
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
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useLaunchState } from "../../../providers/launch-state";

export function SiblingInvitation(): React.JSX.Element {
  const { setSiblingInvitation } = useLaunchState();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Set up Intentive on your Mac</Text>
      <Text style={styles.subtitle}>
        Intentive on your Mac gives your companion fuller context — it&apos;s optional, and chat
        works on your phone without it.
      </Text>

      <View style={styles.points}>
        <Benefit
          heading="Fuller context"
          body="When Intentive runs on your Mac, it can see how you work, so your companion picks up on more."
        />
        <Benefit
          heading="Better follow-ups"
          body="With that context, check-ins and nudges land closer to what actually matters."
        />
      </View>

      <Text style={styles.guidance}>Download Intentive for Mac at intentive.app.</Text>

      <Pressable
        accessibilityRole="button"
        style={styles.button}
        onPress={() => setSiblingInvitation("skipped")}
      >
        <Text style={styles.buttonText}>Not now</Text>
      </Pressable>

      {__DEV__ ? (
        <Pressable
          accessibilityRole="button"
          style={styles.devButton}
          onPress={() => setSiblingInvitation("completed")}
        >
          <Text style={styles.devButtonText}>Mark Mac connected (dev)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Benefit({ heading, body }: { heading: string; body: string }): React.JSX.Element {
  return (
    <View style={styles.point}>
      <Text style={styles.pointHeading}>{heading}</Text>
      <Text style={styles.pointBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: "600", textAlign: "center" },
  subtitle: { fontSize: 15, opacity: 0.6, textAlign: "center", marginBottom: 8 },
  points: { alignSelf: "stretch", gap: 16, marginBottom: 8 },
  point: { gap: 2 },
  pointHeading: { fontSize: 16, fontWeight: "600" },
  pointBody: { fontSize: 15, opacity: 0.7 },
  guidance: { fontSize: 14, opacity: 0.6, textAlign: "center", marginBottom: 8 },
  button: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#1f6feb",
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
  devButton: { paddingVertical: 12, paddingHorizontal: 24 },
  devButtonText: { color: "#1f6feb", fontSize: 14, fontWeight: "600" },
});
