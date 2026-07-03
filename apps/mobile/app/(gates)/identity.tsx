/**
 * Identity Gate route — thin shell for the signed-out zone. It shows the
 * pre-auth Get Started landing first, then steps forward LOCALLY to the sign-in
 * options (`IdentityGate`). Both live in the `auth` domain, so this is a
 * single-zone composition, not a cross-gate navigation; the resolver keeps the
 * whole zone on SIGNED_OUT until sign-in succeeds.
 */
import { useEffect, useRef, useState } from "react";

import { GetStarted } from "../../src/domains/auth/ui/get-started";
import { IdentityGate } from "../../src/domains/auth/ui/identity-gate";
import { useLaunchState } from "../../src/providers/launch-state";

export default function IdentityRoute(): React.JSX.Element {
  const { state } = useLaunchState();
  const [showSignIn, setShowSignIn] = useState(false);
  const wasSignedIn = useRef(false);

  // The Get Started → sign-in step is local to this signed-out route, so it
  // survives if the router keeps the route mounted across a sign-out (a replace
  // back to the same zone is a no-op). A user who returns signed-out after being
  // signed in must land on the Get Started landing first, so reset the local
  // step on an actual sign-out — a `true → false` transition. We must NOT reset
  // on the cold-launch hydration `null → false`, or a user who taps Get Started
  // before hydration resolves gets bounced back to the landing.
  useEffect(() => {
    if (wasSignedIn.current && state.signedIn === false) setShowSignIn(false);
    if (state.signedIn !== null) wasSignedIn.current = state.signedIn;
  }, [state.signedIn]);

  return showSignIn ? <IdentityGate /> : <GetStarted onContinue={() => setShowSignIn(true)} />;
}
