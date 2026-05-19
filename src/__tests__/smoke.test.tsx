import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import App from "../App";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("App placeholder surfaces", () => {
  it("renders the Settings heading by default", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Settings",
    );
  });

  it("renders the Sign In heading when ?surface=sign-in is set", () => {
    window.history.replaceState({}, "", "/?surface=sign-in");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Sign In",
    );
  });
});
