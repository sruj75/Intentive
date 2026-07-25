import { act, render } from "@testing-library/react-native";

import ChatRoute from "../app/(main)/chat";
import { ChatEntry } from "../src/entrypoints/chat-entry";
import { getPlatform } from "../src/entrypoints/platform";
import { useLaunchState } from "../src/providers/launch-state";

jest.mock("../src/entrypoints/chat-entry", () => ({
  ChatEntry: jest.fn(() => null),
}));
jest.mock("../src/entrypoints/platform", () => ({
  getPlatform: jest.fn(),
}));
jest.mock("../src/providers/launch-state", () => ({
  useLaunchState: jest.fn(),
}));

const mockedChatEntry = ChatEntry as jest.MockedFunction<typeof ChatEntry>;
const mockedGetPlatform = getPlatform as jest.MockedFunction<typeof getPlatform>;
const mockedUseLaunchState = useLaunchState as jest.MockedFunction<typeof useLaunchState>;

function mountedLogout(): () => void | Promise<void> {
  const props = mockedChatEntry.mock.calls[0]?.[0];
  if (!props?.onLogout) throw new Error("live ChatRoute did not inject onLogout");
  return props.onLogout;
}

describe("live Chat route logout boundary", () => {
  const signOut = jest.fn<Promise<void>, []>();
  const markSignedOut = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    signOut.mockResolvedValue(undefined);
    mockedGetPlatform.mockReturnValue({
      auth: { signOut },
      accountStateSource: {},
      createRuntimeSession: jest.fn(),
    } as unknown as ReturnType<typeof getPlatform>);
    mockedUseLaunchState.mockReturnValue({
      markSignedOut,
    } as unknown as ReturnType<typeof useLaunchState>);
  });

  it("clears the durable auth session before marking Launch State signed out", async () => {
    render(<ChatRoute />);

    await act(async () => mountedLogout()());

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(markSignedOut).toHaveBeenCalledTimes(1);
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(
      markSignedOut.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("does not mark Launch State signed out when durable sign-out fails", async () => {
    const failure = new Error("SecureStore delete failed");
    signOut.mockRejectedValue(failure);
    render(<ChatRoute />);

    await expect(mountedLogout()()).rejects.toBe(failure);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(markSignedOut).not.toHaveBeenCalled();
  });
});
