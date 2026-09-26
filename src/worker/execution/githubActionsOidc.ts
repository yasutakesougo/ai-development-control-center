import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

export const GITHUB_ACTIONS_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const GITHUB_ACTIONS_OIDC_JWKS = "https://token.actions.githubusercontent.com/.well-known/jwks";

export type GithubActionsOidcConfig = {
  expectedAudience: string;
  expectedRepository: string;
  expectedEnvironment: string;
  expectedJobWorkflowRef: string;
};

export type GithubActionsOidcFailureReason =
  | "MISSING_TOKEN"
  | "MISSING_CONFIGURATION"
  | "INVALID_TOKEN"
  | "UNEXPECTED_REPOSITORY"
  | "UNEXPECTED_ENVIRONMENT"
  | "UNEXPECTED_WORKFLOW";

export type GithubActionsOidcResult =
  | {
      ok: true;
      claims: {
        subject: string;
        repository: string;
        environment: string;
        jobWorkflowRef: string;
      };
    }
  | { ok: false; reason: GithubActionsOidcFailureReason };

let cachedResolver: JWTVerifyGetKey | null = null;

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export function githubActionsOidcConfigFromEnv(env: {
  GITHUB_OIDC_AUDIENCE?: string;
  GITHUB_OIDC_REPOSITORY?: string;
  GITHUB_OIDC_ENVIRONMENT?: string;
  GITHUB_OIDC_JOB_WORKFLOW_REF?: string;
}): GithubActionsOidcConfig | null {
  const expectedAudience = env.GITHUB_OIDC_AUDIENCE?.trim() ?? "";
  const expectedRepository = env.GITHUB_OIDC_REPOSITORY?.trim() ?? "";
  const expectedEnvironment = env.GITHUB_OIDC_ENVIRONMENT?.trim() ?? "";
  const expectedJobWorkflowRef = env.GITHUB_OIDC_JOB_WORKFLOW_REF?.trim() ?? "";
  if (
    !expectedAudience ||
    !expectedRepository ||
    !expectedEnvironment ||
    !expectedJobWorkflowRef
  ) {
    return null;
  }
  return {
    expectedAudience,
    expectedRepository,
    expectedEnvironment,
    expectedJobWorkflowRef,
  };
}

export function getGithubActionsOidcJwksResolver(): JWTVerifyGetKey {
  cachedResolver ??= createRemoteJWKSet(new URL(GITHUB_ACTIONS_OIDC_JWKS));
  return cachedResolver;
}

export async function verifyGithubActionsOidc(
  token: string | null | undefined,
  config: GithubActionsOidcConfig,
  keyResolver: JWTVerifyGetKey | CryptoKey | Uint8Array = getGithubActionsOidcJwksResolver(),
): Promise<GithubActionsOidcResult> {
  if (!token?.trim()) return { ok: false, reason: "MISSING_TOKEN" };

  try {
    const { payload } = await jwtVerify(token, keyResolver, {
      issuer: GITHUB_ACTIONS_OIDC_ISSUER,
      audience: config.expectedAudience,
      algorithms: ["RS256"],
      clockTolerance: 0,
    });

    const repository =
      typeof payload.repository === "string" ? payload.repository.trim() : "";
    const environment =
      typeof payload.environment === "string" ? payload.environment.trim() : "";
    const jobWorkflowRef =
      typeof payload.job_workflow_ref === "string" ? payload.job_workflow_ref.trim() : "";
    const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";

    if (repository !== config.expectedRepository) {
      return { ok: false, reason: "UNEXPECTED_REPOSITORY" };
    }
    if (environment !== config.expectedEnvironment) {
      return { ok: false, reason: "UNEXPECTED_ENVIRONMENT" };
    }
    if (jobWorkflowRef !== config.expectedJobWorkflowRef) {
      return { ok: false, reason: "UNEXPECTED_WORKFLOW" };
    }
    if (!subject) return { ok: false, reason: "INVALID_TOKEN" };

    return {
      ok: true,
      claims: {
        subject,
        repository,
        environment,
        jobWorkflowRef,
      },
    };
  } catch {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
}
