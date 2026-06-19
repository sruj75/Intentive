import {
  PostDeviceRegisterRequest,
  PostDeviceRegisterResponse,
  parseBoundary,
} from "@intentive/api-contract";

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface FetchLike {
  (
    url: string,
    init?: {
      readonly method?: string;
      readonly headers?: Record<string, string>;
      readonly body?: string;
    },
  ): Promise<FetchResponseLike>;
}

export interface RegisterDeviceDeps {
  readonly baseUrl: string;
  readonly getUserJwt: () => Promise<string | null>;
  readonly fetch: FetchLike;
}

export interface RegisterDeviceInput {
  readonly deviceFingerprint: string;
  readonly expoPushToken: string;
}

export async function registerDevice(
  deps: RegisterDeviceDeps,
  input: RegisterDeviceInput,
): Promise<{ deviceId: string } | null> {
  const userJwt = await deps.getUserJwt();
  if (userJwt === null) return null;
  const request = parseBoundary(PostDeviceRegisterRequest, {
    device_fingerprint: input.deviceFingerprint,
    client_kind: "mobile",
    expo_push_token: input.expoPushToken,
  });

  const res = await deps.fetch(`${deps.baseUrl}/devices/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${userJwt}`,
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error(`Device registration failed with status ${res.status}`);
  }

  const body = parseBoundary(PostDeviceRegisterResponse, await res.json());
  return { deviceId: body.device_id };
}
