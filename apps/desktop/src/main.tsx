import ReactDOM from "react-dom/client";
import App from "./App";
import IntentiveAuthProvider from "./domains/auth/ui/IntentiveAuthProvider";
import {
  ErrorBoundary,
  forwardUnhandledRejection,
  initObservability,
} from "./providers/observability";

initObservability();
window.addEventListener("unhandledrejection", (event) => {
  forwardUnhandledRejection(event.reason);
});

function isSetupSurface(): boolean {
  const params = new URLSearchParams(window.location.search);
  const surface = params.get("surface");
  return surface === "onboarding" || surface === "permission-setup";
}

const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  isSetupSurface() ? app : <IntentiveAuthProvider>{app}</IntentiveAuthProvider>,
);
