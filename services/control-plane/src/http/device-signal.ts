/**
 * Device-signal header boundary — the one place that reads the optional
 * per-request device signal off its raw HTTP headers (ADR-0005).
 *
 * `GET /me` and `GET /agent` both need the identical parse so they apply the
 * same gate policy (complete mediation), but they live in different domains and
 * a `ui` file may not import another domain's `ui`. This module sits in a
 * service-local `src/http/` directory — outside `domains/`, so (like
 * `src/main.ts`) it is exempt from the forward-only layer rule and the
 * cross-domain import ban — and either handler may import it.
 *
 * A malformed header is *not* a 400: these are hot paths that must stay
 * answerable, so an unparseable signal degrades to "no signal" — the
 * cross-client-only gate sequence — exactly as an unregistered/legacy caller
 * that sends no headers at all.
 */
import { GetMeDeviceSignal } from "@intentive/api-contract";

/** The header carrying the caller's Client Kind (`mobile_ios` / `desktop_macos`). */
export const CLIENT_KIND_HEADER = "x-client-kind";
/** The header carrying whether the desktop capture permission is granted. */
export const CAPTURE_PERMISSION_GRANTED_HEADER = "x-capture-permission-granted";

/**
 * The raw device-signal header values a request carries, or null/absent when not
 * sent. Both `GetMeRequest` and `GetAgentRequest` are structurally assignable to
 * this, so each handler passes itself straight in.
 */
export interface DeviceSignalHeaders {
  clientKind?: string | null;
  capturePermissionGranted?: string | null;
}

export function readDeviceSignal(headers: DeviceSignalHeaders): GetMeDeviceSignal {
  const raw: Record<string, string> = {};
  if (headers.clientKind != null) raw.client_kind = headers.clientKind;
  if (headers.capturePermissionGranted != null) {
    raw.capture_permission_granted = headers.capturePermissionGranted;
  }
  const parsed = GetMeDeviceSignal.safeParse(raw);
  return parsed.success ? parsed.data : {};
}
