import type { DeliveryPort } from "../../src/domains/delivery/types/delivery.js";

// Node 24 discovers TypeScript files beneath `test/` as runnable tests. Keep
// these compile-time assertions in an unreachable block so the fixture remains
// typechecked by delivery-type-contract.test.mjs without executing collaborators.
if (false) {
  const delivery = null as unknown as DeliveryPort;

  void delivery.deliverReply({
    userId: "user",
    messageId: "reply",
    body: "ordinary reply",
  });
  void delivery.deliverOrdinaryProactive({
    userId: "user",
    messageId: "ordinary-proactive",
    body: "ordinary proactive",
  });
  void delivery.deliverCoachingProactive({
    userId: "user",
    messageId: "coaching",
    body: "coaching intervention",
    windowId: "11111111-1111-4111-8111-111111111111",
  });

  // @ts-expect-error Coaching delivery must bind a Coaching Window.
  void delivery.deliverCoachingProactive({
    userId: "user",
    messageId: "invalid",
    body: "missing window",
  });

  void delivery.deliverReply({
    userId: "user",
    messageId: "invalid-reply",
    body: "reply",
    // @ts-expect-error Ordinary replies retain their windowless delivery shape.
    windowId: "11111111-1111-4111-8111-111111111111",
  });

  void delivery.deliverOrdinaryProactive({
    userId: "user",
    messageId: "invalid-ordinary-proactive",
    body: "ordinary proactive",
    // @ts-expect-error Ordinary proactive delivery must remain windowless.
    windowId: "11111111-1111-4111-8111-111111111111",
  });
}
