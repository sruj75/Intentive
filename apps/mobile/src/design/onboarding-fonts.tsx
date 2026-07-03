/**
 * Onboarding font loading — starts Manrope registration at app boot without
 * blocking the launch-state tree (splash, hydration, chat). Onboarding surfaces
 * gate locally via `useOnboardingFontsReady()` so type never flashes system →
 * Manrope; a load error is non-fatal (ready=true, text degrades to platform font).
 * See apps/mobile/docs/adr/0021-*.
 */
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { createContext, useContext, type ReactNode } from "react";

// Default `true` so RN harness tests that mount onboarding screens without the
// root layout still render; production wraps the app in `OnboardingFontsProvider`.
const OnboardingFontsReadyContext = createContext(true);

export function OnboardingFontsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const ready = fontsLoaded || fontError !== null;

  return (
    <OnboardingFontsReadyContext.Provider value={ready}>
      {children}
    </OnboardingFontsReadyContext.Provider>
  );
}

/** True once Manrope registered or font load failed (platform font fallback). */
export function useOnboardingFontsReady(): boolean {
  return useContext(OnboardingFontsReadyContext);
}
