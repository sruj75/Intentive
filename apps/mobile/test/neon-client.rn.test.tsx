import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { createAuthClient } from "better-auth/client";

import { createNeonAuthClient } from "../src/domains/auth/service/neon-client";
import { createRuntimeConfig } from "../src/entrypoints/runtime-config";

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    signIn: jest.fn(),
    getTokens: jest.fn(),
  },
  isSuccessResponse: jest.fn((response: { type: string }) => response.type === "success"),
}));
jest.mock("@better-auth/expo/client", () => ({ expoClient: jest.fn(() => ({ name: "expo" })) }));
jest.mock("better-auth/client", () => ({ createAuthClient: jest.fn() }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const googleSignin = jest.mocked(GoogleSignin);
const successResponse = jest.mocked(isSuccessResponse);
const createClient = jest.mocked(createAuthClient);

function createBetterAuthClient(
  overrides: {
    readonly social?: jest.Mock;
    readonly session?: { readonly data: unknown };
  } = {},
) {
  const client = {
    signIn: {
      social: overrides.social ?? jest.fn().mockResolvedValue({ data: {}, error: null }),
    },
    getSession: jest
      .fn()
      .mockResolvedValue(overrides.session ?? { data: { session: { user: { id: "u-1" } } } }),
    signOut: jest.fn().mockResolvedValue({}),
    $fetch: jest.fn(),
  };
  createClient.mockReturnValue(client as never);
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
  googleSignin.signIn.mockResolvedValue({ type: "success", data: {} } as never);
  googleSignin.getTokens.mockResolvedValue({
    idToken: "google-id-token",
    accessToken: "google-access-token",
  });
  successResponse.mockImplementation((response) => response.type === "success");
});

test("native Google tokens exchange through Better Auth and confirm a session", async () => {
  const client = createBetterAuthClient();
  const auth = createNeonAuthClient({ googleIosClientId: "123.apps.googleusercontent.com" });

  await expect(auth.signInSocial("google")).resolves.toEqual({ result: "authenticated" });
  expect(googleSignin.configure).toHaveBeenCalledWith({
    iosClientId: "123.apps.googleusercontent.com",
  });
  expect(googleSignin.signIn).toHaveBeenCalledTimes(1);
  expect(googleSignin.getTokens).toHaveBeenCalledTimes(1);
  expect(client.signIn.social).toHaveBeenCalledWith({
    provider: "google",
    idToken: {
      token: "google-id-token",
      accessToken: "google-access-token",
    },
  });
  expect(client.getSession).toHaveBeenCalledTimes(1);
});

test("native Google cancellation maps to dismissal without an exchange", async () => {
  const client = createBetterAuthClient();
  googleSignin.signIn.mockResolvedValue({ type: "cancelled", data: null });

  await expect(
    createNeonAuthClient({ googleIosClientId: "123.apps.googleusercontent.com" }).signInSocial(
      "google",
    ),
  ).resolves.toEqual({ result: "dismissed" });
  expect(client.signIn.social).not.toHaveBeenCalled();
  expect(googleSignin.getTokens).not.toHaveBeenCalled();
});

test("native Google prompt failures become recoverable auth failures", async () => {
  const client = createBetterAuthClient();
  googleSignin.signIn.mockRejectedValue(new Error("Google unavailable"));

  await expect(
    createNeonAuthClient({ googleIosClientId: "123.apps.googleusercontent.com" }).signInSocial(
      "google",
    ),
  ).resolves.toEqual({ result: "failed", message: "Google unavailable" });
  expect(client.signIn.social).not.toHaveBeenCalled();
});

test("a missing Google ID token never reaches Better Auth", async () => {
  const client = createBetterAuthClient();
  googleSignin.getTokens.mockResolvedValue({ idToken: "", accessToken: "google-access-token" });

  await expect(
    createNeonAuthClient({ googleIosClientId: "123.apps.googleusercontent.com" }).signInSocial(
      "google",
    ),
  ).resolves.toEqual({ result: "failed", message: "Google did not return an ID token." });
  expect(client.signIn.social).not.toHaveBeenCalled();
  expect(client.getSession).not.toHaveBeenCalled();
});

test("an exchange without a Better Auth session is not authenticated", async () => {
  const client = createBetterAuthClient({ session: { data: null } });

  await expect(
    createNeonAuthClient({ googleIosClientId: "123.apps.googleusercontent.com" }).signInSocial(
      "google",
    ),
  ).resolves.toEqual({ result: "failed", message: "Google sign-in did not establish a session." });
});

test("session restoration reads the Better Auth session owned by SecureStore", async () => {
  const client = createBetterAuthClient({
    session: { data: { session: { user: { id: "u-1" } } } },
  });
  const auth = createNeonAuthClient({ googleIosClientId: "123.apps.googleusercontent.com" });

  await expect(auth.hasSession()).resolves.toBe(true);
  expect(client.getSession).toHaveBeenCalledTimes(1);
});

test("JWT delegation reads the Better Auth token endpoint", async () => {
  const client = createBetterAuthClient();
  client.$fetch.mockResolvedValue({ data: { token: "neon-user-jwt" } });
  const auth = createNeonAuthClient({ googleIosClientId: "123.apps.googleusercontent.com" });

  await expect(auth.getJwt()).resolves.toBe("neon-user-jwt");
  expect(client.$fetch).toHaveBeenCalledWith("/token");
});

test("Google is enabled only when the build carries its public iOS client ID", () => {
  const originalClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  try {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    expect(createRuntimeConfig().enabledAuthProviders.has("google")).toBe(false);

    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "123.apps.googleusercontent.com";
    const config = createRuntimeConfig();
    expect(config.googleIosClientId).toBe("123.apps.googleusercontent.com");
    expect(config.enabledAuthProviders).toEqual(new Set(["google"]));
    expect(config.enabledAuthProviders.has("apple")).toBe(false);
  } finally {
    if (originalClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = originalClientId;
  }
});
