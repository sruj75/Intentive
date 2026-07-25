import { GestureHandlerRootView } from "react-native-gesture-handler";

import { getPlatform } from "../src/entrypoints/platform";
import { RootEntry } from "../src/entrypoints/root-entry";
import { ProfileProvider } from "../src/providers/profile/profile-provider";
import { wrapRoot } from "../src/providers/telemetry";

// Build the composition root at module load: constructing it runs `initTelemetry`,
// so `wrapRoot` below sees a ready Sentry when a DSN is configured (ADR 0029). A
// blank DSN keeps telemetry the no-op and `wrapRoot` returns the component as-is.
const platform = getPlatform();

function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProfileProvider>
        <RootEntry platform={platform} />
      </ProfileProvider>
    </GestureHandlerRootView>
  );
}

// Sentry's error boundary + performance wrapper when a DSN is configured; the
// identity function otherwise (ADR 0029).
export default wrapRoot(RootLayout);
