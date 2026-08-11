import type { AuthenticatedHumanPrincipal } from "./accessJwtVerifier";

/**
 * Explicit authorization boundary for the Approval Ledger.
 *
 * Authentication (verified Access JWT → issuer + subjectId) answers "who is this Human?".
 * Authorization answers "may this Human use this Ledger capability?".
 * The two are evaluated separately and both fail closed.
 */
export type LedgerCapability = "ledger.record" | "ledger.read";

export type LedgerAuthzDenyReason =
  /** No authorization policy is configured/available. Deny-by-default. */
  | "AUTHZ_UNAVAILABLE"
  /** A policy is available but does not grant this principal the capability. */
  | "PRINCIPAL_NOT_AUTHORIZED";

export type LedgerAuthzDecision =
  | { allowed: true; capability: LedgerCapability; policy: string }
  | { allowed: false; reason: LedgerAuthzDenyReason };

/**
 * Pluggable authorization policy.
 *
 * Implementations decide only from the trusted server-side principal
 * (issuer + subjectId). Browser fields, query parameters, request-body identity,
 * GitHub/PAT actors, displayName and email are never authorization proof.
 */
export interface LedgerAuthorizer {
  authorize(
    principal: AuthenticatedHumanPrincipal,
    capability: LedgerCapability,
  ): Promise<LedgerAuthzDecision>;
}

export const ACCESS_POLICY_AUTHZ_MODE = "access-policy";

/**
 * Coarse staging authorizer: delegate the allowlist to the Cloudflare Access
 * application policy.
 *
 * Rationale: every principal reaching the Worker with a verified Human Access JWT
 * was already admitted by the Access application policy for this app. This
 * authorizer therefore grants Ledger capabilities to Human principals of the
 * single configured trusted issuer, and nothing else.
 *
 * It is intentionally replaceable by a future principal/role policy
 * (per-(issuer + subjectId) allowlist) behind the same LedgerAuthorizer interface.
 */
export class AccessPolicyLedgerAuthorizer implements LedgerAuthorizer {
  readonly #trustedIssuer: string;

  constructor(trustedIssuer: string) {
    this.#trustedIssuer = trustedIssuer.trim().replace(/\/$/, "");
  }

  async authorize(
    principal: AuthenticatedHumanPrincipal,
    capability: LedgerCapability,
  ): Promise<LedgerAuthzDecision> {
    if (!this.#trustedIssuer) {
      return { allowed: false, reason: "AUTHZ_UNAVAILABLE" };
    }
    if (!principal.subjectId || principal.issuer !== this.#trustedIssuer) {
      return { allowed: false, reason: "PRINCIPAL_NOT_AUTHORIZED" };
    }
    return { allowed: true, capability, policy: ACCESS_POLICY_AUTHZ_MODE };
  }
}

export type LedgerAuthzEnv = {
  /**
   * Explicit opt-in for an authorization policy. Unset / unrecognized values
   * leave authorization unavailable, which denies every request.
   */
  LEDGER_AUTHZ_MODE?: string;
  ACCESS_TEAM_DOMAIN?: string;
};

/**
 * Resolve the configured authorizer. Returns null when no authorization policy
 * is explicitly and completely configured — callers must treat null as DENY.
 */
export function ledgerAuthorizerFromEnv(env: LedgerAuthzEnv): LedgerAuthorizer | null {
  const mode = env.LEDGER_AUTHZ_MODE?.trim();
  if (mode !== ACCESS_POLICY_AUTHZ_MODE) return null;

  const trustedIssuer = env.ACCESS_TEAM_DOMAIN?.trim();
  if (!trustedIssuer) return null;

  return new AccessPolicyLedgerAuthorizer(trustedIssuer);
}
