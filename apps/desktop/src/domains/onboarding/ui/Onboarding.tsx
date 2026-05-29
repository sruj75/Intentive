import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/// Step machine for the onboarding flow. Welcome is the cold-start view with
/// a Continue button; Downloading shows the live progress bar while
/// `start_model_download` runs; Done and Failed are terminal states the
/// backend signals via Tauri events.
type Step =
  | { kind: "welcome" }
  | { kind: "downloading"; percent: number; status: string }
  | { kind: "done" }
  | { kind: "failed"; message: string };

type ProgressPayload = { percent: number; status: string };

const EVENT_PROGRESS = "bundled-ollama:progress";
const EVENT_COMPLETE = "bundled-ollama:complete";
const EVENT_FAILED = "bundled-ollama:failed";

/// Onboarding surface (ADR-0018). Rendered when Intentive launches signed-in
/// but without the bundled model on disk. Drives the `start_model_download`
/// Tauri command and reflects the three events it emits.
export default function Onboarding() {
  const [step, setStep] = useState<Step>({ kind: "welcome" });
  // `useRef` to track the unlisten functions across renders so we can
  // detach handlers when the component unmounts. Tauri's `listen` returns a
  // Promise<UnlistenFn>; we collect resolved unlisteners here.
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  // Wire event listeners once on mount. The backend emits events even before
  // the command resolves, so attaching here (rather than inside the click
  // handler) avoids a race where the first progress tick arrives before our
  // `listen()` promise resolves.
  useEffect(() => {
    let cancelled = false;
    const subscribe = async () => {
      const progressUn = await listen<ProgressPayload>(EVENT_PROGRESS, (event) => {
        setStep((prev) =>
          prev.kind === "downloading" || prev.kind === "welcome"
            ? {
                kind: "downloading",
                percent: event.payload.percent,
                status: event.payload.status,
              }
            : prev,
        );
      });
      const completeUn = await listen<unknown>(EVENT_COMPLETE, () => {
        setStep({ kind: "done" });
      });
      const failedUn = await listen<string>(EVENT_FAILED, (event) => {
        setStep({
          kind: "failed",
          message: event.payload ?? "Unknown error",
        });
      });
      if (cancelled) {
        progressUn();
        completeUn();
        failedUn();
        return;
      }
      unlistenersRef.current = [progressUn, completeUn, failedUn];
    };
    void subscribe();
    return () => {
      cancelled = true;
      for (const un of unlistenersRef.current) {
        un();
      }
      unlistenersRef.current = [];
    };
  }, []);

  const startDownload = useCallback(() => {
    setStep({ kind: "downloading", percent: 0, status: "starting" });
    void invoke("start_model_download").catch((error: unknown) => {
      // Dispatch can fail before Rust has a chance to emit EVENT_FAILED
      // (missing command, state, or IPC wiring), so do not strand the setup
      // flow at "starting".
      setStep({
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, []);

  if (step.kind === "welcome") {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card">
          <h1>Set up Intentive</h1>
          <p>
            Intentive runs a small on-device model to summarize your activity privately. This
            one-time download takes a few minutes; you can keep using your Mac while it finishes.
          </p>
          <div className="onboarding-actions">
            <button type="button" className="onboarding-primary" onClick={startDownload}>
              Continue
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (step.kind === "downloading") {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card">
          <h1>Downloading model</h1>
          <p>
            Keep Intentive open while the model finishes downloading. Capture will start
            automatically once it's ready.
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={step.percent}
            aria-label="Bundled model download progress"
            className="onboarding-progress"
          >
            <div className="onboarding-progress__fill" style={{ width: `${step.percent}%` }} />
          </div>
          <p className="onboarding-progress__label">
            {step.percent}% — {step.status}
          </p>
        </section>
      </main>
    );
  }

  if (step.kind === "done") {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card">
          <h1>Intentive is ready</h1>
          <p>
            The on-device model is set up. Intentive will quietly summarize your activity from the
            menu bar.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <h1>Setup didn't finish</h1>
        <p>{step.message}</p>
        <div className="onboarding-actions">
          <button type="button" className="onboarding-primary" onClick={startDownload}>
            Retry
          </button>
        </div>
      </section>
    </main>
  );
}
