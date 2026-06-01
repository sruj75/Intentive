/**
 * Auth provider — Neon Auth JWKS verification.
 *
 * Both the Control Plane (`identity` domain) and the Agent Runtime verify user
 * JWTs independently against the shared Neon Auth JWKS
 * endpoint. This is the single sanctioned verifier — there is no second,
 * deployable-local one (see docs/CONTEXT.md → Control Plane and
 * packages/providers/ARCHITECTURE.md).
 */

import { createRemoteJWKSet, errors, jwtVerify } from "jose";

export interface VerifiedPrincipal {
  user_id: string;
}

export interface JwtVerifier {
  verify(token: string): Promise<VerifiedPrincipal>;
}

/**
 * Why a token failed verification. Callers branch on `reason` to decide how to
 * respond (e.g. the Control Plane maps it to an HTTP status, the Agent Runtime
 * to a `runtime_error` code) without reaching into jose's internals.
 */
export type JwtVerificationReason =
  | "expired"
  | "invalid_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "unknown_key" // the token's `kid` is absent from the JWKS even after a refetch
  | "jwks_unavailable" // transport/availability issue while fetching JWKS
  | "malformed"; // not a structurally valid JWT

/**
 * The one error every verification failure surfaces as. Its `message` never
 * contains the token or any claim — only the reason — because this verifier
 * sits on the auth hot path and must not leak credentials into logs.
 */
export class JwtVerificationError extends Error {
  override readonly name = "JwtVerificationError";
  readonly reason: JwtVerificationReason;

  constructor(reason: JwtVerificationReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Build a verifier bound to one JWKS endpoint. Construct this once at startup
 * and reuse it: the returned verifier closes over an in-memory key cache that
 * fetches lazily and refetches on an unknown `kid` (key rotation). Creating one
 * per request would defeat the cache and hammer the JWKS endpoint.
 *
 * @param config.jwks_url Neon Auth's `.well-known/jwks.json` URL.
 * @param config.issuer   Expected `iss` claim.
 * @param config.audience Expected `aud` claim.
 * @param options.cooldownDurationMs Minimum gap between JWKS refetches. Defaults
 *   to jose's own default; tests lower it to exercise rotation deterministically.
 */
export function createJwtVerifier(
  config: { jwks_url: string; issuer: string; audience: string },
  options: { cooldownDurationMs?: number } = {},
): JwtVerifier {
  const jwks = createRemoteJWKSet(new URL(config.jwks_url), {
    cooldownDuration: options.cooldownDurationMs,
  });

  return {
    async verify(token: string): Promise<VerifiedPrincipal> {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, jwks, {
          issuer: config.issuer,
          audience: config.audience,
        }));
      } catch (err) {
        throw toVerificationError(err);
      }

      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new JwtVerificationError("malformed", "Token is missing a subject (sub) claim");
      }
      return { user_id: payload.sub };
    },
  };
}

/**
 * Collapse jose's error taxonomy into one typed, leak-free error. We match on
 * jose's error classes (not string codes) so the mapping survives jose's
 * internal code churn.
 */
function toVerificationError(err: unknown): JwtVerificationError {
  if (err instanceof errors.JWTExpired) {
    return new JwtVerificationError("expired", "Token has expired");
  }
  if (err instanceof errors.JWSSignatureVerificationFailed) {
    return new JwtVerificationError("invalid_signature", "Token signature is invalid");
  }
  if (err instanceof errors.JWTClaimValidationFailed) {
    if (err.claim === "iss") {
      return new JwtVerificationError("wrong_issuer", "Token issuer is not accepted");
    }
    if (err.claim === "aud") {
      return new JwtVerificationError("wrong_audience", "Token audience is not accepted");
    }
    return new JwtVerificationError("malformed", "Token has an invalid claim");
  }
  if (err instanceof errors.JWKSNoMatchingKey) {
    return new JwtVerificationError("unknown_key", "No signing key matches the token");
  }
  if (isJwksFetchFailure(err)) {
    return new JwtVerificationError("jwks_unavailable", "JWKS endpoint is unavailable");
  }
  // JWTInvalid, JWSInvalid, and anything else structural land here.
  return new JwtVerificationError("malformed", "Token is malformed");
}

function isJwksFetchFailure(err: unknown): boolean {
  if (err instanceof TypeError) {
    return true;
  }
  if (err instanceof Error && err.cause instanceof TypeError) {
    return true;
  }
  return false;
}
