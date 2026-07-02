/**
 * Identity Gate route — thin shell for the signed-out zone. It shows the
 * pre-auth Get Started landing first, then steps forward LOCALLY to the sign-in
 * options (`IdentityGate`). Both live in the `auth` domain, so this is a
 * single-zone composition, not a cross-gate navigation; the resolver keeps the
 * whole zone on SIGNED_OUT until sign-in succeeds.
 */
import { useState } from "react";

import { GetStarted } from "../../src/domains/auth/ui/get-started";
import { IdentityGate } from "../../src/domains/auth/ui/identity-gate";

export default function IdentityRoute(): React.JSX.Element {
  const [showSignIn, setShowSignIn] = useState(false);
  return showSignIn ? <IdentityGate /> : <GetStarted onContinue={() => setShowSignIn(true)} />;
}
