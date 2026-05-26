/**
 * Auth provider — Neon Auth JWKS verification.
 *
 * Both the Control Plane and Agent Runtime verify user JWTs independently
 * via the shared Neon Auth JWKS endpoint. See docs/CONTEXT.md → Control Plane.
 *
 * STUB. Real implementation should:
 * - Fetch and cache JWKS from the Neon Auth endpoint
 * - Verify signature, expiry, audience, issuer
 * - Return a typed { user_id } principal
 */

export interface VerifiedPrincipal {
  user_id: string;
}

export interface JwtVerifier {
  verify(token: string): Promise<VerifiedPrincipal>;
}

export function createJwtVerifier(_config: {
  jwks_url: string;
  issuer: string;
  audience: string;
}): JwtVerifier {
  throw new Error("Not implemented yet — see packages/providers/src/auth.ts");
}
