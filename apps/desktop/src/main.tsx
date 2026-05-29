import { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
const IntentiveAuthProvider = lazy(() => import("./domains/auth/ui/IntentiveAuthProvider"));

function isOnboardingSurface(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("surface") === "onboarding";
}

const app = <App />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Suspense fallback={app}>
    {isOnboardingSurface() ? (
      app
    ) : (
      <IntentiveAuthProvider>
        {app}
      </IntentiveAuthProvider>
    )}
  </Suspense>,
);
