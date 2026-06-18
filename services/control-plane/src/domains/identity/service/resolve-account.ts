/**
 * Identity service — the sole assembler of Account State (ADR-0004).
 *
 * Two responsibilities, kept separate so each is trivially testable:
 *
 *  - `authenticate(token)` is the "what is an authenticated request" decision:
 *    verify the JWT, map the IdP subject to our internal user_id. The HTTP
 *    handlers (`requireUser`) and `resolveAccount` both lean on this so that
 *    decision lives in exactly one place.
 *  - `resolveAccount(token)` composes the `GetMeResponse` by calling each owning
 *    domain for its field — `user_id` from `authenticate` here, `next_gate` from
 *    the injected `gates` port. It owns the wire shape; the domains expose
 *    decisions, not the `/me` response.
 *
 * It holds no I/O and no HTTP-status knowledge: a verification failure surfaces
 * as the verifier's typed `JwtVerificationError`, which the HTTP layer maps to a
 * status. That keeps these functions pure and testable with fakes.
 */
import type {
  AccountState,
  ClientKind,
  GetMeDeviceSignal,
  PreChatGateKind,
} from "@intentive/api-contract";
import type { JwtVerifier } from "@intentive/providers/auth";

import type { UsersRepo } from "../repo/users.js";

/** The per-request device context the composer hands gate computation (ADR-0005). */
interface DeviceGateContext {
  clientKind?: ClientKind;
  capturePermissionGranted?: boolean;
  hasSiblingDevice: boolean;
}

/**
 * The narrow slice of the gates domain this composer needs: "what gate is next
 * for this user, given the calling device's context?". Depending on this local
 * port (not the whole `GatesService`) keeps identity decoupled from the gates
 * write surface — identity only reads.
 */
export interface NextGateResolver {
  nextGate(userId: string, device: DeviceGateContext): Promise<PreChatGateKind | null>;
}

/**
 * The narrow slice of the devices domain this composer needs: enumerate a User's
 * devices to derive "is a sibling client connected?". Only `client_kind` is
 * required, and the port is token-free by construction — the composer can never
 * see a push token (least privilege; ADR-0005).
 */
export interface DeviceLister {
  listDevicesForUser(userId: string): Promise<readonly { client_kind: ClientKind }[]>;
}

/**
 * The narrow slice of the agents domain this composer needs: "has this User ever
 * provisioned a Companion?". Depending on this local read port (not the whole
 * `AgentsService`, whose write surface calls the Agent Runtime) keeps identity a
 * pure reader and avoids a dependency cycle — `agents` knows nothing of
 * `identity`; this port is injected at the composition root.
 */
export interface AgentInstanceReader {
  hasAgentInstance(userId: string): Promise<boolean>;
}

/**
 * The principal + gate decision shared by both public methods, resolved from one
 * JWT verification. `authSubject` is the IdP subject (Routing's pass-through
 * `runtime_jwt` identity); `userId` is our stable internal id. Account State
 * deliberately never carries `authSubject` — only `resolveRoutingContext`
 * exposes it.
 */
export interface RoutingContext {
  userId: string;
  authSubject: string;
  nextGate: PreChatGateKind | null;
}

interface PrincipalAndGate extends RoutingContext {
  hasDesktopClient: boolean;
}

export interface IdentityService {
  /**
   * Verify `token` and resolve the caller to a stable internal user. Rejects
   * with the verifier's `JwtVerificationError` if the token is not valid. This
   * is the single definition of an authenticated request.
   */
  authenticate(token: string): Promise<{ userId: string }>;

  /**
   * Verify `token` and return the caller's full Account State, computing the
   * next gate for the *calling device* using the optional `GET /me` device
   * signal (ADR-0005). Rejects with the verifier's `JwtVerificationError` if the
   * token is not valid; never returns a partial or unauthenticated account. An
   * absent signal yields the cross-client-only gate sequence.
   */
  resolveAccount(token: string, signal?: GetMeDeviceSignal): Promise<AccountState>;

  /**
   * Verify `token` and return the principal-and-gate context Routing needs to
   * authorize `GET /agent`: the internal `userId`, the `authSubject`, and the
   * device-aware `nextGate`. Same verification and same gate logic as
   * `resolveAccount` (one place owns ADR-0005), but exposes `authSubject` and
   * omits `has_agent_instance` — Routing decides on the gate, not the registry.
   * Rejects with the verifier's `JwtVerificationError` if the token is invalid.
   */
  resolveRoutingContext(token: string, signal?: GetMeDeviceSignal): Promise<RoutingContext>;
}

export function createIdentityService(deps: {
  verifier: JwtVerifier;
  users: UsersRepo;
  gates: NextGateResolver;
  devices: DeviceLister;
  agents: AgentInstanceReader;
}): IdentityService {
  async function authenticate(token: string): Promise<{ userId: string }> {
    // The verifier's `user_id` is the IdP *subject* (jose `payload.sub`); the
    // repo maps that to the stable internal user_id we expose to clients.
    const { user_id: sub } = await deps.verifier.verify(token);
    const { userId } = await deps.users.resolveUser({ sub });
    return { userId };
  }

  /**
   * The private core both public methods build on: one verification → resolve
   * the user → compose the device-aware gate (ADR-0005). Keeping the
   * sibling-device derivation and the gate call here means that logic lives in
   * exactly one place and never leaks into a second domain (Routing must not
   * re-derive gate inputs).
   */
  async function resolvePrincipalAndGate(
    token: string,
    signal: GetMeDeviceSignal,
  ): Promise<PrincipalAndGate> {
    const { user_id: authSubject } = await deps.verifier.verify(token);
    const { userId } = await deps.users.resolveUser({ sub: authSubject });

    // The Sibling Invitation is satisfied by an *observed* sibling device — a
    // device of a different client_kind than the caller's (Android ignored in
    // v1). We read it at composition time and pass it as a pure input so the
    // gates sequencer never reaches into devices itself (ADR-0005). Without a
    // reported client_kind there is no "different kind" to find, so it is false.
    const devices = await deps.devices.listDevicesForUser(userId);
    const hasDesktopClient = devices.some((d) => d.client_kind === "desktop");
    const hasSiblingDevice =
      signal.client_kind != null &&
      devices.some((d) => d.client_kind !== signal.client_kind && d.client_kind !== "android");

    const nextGate = await deps.gates.nextGate(userId, {
      clientKind: signal.client_kind,
      capturePermissionGranted: signal.capture_permission_granted,
      hasSiblingDevice,
    });

    return { userId, authSubject, nextGate, hasDesktopClient };
  }

  return {
    authenticate,

    async resolveAccount(token, signal = {}) {
      const { userId, nextGate, hasDesktopClient } = await resolvePrincipalAndGate(token, signal);
      // `has_agent_instance` now comes from the injected agents read port: it is
      // "has ever provisioned," not "live session." `authSubject` is deliberately
      // dropped — Account State never carries the IdP subject.
      const has_agent_instance = await deps.agents.hasAgentInstance(userId);
      return {
        user_id: userId,
        next_gate: nextGate,
        has_agent_instance,
        has_desktop_client: hasDesktopClient,
      };
    },

    resolveRoutingContext(token, signal = {}) {
      return resolvePrincipalAndGate(token, signal).then(({ userId, authSubject, nextGate }) => ({
        userId,
        authSubject,
        nextGate,
      }));
    },
  };
}
