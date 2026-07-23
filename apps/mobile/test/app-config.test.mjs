import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const configureApp = require("../app.config.js");
const googlePlugin = "@react-native-google-signin/google-signin";
const modularHeadersPlugin = "./plugins/with-modular-headers";

test("configures modular headers even when the Google client ID is absent", () => {
  const originalClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  try {
    const config = configureApp({ config: { plugins: ["expo-router"] } });

    assert.ok(config.plugins.includes(modularHeadersPlugin));
    assert.equal(
      config.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === googlePlugin),
      false,
    );
  } finally {
    if (originalClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = originalClientId;
  }
});

test("configures the Google URL scheme when the client ID is present", () => {
  const originalClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "123.apps.googleusercontent.com";

  try {
    const config = configureApp({ config: { plugins: [] } });

    assert.deepEqual(config.plugins, [
      modularHeadersPlugin,
      [googlePlugin, { iosUrlScheme: "com.googleusercontent.apps.123" }],
    ]);
  } finally {
    if (originalClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = originalClientId;
  }
});
