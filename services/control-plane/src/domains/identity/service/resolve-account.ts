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
}

export function createIdentityService(deps: {
  verifier: JwtVerifier;
  users: UsersRepo;
  gates: NextGateResolver;
  devices: DeviceLister;
}): IdentityService {
  async function authenticate(token: string): Promise<{ userId: string }> {
    // The verifier's `user_id` is the IdP *subject* (jose `payload.sub`); the
    // repo maps that to the stable internal user_id we expose to clients.
    const { user_id: sub } = await deps.verifier.verify(token);
    return deps.users.resolveUser({ sub });
  }

  return {
    authenticate,
    async resolveAccount(token, signal = {}) {
      const { userId } = await authenticate(token);

      // The Sibling Invitation is satisfied by an *observed* sibling device — a
      // device of a different client_kind than the caller's (Android ignored in
      // v1). We read it at composition time and pass it as a pure input so the
      // gates sequencer never reaches into devices itself (ADR-0005). Without a
      // reported client_kind there is no "different kind" to find, so it is false.
      const devices = await deps.devices.listDevicesForUser(userId);
      const hasSiblingDevice =
        signal.client_kind != null &&
        devices.some((d) => d.client_kind !== signal.client_kind && d.client_kind !== "android");

      const next_gate = await deps.gates.nextGate(userId, {
        clientKind: signal.client_kind,
        capturePermissionGranted: signal.capture_permission_granted,
        hasSiblingDevice,
      });

      // `has_agent_instance` stays the honest `false` placeholder until #30 wires
      // the `agents` collaborator. `user_id` and `next_gate` are now real.
      return { user_id: userId, next_gate, has_agent_instance: false };
    },
  };
}
