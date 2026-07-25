import type { ImageSourcePropType } from "react-native";

export const brandIdentity = {
  name: "Intentive",
  initialsFallback: "I",
  mark: "Intentive abstract mark",
} as const;

export const brandAssets = {
  head: require("../../assets/Intentive.icon/Assets/head.png") as ImageSourcePropType,
} as const;
