/**
 * Control Plane process entry — the composition root.
 *
 * The one place allowed to wire a cross-cutting provider (the JWKS verifier) and
 * the Neon driver into a domain. It builds each collaborator once, in dependency
 * order, and serves the Hono app. Sits outside `domains/` so it is exempt from
 * the forward-only layer rule (it composes across layers by design). Keep it
 * thin: construction only, no domain logic.
 */
import { serve } from "@hono/node-server";
import { createJwtVerifier } from "@intentive/providers/auth";
import { neon } from "@neondatabase/serverless";

import { loadConfig } from "./config/env.js";
import { createUsersRepo, type Sql } from "./domains/identity/repo/users.js";
import { createIdentityService } from "./domains/identity/service/resolve-account.js";
import { createApp } from "./domains/identity/ui/app.js";
import { createGetMeHandler } from "./domains/identity/ui/get-me.js";

const config = loadConfig();

// Construct the verifier once: it closes over a lazily-fetched JWKS cache, so a
// per-request verifier would defeat the cache and hammer Neon Auth.
const verifier = createJwtVerifier({
  jwks_url: config.neonAuth.jwksUrl,
  issuer: config.neonAuth.issuer,
  audience: config.neonAuth.audience,
});

const sql = neon(config.neon.url) as unknown as Sql;
const users = createUsersRepo(sql);
const identity = createIdentityService({ verifier, users });
const getMe = createGetMeHandler({ identity });
const app = createApp({ getMe });

serve({ fetch: app.fetch, port: config.port });
console.info(`Control Plane listening on :${config.port}`);
