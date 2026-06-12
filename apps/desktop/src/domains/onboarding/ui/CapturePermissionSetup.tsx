import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type PermissionSet = {
  screen_recording: boolean;
  microphone: boolean;
  accessibility: boolean;
};

type PermissionKind = keyof PermissionSet;
type Step = "intro" | PermissionKind | "done";

const EMPTY_STATUS: PermissionSet = {
  screen_recording: false,
  microphone: false,
  accessibility: false,
};

const STEPS: PermissionKind[] = ["screen_recording", "microphone", "accessibility"];
const CONSENT_ACKNOWLEDGED_KEY = "intentive.capture-consent-acknowledged";

const COPY: Record<PermissionKind, { title: string; body: string; button: string }> = {
  screen_recording: {
    title: "Screen & System Audio Recording",
    body: "Intentive needs this to understand active windows and system audio while the Desktop Client is capturing.",
    button: "Open Screen Recording Settings",
  },
  microphone: {
    title: "Microphone",
    body: "Intentive needs microphone access so spoken context can be summarized with the rest of the Capture Session.",
    button: "Open Microphone Settings",
  },
  accessibility: {
    title: "Accessibility",
    body: "Intentive needs Accessibility to read app and window context reliably while capture is running.",
    button: "Open Accessibility Settings",
  },
};

function firstMissing(status: PermissionSet): PermissionKind | undefined {
  return STEPS.find((kind) => !status[kind]);
}

function stepFor(status: PermissionSet): Step {
  return firstMissing(status) ?? "done";
}

export default function CapturePermissionSetup() {
  const [acknowledged, setAcknowledged] = useState(
    () => localStorage.getItem(CONSENT_ACKNOWLEDGED_KEY) === "true",
  );
  const [status, setStatus] = useState<PermissionSet>(EMPTY_STATUS);
  const [error, setError] = useState<string | null>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<PermissionSet>("capture_permission_status");
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    // Detector-emits (ADR-0021): the Rust detection engine owns the granular
    // permission poll and emits `permissions:status` on change while this
    // surface is open. The webview is a pure subscriber — one initial fetch to
    // seed state, then it renders from emitted snapshots (no self-poll loop).
    let cancelled = false;
    const subscribe = async () => {
      const unlisten = await listen<PermissionSet>("permissions:status", (event) => {
        setStatus(event.payload);
      });
      if (cancelled) {
        unlisten();
        return;
      }
      unlistenersRef.current = [unlisten];
    };
    void subscribe();
    void refresh();
    return () => {
      cancelled = true;
      for (const unlisten of unlistenersRef.current) {
        unlisten();
      }
      unlistenersRef.current = [];
    };
  }, [refresh]);

  const acknowledgeConsent = useCallback(() => {
    localStorage.setItem(CONSENT_ACKNOWLEDGED_KEY, "true");
    setAcknowledged(true);
  }, []);

  const step = useMemo<Step>(() => {
    if (!acknowledged) return "intro";
    return stepFor(status);
  }, [acknowledged, status]);

  const openSettings = useCallback(async (kind: PermissionKind) => {
    try {
      await invoke("open_permission_pane", { kind });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  if (step === "intro") {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card">
          <h1>Capture Permission Setup</h1>
          <p>
            The Desktop Client captures activity on this Mac only after you grant Screen & System
            Audio Recording, Microphone, and Accessibility in macOS Privacy Settings.
          </p>
          <div className="onboarding-actions">
            <button type="button" className="onboarding-primary" onClick={acknowledgeConsent}>
              Continue
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (step === "done") {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card">
          <h1>Capture is ready</h1>
          <p>All required macOS grants are live. Capture will start automatically.</p>
          <GrantList status={status} />
        </section>
      </main>
    );
  }

  const copy = COPY[step];
  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="permission-preview" aria-hidden="true">
          {copy.title}
        </div>
        <GrantList status={status} />
        {error ? <p role="alert">{error}</p> : null}
        <div className="onboarding-actions onboarding-actions--split">
          <button type="button" className="onboarding-secondary" onClick={refresh}>
            Recheck
          </button>
          <button type="button" className="onboarding-primary" onClick={() => openSettings(step)}>
            {copy.button}
          </button>
        </div>
      </section>
    </main>
  );
}

function GrantList({ status }: { status: PermissionSet }) {
  return (
    <dl className="permission-status">
      {STEPS.map((kind) => (
        <div key={kind} className="permission-status__row">
          <dt>{COPY[kind].title}</dt>
          <dd>{status[kind] ? "Granted" : "Needed"}</dd>
        </div>
      ))}
    </dl>
  );
}
