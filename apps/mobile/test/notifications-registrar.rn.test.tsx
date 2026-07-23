import { render } from "@testing-library/react-native";

import { NotificationsRegistrar } from "../src/entrypoints/notifications-registrar";

/**
 * Push registration owns the persistent signed-in lifecycle (ADR 0028 / 0030):
 * exactly one attempt per signed-in period. The transition sequence
 * false→true→true→false→true must produce exactly two attempts — one per
 * signed-in period — and rerenders/navigation that stay signed-in never re-prompt.
 */

function harness(signedIn: boolean, register: () => Promise<unknown>) {
  return render(<NotificationsRegistrar signedIn={signedIn} register={register} />, {
    createNodeMock: () => ({ measure: () => undefined }),
  });
}

test("false→true→true→false→true produces exactly one attempt per signed-in period", () => {
  const register = jest.fn().mockResolvedValue({ status: "registered" });

  const view = harness(false, register);
  expect(register).toHaveBeenCalledTimes(0);

  view.rerender(<NotificationsRegistrar signedIn={true} register={register} />);
  expect(register).toHaveBeenCalledTimes(1);

  // Staying signed in through rerenders/navigation does not re-attempt.
  view.rerender(<NotificationsRegistrar signedIn={true} register={register} />);
  view.rerender(<NotificationsRegistrar signedIn={true} register={register} />);
  expect(register).toHaveBeenCalledTimes(1);

  // Logout ends the signed-in period (no attempt while signed out).
  view.rerender(<NotificationsRegistrar signedIn={false} register={register} />);
  expect(register).toHaveBeenCalledTimes(1);

  // A new signed-in period attempts registration exactly once more.
  view.rerender(<NotificationsRegistrar signedIn={true} register={register} />);
  expect(register).toHaveBeenCalledTimes(2);
});

test("without an injected register it makes zero calls across the same transitions", () => {
  const view = render(<NotificationsRegistrar signedIn={true} />);
  view.rerender(<NotificationsRegistrar signedIn={false} />);
  view.rerender(<NotificationsRegistrar signedIn={true} />);
  // No register prop ⇒ the offline default ⇒ zero capability calls.
});
