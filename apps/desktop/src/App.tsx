import { useMemo } from "react";
import Onboarding from "./domains/onboarding/ui/Onboarding";
import AccountSettingsSurface from "./domains/account/ui/AccountSettingsSurface";
import "./App.css";

type Surface = "settings" | "sign-in" | "onboarding";
type AuthSurface = Exclude<Surface, "onboarding">;

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

  return <AccountSettingsSurface surface={surface as AuthSurface} />;
}

export default App;
