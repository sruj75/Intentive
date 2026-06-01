import type React from "react";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type CapturedAuthProviderProps = {
  authClient: unknown;
  baseURL?: string;
  redirectTo?: string;
  credentials?: boolean;
  social?: { providers: string[] };
  children: React.ReactNode;
};

const capturedAuthProviderProps: CapturedAuthProviderProps[] = [];

vi.mock("@neondatabase/neon-js/auth/react", () => ({
  NeonAuthUIProvider: (props: CapturedAuthProviderProps) => {
    capturedAuthProviderProps.push(props);
    return <section aria-label="Intentive Auth Provider">{props.children}</section>;
  },
}));

vi.mock("@neondatabase/neon-js/ui/css", () => ({}));

vi.mock("../domains/auth/service/auth", () => ({
  authClient: { kind: "test-auth-client" },
  readNeonAuthUrl: () => "https://neon.example/auth",
}));

vi.mock("../App", () => ({
  default: () => <main>Intentive Settings</main>,
}));

afterEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
  capturedAuthProviderProps.length = 0;
});

describe("Intentive Auth provider wiring", () => {
  it("limits the Auth surface to Google sign-in", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import("../main");

    await waitFor(() => {
      expect(capturedAuthProviderProps.length).toBeGreaterThan(0);
    });
    expect(capturedAuthProviderProps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          authClient: { kind: "test-auth-client" },
          baseURL: "https://neon.example/auth",
          redirectTo: "https://neon.example/auth",
          credentials: false,
          social: { providers: ["google"] },
        }),
      ]),
    );
    expect(capturedAuthProviderProps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          credentials: false,
        }),
      ]),
    );
    expect(capturedAuthProviderProps.every((props) => props.credentials === false)).toBe(true);
  });

  it("does not boot the Auth provider for onboarding surface", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState({}, "", "/?surface=onboarding");

    await import("../main");

    await waitFor(() => {
      expect(document.body.textContent).toContain("Intentive Settings");
    });
    expect(capturedAuthProviderProps).toHaveLength(0);
  });
});
