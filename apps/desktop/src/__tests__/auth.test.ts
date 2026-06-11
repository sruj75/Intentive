import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@neondatabase/neon-js/auth", () => ({
  createAuthClient: vi.fn((url: string, config: unknown) => ({
    authUrl: url,
    config,
  })),
}));

vi.mock("@neondatabase/neon-js/auth/react/adapters", () => ({
  BetterAuthReactAdapter: vi.fn(() => "react-adapter"),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  invoke.mockReset();
});

describe("Intentive Auth client setup", () => {
  it("fails clearly when VITE_NEON_AUTH_URL is missing", async () => {
    vi.stubEnv("VITE_NEON_AUTH_URL", "");

    const { createIntentiveAuthClient } = await import("../domains/auth/service/auth");

    expect(() => createIntentiveAuthClient()).toThrow(
      "VITE_NEON_AUTH_URL is required to render the Intentive Auth surface.",
    );
  });

  it("creates the Neon Auth client from VITE_NEON_AUTH_URL", async () => {
    vi.stubEnv(
      "VITE_NEON_AUTH_URL",
      "https://ep-lucky-dew-aqkjv8j5.neonauth.us-east-1.aws.neon.tech/neondb/auth",
    );

    const { createIntentiveAuthClient } = await import("../domains/auth/service/auth");

    expect(createIntentiveAuthClient()).toEqual({
      authUrl: "https://ep-lucky-dew-aqkjv8j5.neonauth.us-east-1.aws.neon.tech/neondb/auth",
      config: {
        adapter: "react-adapter",
      },
    });
  });

  it("hands the Neon login token to Rust without exposing Routing", async () => {
    const { syncLoginTokenToRust } = await import("../domains/auth/service/auth");

    await syncLoginTokenToRust({
      getSession: () => ({
        data: {
          session: {
            token: "login-token",
          },
        },
      }),
    });

    expect(invoke).toHaveBeenCalledWith("set_login_token", { token: "login-token" });
  });

  it("clears the Rust login token when the auth client reports signed out", async () => {
    const { syncLoginTokenToRust } = await import("../domains/auth/service/auth");

    await syncLoginTokenToRust({ getSession: () => ({ data: null }) });

    expect(invoke).toHaveBeenCalledWith("clear_login_token");
  });
});
