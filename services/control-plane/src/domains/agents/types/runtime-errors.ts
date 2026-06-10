/**
 * Cross-domain error surfaced when Session Start cannot reach the Agent Runtime
 * or get a usable response. Routing maps it to a retryable `503`; agents service
 * propagates it unchanged from the repo client.
 */
export class AgentRuntimeUnavailableError extends Error {
  override readonly name = "AgentRuntimeUnavailableError";
  readonly reason: "transport" | "non_2xx" | "malformed_response";

  constructor(reason: "transport" | "non_2xx" | "malformed_response", message: string) {
    super(message);
    this.reason = reason;
  }
}
