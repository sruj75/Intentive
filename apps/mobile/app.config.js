const appJson = require("./app.json");

function googleIosUrlScheme(clientId) {
  const suffix = ".apps.googleusercontent.com";
  if (!clientId.endsWith(suffix)) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must end with ${suffix}; received ${clientId}`,
    );
  }

  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

/**
 * Dynamic Expo config derives Google's native callback scheme from the public
 * iOS OAuth client ID. The existing intentive scheme remains in app.json;
 * Google gets this additional reversed-client-ID scheme from its plugin.
 */
module.exports = ({ config = appJson }) => {
  const clientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "").trim();
  const plugins = [...(config.plugins ?? [])];

  if (clientId) {
    plugins.push([
      "@react-native-google-signin/google-signin",
      { iosUrlScheme: googleIosUrlScheme(clientId) },
    ]);
  }

  return { ...config, plugins };
};
