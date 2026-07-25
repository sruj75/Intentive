const { withPodfile } = require("expo/config-plugins");

const modularHeadersDirective = "use_modular_headers!";
const reactNativePreparation = "prepare_react_native_project!";

/**
 * Google Sign-In brings in AppCheckCore, whose Swift target depends on
 * GoogleUtilities and RecaptchaInterop. CocoaPods needs module maps for those
 * Objective-C dependencies when it links the Expo pods statically.
 */
module.exports = function withModularHeaders(config) {
  return withPodfile(config, (podfileConfig) => {
    const { contents } = podfileConfig.modResults;
    if (contents.includes(modularHeadersDirective)) return podfileConfig;

    if (!contents.includes(reactNativePreparation)) {
      throw new Error("Unable to add modular headers: Expo's Podfile template changed.");
    }

    podfileConfig.modResults.contents = contents.replace(
      reactNativePreparation,
      `${modularHeadersDirective}\n\n${reactNativePreparation}`,
    );
    return podfileConfig;
  });
};
