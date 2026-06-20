/**
 * Private Internal API surface for Control Plane -> Agent Runtime calls.
 *
 * `POST /internal/sessions/start` is authenticated with the
 * `Authorization: Bearer <secret>` header. The header is checked before parsing into a
 * side-effecting use case so bad callers cannot create Agent Instances.
 */
import { timingSafeEqual } from "node:crypto";

import {
  PostInternalSessionsStartRequest,
  type PostInternalSessionsStartResponse,
} from "@intentive/api-contract";
import { Hono } from "hono";

type InternalStartSession = (
  request: PostInternalSessionsStartRequest,
) => Promise<PostInternalSessionsStartResponse>;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function secretsMatch(actual: string | null, expected: string): boolean {
  if (actual === null) {
    return false;
  }

  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) {
    return false;
  }

  return timingSafeEqual(actualBytes, expectedBytes);
}

function bearerSecret(authorization: string | undefined): string | null {
  if (authorization === undefined) {
    return null;
  }

  const [scheme, token, extra] = authorization.split(/\s+/);
  if (scheme !== "Bearer" || token === undefined || extra !== undefined) {
    return null;
  }

  return token;
}

export function createInternalApp(deps: {
  secret: string;
  startSession: InternalStartSession;
}): Hono {
  const app = new Hono();

  // Liveness probe; no auth, no body of interest. `/health` is the canonical
  // route across deployables; `/healthz` remains a local compatibility alias.
  app.get("/health", () => json({ ok: true, service: "agent-runtime" }, 200));
  app.get("/healthz", () => json({ ok: true, service: "agent-runtime" }, 200));

  app.post("/internal/sessions/start", async (c) => {
    if (!secretsMatch(bearerSecret(c.req.header("authorization")), deps.secret)) {
      return json({ code: "auth_failed", message: "Internal authentication failed." }, 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return json({ code: "invalid_request", message: "Request body must be valid JSON." }, 400);
    }

    const parsed = PostInternalSessionsStartRequest.safeParse(rawBody);
    if (!parsed.success) {
      return json({ code: "invalid_request", message: "Request body is invalid." }, 400);
    }

    return json(await deps.startSession(parsed.data), 200);
  });

  return app;
}
