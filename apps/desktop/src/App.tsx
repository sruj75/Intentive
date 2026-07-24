import { useMemo } from "react";
import Onboarding from "./domains/onboarding/ui/Onboarding";
import CapturePermissionSetup from "./domains/onboarding/ui/CapturePermissionSetup";
import AccountSettingsSurface from "./domains/account/ui/AccountSettingsSurface";
import "./App.css";

type Surface = "settings" | "sign-in" | "onboarding" | "permission-setup";
type AuthSurface = Exclude<Surface, "onboarding" | "permission-setup">;

function resolveSurface(): Surface {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("surface");
  if (value === "sign-in") return "sign-in";
  if (value === "onboarding") return "onboarding";
  if (value === "permission-setup") return "permission-setup";
  return "settings";
}

function App() {
  const surface = useMemo(resolveSurface, []);

  if (surface === "onboarding") {
    return <Onboarding />;
  }
  if (surface === "permission-setup") {
    return <CapturePermissionSetup />;
  }

  return <AccountSettingsSurface surface={surface as AuthSurface} />;
}

export default App;
