/**
 * HTTP surface — mounts the identity routes onto a Hono app.
 *
 * This is the protocol-facing assembly: it adapts the transport-agnostic
 * `{ status, body }` handlers onto Hono's request/response. It builds no
 * dependencies itself — the handlers are injected — so it stays testable via
 * `app.request(...)` without a socket, a verifier, or a database.
 */
import { BoundaryParseError } from "@intentive/api-contract";
import { Hono } from "hono";

import {
  CAPTURE_PERMISSION_GRANTED_HEADER,
  CLIENT_KIND_HEADER,
} from "../../../http/device-signal.js";
import type { GetMeHandler } from "./get-me.js";
import type { PostConsentHandler } from "./post-consent.js";
import type { PostSiblingInvitationSkipHandler } from "./post-sibling-invitation-skip.js";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createApp(deps: {
  getMe: GetMeHandler;
  postConsent: PostConsentHandler;
  postSiblingInvitationSkip: PostSiblingInvitationSkipHandler;
  postDeviceRegister: {
    handle(req: {
      authorization: string | null;
      body: unknown;
    }): Promise<{ status: number; body: unknown }>;
  };
  getAgent: {
    handle(req: {
      authorization: string | null;
      clientKind: string | null;
      capturePermissionGranted: string | null;
    }): Promise<{ status: number; body: unknown }>;
  };
  postInternalNotificationsPush: {
    handle(req: {
      authorization: string | null;
      body: unknown;
    }): Promise<{ status: number; body: unknown }>;
  };
  postInternalNotificationsCheckReceipts: {
    handle(req: {
      authorization: string | null;
      body: unknown;
    }): Promise<{ status: number; body: unknown }>;
  };
}): Hono {
  const app = new Hono();

  // Liveness probe for Cloud Run; no auth, no body of interest.
  app.get("/healthz", () => json({ ok: true, service: "control-plane" }, 200));

  app.get("/me", async (c) => {
    const result = await deps.getMe.handle({
      authorization: c.req.header("authorization") ?? null,
      clientKind: c.req.header(CLIENT_KIND_HEADER) ?? null,
      capturePermissionGranted: c.req.header(CAPTURE_PERMISSION_GRANTED_HEADER) ?? null,
    });
    return json(result.body, result.status);
  });

  // `GET /agent` reads the same device-signal headers as `/me` so the gate
  // policy is identical everywhere (complete mediation).
  app.get("/agent", async (c) => {
    const result = await deps.getAgent.handle({
      authorization: c.req.header("authorization") ?? null,
      clientKind: c.req.header(CLIENT_KIND_HEADER) ?? null,
      capturePermissionGranted: c.req.header(CAPTURE_PERMISSION_GRANTED_HEADER) ?? null,
    });
    return json(result.body, result.status);
  });

  app.post("/consent", async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return json(body.body, body.status);

    return handleBoundaryErrors(async () => {
      const result = await deps.postConsent.handle({
        authorization: c.req.header("authorization") ?? null,
        body: body.value,
      });
      return json(result.body, result.status);
    });
  });

  app.post("/sibling-invitation/skip", async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return json(body.body, body.status);

    return handleBoundaryErrors(async () => {
      const result = await deps.postSiblingInvitationSkip.handle({
        authorization: c.req.header("authorization") ?? null,
        body: body.value,
      });
      return json(result.body, result.status);
    });
  });

  app.post("/devices/register", async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return json(body.body, body.status);

    return handleBoundaryErrors(async () => {
      const result = await deps.postDeviceRegister.handle({
        authorization: c.req.header("authorization") ?? null,
        body: body.value,
      });
      return json(result.body, result.status);
    });
  });

  app.post("/internal/notifications/push", async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return json(body.body, body.status);

    return handleBoundaryErrors(async () => {
      const result = await deps.postInternalNotificationsPush.handle({
        authorization: c.req.header("authorization") ?? null,
        body: body.value,
      });
      return json(result.body, result.status);
    });
  });

  app.post("/internal/notifications/check-receipts", async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return json(body.body, body.status);

    return handleBoundaryErrors(async () => {
      const result = await deps.postInternalNotificationsCheckReceipts.handle({
        authorization: c.req.header("authorization") ?? null,
        body: body.value,
      });
      return json(result.body, result.status);
    });
  });

  return app;
}

/**
 * Read the optional JSON request body. A bodyless POST is normal for these
 * no-field gate writes and becomes `{}`, but malformed JSON is a client error
 * and must not reach the gate writer.
 */
async function readJsonBody(c: {
  req: { text(): Promise<string> };
}): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: 400; body: { code: "invalid_request"; message: string } }
> {
  const text = await c.req.text();
  if (text.trim() === "") return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      status: 400,
      body: { code: "invalid_request", message: "Request body must be valid JSON." },
    };
  }
}

async function handleBoundaryErrors(handle: () => Promise<Response>): Promise<Response> {
  try {
    return await handle();
  } catch (err) {
    if (err instanceof BoundaryParseError) {
      return json(
        {
          code: "invalid_request",
          message: "Request body is invalid.",
          invalid_keys: err.keys,
        },
        400,
      );
    }
    throw err;
  }
}
