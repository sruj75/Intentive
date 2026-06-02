/** Identity Gate route — thin shell; renders the `auth` domain's screen. */
import { IdentityGateStub } from "../../src/domains/auth/ui/identity-gate-stub";

export default function IdentityRoute(): React.JSX.Element {
  return <IdentityGateStub />;
}
