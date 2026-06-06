/**
 * HTTP surface — mounts the identity routes onto a Hono app.
 *
 * This is the protocol-facing assembly: it adapts the transport-agnostic
 * `{ status, body }` handlers onto Hono's request/response. It builds no
 * dependencies itself — the handlers are injected — so it stays testable via
 * `app.request(...)` without a socket, a verifier, or a database.
 */
import { Hono } from "hono";

import type { GetMeHandler } from "./get-me.js";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createApp(deps: { getMe: GetMeHandler }): Hono {
  const app = new Hono();

  // Liveness probe for Cloud Run; no auth, no body of interest.
  app.get("/healthz", () => json({ ok: true, service: "control-plane" }, 200));

  app.get("/me", async (c) => {
    const result = await deps.getMe.handle({
      authorization: c.req.header("authorization") ?? null,
    });
    return json(result.body, result.status);
  });

  return app;
}
