import ReactDOM from "react-dom/client";
import App from "./App";
import IntentiveAuthProvider from "./domains/auth/ui/IntentiveAuthProvider";

function isSetupSurface(): boolean {
  const params = new URLSearchParams(window.location.search);
  const surface = params.get("surface");
  return surface === "onboarding" || surface === "permission-setup";
}

const app = <App />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  isSetupSurface() ? app : <IntentiveAuthProvider>{app}</IntentiveAuthProvider>,
);
