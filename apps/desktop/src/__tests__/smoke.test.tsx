import { describe, expect, it, afterEach, vi } from "vitest";
import type React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import App from "../App";

vi.mock("@neondatabase/neon-js/auth/react/ui", () => ({
  AuthView: () => <section aria-label="Neon Auth">Neon AuthView</section>,
  SignedIn: ({ children }: { children: React.ReactNode }) => (
    <section aria-label="Signed in">{children}</section>
  ),
  SignedOut: ({ children }: { children: React.ReactNode }) => (
    <section aria-label="Signed out">{children}</section>
  ),
  UserButton: () => <button type="button">Intentive account</button>,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("Settings account surface", () => {
  it("renders Settings without manual routing configuration fields or legacy agent copy", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(screen.queryByLabelText(/endpoint url/i)).toBeNull();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
    expect(screen.queryByText(/ScreenPipe/i)).toBeNull();
    expect(screen.queryByText(/OpenClaw/i)).toBeNull();
    expect(screen.queryByText(/Agent Interface/i)).toBeNull();
    expect(screen.queryByText(/runtime_jwt/i)).toBeNull();
    expect(screen.queryByText(/ws_url/i)).toBeNull();
  });

  it("renders Neon Auth when ?surface=sign-in is set", async () => {
    window.history.replaceState({}, "", "/?surface=sign-in");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Sign In" })).toBeTruthy();
    expect(await screen.findByLabelText("Neon Auth")).toBeTruthy();
    expect(screen.queryByText(/placeholder/i)).toBeNull();
    expect(screen.queryByText(/OpenClaw/i)).toBeNull();
  });

  it("renders Capture Permission Setup when ?surface=permission-setup is set", async () => {
    window.history.replaceState({}, "", "/?surface=permission-setup");
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Capture Permission Setup" }),
    ).toBeTruthy();
  });

  it("has a stable signed-in account home", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { level: 2, name: "Account" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Intentive account" })).toBeTruthy();
  });
});
