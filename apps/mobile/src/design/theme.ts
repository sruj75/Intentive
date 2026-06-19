import { useColorScheme, type ColorSchemeName } from "react-native";

export interface MobileThemeColors {
  readonly action: string;
  readonly actionDisabled: string;
  readonly actionMuted: string;
  readonly assistantBubble: string;
  readonly backdrop: string;
  readonly canvas: string;
  readonly companion: string;
  readonly danger: string;
  readonly dangerBorder: string;
  readonly elevated: string;
  readonly glassShadow: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly inkSubtle: string;
  readonly line: string;
  readonly notice: string;
  readonly noticeText: string;
  readonly paper: string;
  readonly surfaceMuted: string;
  readonly user: string;
  readonly userBubbleShadow: string;
  readonly userDeep: string;
  readonly userText: string;
  readonly companionBubbleShadow: string;
}

export interface MobileTheme {
  readonly colors: MobileThemeColors;
  readonly isDark: boolean;
}

export const lightTheme: MobileTheme = {
  isDark: false,
  colors: {
    action: "#1D4E89",
    actionDisabled: "rgba(29, 78, 137, 0.32)",
    actionMuted: "rgba(29, 78, 137, 0.14)",
    assistantBubble: "#FFFCF7",
    backdrop: "rgba(37, 31, 24, 0.26)",
    canvas: "#F7F3EC",
    companion: "#FFFCF7",
    danger: "#7A3A26",
    dangerBorder: "rgba(122, 58, 38, 0.36)",
    elevated: "#FFFCF7",
    glassShadow: "rgba(51, 43, 34, 0.18)",
    ink: "#251F18",
    inkMuted: "#62584B",
    inkSubtle: "#948879",
    line: "rgba(51, 43, 34, 0.14)",
    notice: "rgba(37, 31, 24, 0.82)",
    noticeText: "#FFFCF7",
    paper: "#FFFCF7",
    surfaceMuted: "rgba(238, 235, 230, 0.92)",
    user: "#1D4E89",
    userBubbleShadow: "rgba(18, 54, 95, 0.18)",
    userDeep: "#12365F",
    userText: "#FFFCF7",
    companionBubbleShadow: "rgba(54, 44, 34, 0.10)",
  },
};

export const darkTheme: MobileTheme = {
  isDark: true,
  colors: {
    action: "#6B9E8A",
    actionDisabled: "rgba(107, 158, 138, 0.32)",
    actionMuted: "rgba(107, 158, 138, 0.18)",
    assistantBubble: "#1F1E22",
    backdrop: "rgba(0, 0, 0, 0.48)",
    canvas: "#141316",
    companion: "#1F1E22",
    danger: "#E86A52",
    dangerBorder: "rgba(232, 106, 82, 0.36)",
    elevated: "#28262C",
    glassShadow: "rgba(0, 0, 0, 0.36)",
    ink: "#EEEBE6",
    inkMuted: "#9C989F",
    inkSubtle: "#A8A39A",
    line: "#3A383F",
    notice: "rgba(238, 235, 230, 0.9)",
    noticeText: "#141316",
    paper: "#1F1E22",
    surfaceMuted: "#1A191D",
    user: "#2A282E",
    userBubbleShadow: "rgba(0, 0, 0, 0.28)",
    userDeep: "#1A191D",
    userText: "#EEEBE6",
    companionBubbleShadow: "rgba(0, 0, 0, 0.32)",
  },
};

export function resolveMobileTheme(scheme: ColorSchemeName): MobileTheme {
  return scheme === "dark" ? darkTheme : lightTheme;
}

export function useMobileTheme(): MobileTheme {
  return resolveMobileTheme(useColorScheme());
}
