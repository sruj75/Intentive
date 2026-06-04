/** Identity Gate route — thin shell; renders the `auth` domain's screen. */
import { IdentityGate } from "../../src/domains/auth/ui/identity-gate";

export default function IdentityRoute(): React.JSX.Element {
  return <IdentityGate />;
}
