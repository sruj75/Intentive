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

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("Settings account surface", () => {
  it("renders Settings without manual Agent Interface configuration fields", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(screen.queryByLabelText(/endpoint url/i)).toBeNull();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
    expect(screen.queryByText(/ScreenPipe/i)).toBeNull();
  });

  it("renders Neon Auth when ?surface=sign-in is set", () => {
    window.history.replaceState({}, "", "/?surface=sign-in");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign In" })).toBeTruthy();
    expect(screen.getByLabelText("Neon Auth")).toBeTruthy();
    expect(screen.queryByText(/placeholder/i)).toBeNull();
  });

  it("has a stable signed-in account home", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 2, name: "Account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Intentive account" })).toBeTruthy();
  });
});
