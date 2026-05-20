import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/neon-js/auth", () => ({
  createAuthClient: vi.fn((url: string, config: unknown) => ({
    authUrl: url,
    config,
  })),
}));

vi.mock("@neondatabase/neon-js/auth/react/adapters", () => ({
  BetterAuthReactAdapter: vi.fn(() => "react-adapter"),
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("Intentive Auth client setup", () => {
  it("fails clearly when VITE_NEON_AUTH_URL is missing", async () => {
    vi.stubEnv("VITE_NEON_AUTH_URL", "");

    await expect(import("../auth")).rejects.toThrow(
      "VITE_NEON_AUTH_URL is required to render the Intentive Auth surface.",
    );
  });

  it("creates the Neon Auth client from VITE_NEON_AUTH_URL", async () => {
    vi.stubEnv(
      "VITE_NEON_AUTH_URL",
      "https://ep-lucky-dew-aqkjv8j5.neonauth.us-east-1.aws.neon.tech/neondb/auth",
    );

    const { authClient } = await import("../auth");

    expect(authClient).toEqual({
      authUrl:
        "https://ep-lucky-dew-aqkjv8j5.neonauth.us-east-1.aws.neon.tech/neondb/auth",
      config: {
        adapter: "react-adapter",
      },
    });
  });
});
