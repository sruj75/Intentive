import { describe, expect, it } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json";

function connectSrcEntries(): string[] {
  const csp = tauriConfig.app.security.csp;
  const connectSrc = csp
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("connect-src "));

  if (!connectSrc) return [];
  return connectSrc.split(/\s+/).slice(1);
}

describe("Tauri security config", () => {
  it("allows only the webview connection targets needed in production", () => {
    expect(connectSrcEntries()).toEqual([
      "ipc:",
      "http://ipc.localhost",
      "https://*.neonauth.us-east-1.aws.neon.tech",
      "https://*.ingest.sentry.io",
      "https://*.ingest.us.sentry.io",
      "https://*.ingest.de.sentry.io",
    ]);
  });
});
