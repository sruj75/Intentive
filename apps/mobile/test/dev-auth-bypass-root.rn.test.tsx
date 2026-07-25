import { render, waitFor } from "@testing-library/react-native";
import type { ComponentType } from "react";

import RootLayout from "../app/_layout";

jest.mock("../src/entrypoints/platform", () => ({
  getPlatform: () => ({
    config: { devAuthBypassEnabled: true },
    launchStateSource: { read: jest.fn() },
    registerForPush: jest.fn(),
  }),
}));
jest.mock("../src/providers/telemetry", () => ({
  wrapRoot: (Component: ComponentType) => Component,
}));
jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Stack: () => React.createElement(Text, { testID: "router-stack" }, "Stack"),
    router: { replace: jest.fn() },
  };
});
jest.mock("../src/entrypoints/launch-curtain", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    LaunchCurtain: () => React.createElement(Text, { testID: "launch-curtain" }, "Curtain"),
  };
});
jest.mock("../src/entrypoints/notifications-registrar", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    NotificationsRegistrar: () =>
      React.createElement(Text, { testID: "notifications-registrar" }, "Notifications"),
  };
});

test("the development auth bypass omits live navigation, notification, and curtain behavior", async () => {
  const screen = render(<RootLayout />);

  await waitFor(() => expect(screen.getByTestId("router-stack")).toBeTruthy());
  expect(screen.queryByTestId("launch-curtain")).toBeNull();
  expect(screen.queryByTestId("notifications-registrar")).toBeNull();
});
