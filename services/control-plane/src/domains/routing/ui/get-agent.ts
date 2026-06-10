/**
 * `GET /agent` handler — the HTTP boundary for Routing.
 *
 * Transport-agnostic like the identity handlers: it takes the `Authorization`
 * header and the optional device-signal headers and returns a plain
 * `{ status, body }`, so it is unit-testable without a socket and reusable under
 * any server. It owns the HTTP concerns the collaborators refuse to: pulling the
 * bearer token, mapping `JwtVerificationError` / `AgentRuntimeUnavailableError`
 * to a status, enforcing the gate server-side, and validating the outgoing body.
 *
 * It carries a *local* auth-failure helper rather than importing identity's —
 * Routing is its own domain and must not reach across into identity's `ui`
 * (no cross-domain imports; mirrors `devices/ui/post-device-register.ts`).
 *
 * The Control Plane sits beside the data path, never on it: this handler returns
 * where to connect and a badge to present, then the client connects directly to
 * Agent Runtime. The `runtime_jwt` is the inbound bearer token verbatim — the
 * pass-through Neon Auth token the AR handshake verifies against the shared JWKS
 * (ADR-0002); the Control Plane signs nothing.
 */
import { GetAgentResponse, GetMeDeviceSignal, parseBoundary } from "@intentive/api-contract";
import { JwtVerificationError } from "@intentive/providers/auth";

/** The principal-and-gate slice of identity this handler needs (no Account State). */
interface RoutingContextResolver {
  resolveRoutingContext(
    token: string,
    signal?: GetMeDeviceSignal,
  ): Promise<{ userId: string; authSubject: string; nextGate: string | null }>;
}

/** The get-or-create slice of agents this handler needs. */
interface AgentInstanceEnsurer {
  ensureAgentInstance(input: {
    userId: string;
    authSubject: string;
  }): Promise<{ agentInstanceId: string; wsUrl: string }>;
}

export interface GetAgentRequest {
  /** Raw `Authorization` header value, or null when absent. */
  authorization: string | null;
  /** Raw `X-Client-Kind` header value, or null when absent. */
  clientKind?: string | null;
  /** Raw `X-Capture-Permission-Granted` header value, or null when absent. */
  capturePermissionGranted?: string | null;
}

export interface GetAgentResult {
  status: number;
  body: unknown;
}

export interface GetAgentHandler {
  handle(req: GetAgentRequest): Promise<GetAgentResult>;
}

export function createGetAgentHandler(deps: {
  identity: RoutingContextResolver;
  agents: AgentInstanceEnsurer;
}): GetAgentHandler {
  return {
    async handle(req) {
      const token = bearerToken(req.authorization);
      if (token === null) return authFailed();

      let ctx;
      try {
        ctx = await deps.identity.resolveRoutingContext(token, readDeviceSignal(req));
      } catch (err) {
        if (err instanceof JwtVerificationError) {
          return err.reason === "jwks_unavailable" ? serviceUnavailable() : authFailed();
        }
        throw err;
      }

      // Gate enforced server-side (decision #2). A bare 403 — `/me` is the single
      // explainer of `next_gate`, so Routing leaks no gate details (decision #3).
      if (ctx.nextGate !== null) {
        return {
          status: 403,
          body: { code: "gate_required", message: "A Pre-Chat Gate must be satisfied first." },
        };
      }

      let identity;
      try {
        identity = await deps.agents.ensureAgentInstance({
          userId: ctx.userId,
          authSubject: ctx.authSubject,
        });
      } catch (err) {
        // The Runtime couldn't be reached / answered unusably → retryable 503
        // (decision #5). Same body shape as the JWKS outage; never leaks the
        // Runtime's response or the token.
        if (isAgentRuntimeUnavailable(err)) return serviceUnavailable();
        throw err;
      }

      return {
        status: 200,
        // `runtime_jwt` is the inbound bearer token, verbatim — the pass-through
        // Neon Auth token (ADR-0002, decision #1). Parsed on the way out so the
        // response can only leave as a valid GetAgentResponse.
        body: parseBoundary(GetAgentResponse, {
          agent_instance_id: identity.agentInstanceId,
          ws_url: identity.wsUrl,
          runtime_jwt: token,
        }),
      };
    },
  };
}

/**
 * Parse the optional device signal from its raw header values (ADR-0005), so
 * `GET /agent` applies the identical gate policy as `/me` (complete mediation).
 * A malformed header degrades to "no signal" — the cross-client-only sequence —
 * exactly as an unregistered/legacy caller that sends no headers.
 */
function readDeviceSignal(req: GetAgentRequest): GetMeDeviceSignal {
  const raw: Record<string, string> = {};
  if (req.clientKind != null) raw.client_kind = req.clientKind;
  if (req.capturePermissionGranted != null) {
    raw.capture_permission_granted = req.capturePermissionGranted;
  }
  const parsed = GetMeDeviceSignal.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer (.+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function authFailed(): GetAgentResult {
  return {
    status: 401,
    body: { code: "auth_failed", message: "Authentication failed." },
  };
}

/** Recognize the agents Session Start failure without a cross-domain import. */
function isAgentRuntimeUnavailable(err: unknown): boolean {
  return err instanceof Error && err.name === "AgentRuntimeUnavailableError";
}

function serviceUnavailable(): GetAgentResult {
  return {
    status: 503,
    body: {
      code: "service_unavailable",
      message: "The service is temporarily unavailable. Please retry shortly.",
    },
  };
}
