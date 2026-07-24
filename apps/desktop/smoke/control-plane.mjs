// Controlled Control Plane stub for the signed-in Capture Session smoke (#35).
//
// Proves the *front* of the chain: Routing is issued only for a valid,
// Neon-Auth-shaped JWT, over real HTTP `GET /agent` — never a manual endpoint
// field. It mints an ephemeral RSA keypair, serves the matching JWKS, and
// validates the `Authorization: Bearer` login token with the **real**
// `createJwtVerifier` from `@intentive/providers/auth` (the single sanctioned
// verifier the Control Plane and Agent Runtime both use). Valid → 200 routing
// pointing at the test gateway; invalid → 401.

import { createServer } from "node:http";

import { createJwtVerifier } from "@intentive/providers/auth";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const ISSUER = "https://smoke.intentive.local";
const AUDIENCE = "intentive-control-plane";
const KID = "smoke-key-1";

/**
 * Start the Control Plane stub on an ephemeral port.
 *
 * @param {{ wsUrl: string }} opts  `wsUrl` is the test gateway's ws URL, handed
 *   back in the routing response as the place Desktop should connect.
 * @returns {Promise<{ url: string, port: number, mintLoginToken: (sub?: string) => Promise<string>, close: () => Promise<void> }>}
 */
export async function startControlPlane({ wsUrl }) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "RS256", use: "sig" };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    // JWKS endpoint the real verifier fetches to validate the login token.
    if (req.method === "GET" && url.pathname === "/.well-known/jwks.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }

    // Routing lookup — the real GET /agent the Desktop's RoutingFetcher hits.
    if (req.method === "GET" && url.pathname === "/agent") {
      const auth = req.headers["authorization"] ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
      try {
        const principal = await verifier.verify(token);
        console.log(`🟢 control-plane: GET /agent → 200 (user_id=${principal.user_id})`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            agent_instance_id: "agent_smoke",
            ws_url: wsUrl,
            runtime_jwt: "runtime-smoke-jwt",
          }),
        );
      } catch (err) {
        console.error(`🔴 control-plane: GET /agent → 401 (${err?.reason ?? err?.message ?? err})`);
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_token" }));
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  // The real verifier, bound to this stub's own JWKS — so a token only passes if
  // it was minted by `mintLoginToken` below (correct iss/aud/signature).
  const verifier = createJwtVerifier({
    jwks_url: `${url}/.well-known/jwks.json`,
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  const mintLoginToken = (sub = "smoke-user") =>
    new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setSubject(sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(privateKey);

  return {
    url,
    port,
    mintLoginToken,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
