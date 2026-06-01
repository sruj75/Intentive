import { Suspense, lazy, useMemo } from "react";
import Onboarding from "./domains/onboarding/ui/Onboarding";
import "./App.css";

type Surface = "settings" | "sign-in" | "onboarding";
type AuthSurface = Exclude<Surface, "onboarding">;

const AccountSettingsSurface = lazy(() => import("./domains/account/ui/AccountSettingsSurface"));

function resolveSurface(): Surface {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("surface");
  if (value === "sign-in") return "sign-in";
  if (value === "onboarding") return "onboarding";
  return "settings";
}

function App() {
  const surface = useMemo(resolveSurface, []);

  if (surface === "onboarding") {
    return <Onboarding />;
  }

  return (
    <Suspense fallback={<main className="settings-shell" />}>
      <AccountSettingsSurface surface={surface as AuthSurface} />
    </Suspense>
  );
}

export default App;
