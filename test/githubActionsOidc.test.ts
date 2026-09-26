import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  GITHUB_ACTIONS_OIDC_ISSUER,
  verifyGithubActionsOidc,
  type GithubActionsOidcConfig,
} from "../src/worker/execution/githubActionsOidc";

const AUDIENCE = "loop-graph-authority-deploy-v1";
const REPOSITORY = "yasutakesougo/ai-development-control-center";
const ENVIRONMENT = "production";
const WORKFLOW =
  "yasutakesougo/ai-development-control-center/.github/workflows/main-deployment-gateway.yml@refs/heads/main";

const config: GithubActionsOidcConfig = {
  expectedAudience: AUDIENCE,
  expectedRepository: REPOSITORY,
  expectedEnvironment: ENVIRONMENT,
  expectedJobWorkflowRef: WORKFLOW,
};

async function token(
  privateKey: CryptoKey,
  overrides: Partial<{
    repository: string;
    environment: string;
    job_workflow_ref: string;
    audience: string;
  }> = {},
) {
  return new SignJWT({
    repository: overrides.repository ?? REPOSITORY,
    environment: overrides.environment ?? ENVIRONMENT,
    job_workflow_ref: overrides.job_workflow_ref ?? WORKFLOW,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(GITHUB_ACTIONS_OIDC_ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setSubject(`repo:${REPOSITORY}:environment:${ENVIRONMENT}`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("GitHub Actions OIDC verifier", () => {
  it("accepts only the bound repository, environment, workflow and audience", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const result = await verifyGithubActionsOidc(
      await token(privateKey),
      config,
      publicKey,
    );
    expect(result).toMatchObject({
      ok: true,
      claims: {
        repository: REPOSITORY,
        environment: ENVIRONMENT,
        jobWorkflowRef: WORKFLOW,
      },
    });
  });

  it("rejects wrong repository, environment, workflow, audience, or missing token", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");

    expect(await verifyGithubActionsOidc(null, config, publicKey)).toEqual({
      ok: false,
      reason: "MISSING_TOKEN",
    });

    expect(
      await verifyGithubActionsOidc(
        await token(privateKey, { repository: "other/repo" }),
        config,
        publicKey,
      ),
    ).toEqual({ ok: false, reason: "UNEXPECTED_REPOSITORY" });

    expect(
      await verifyGithubActionsOidc(
        await token(privateKey, { environment: "staging" }),
        config,
        publicKey,
      ),
    ).toEqual({ ok: false, reason: "UNEXPECTED_ENVIRONMENT" });

    expect(
      await verifyGithubActionsOidc(
        await token(privateKey, { job_workflow_ref: "other/workflow@refs/heads/main" }),
        config,
        publicKey,
      ),
    ).toEqual({ ok: false, reason: "UNEXPECTED_WORKFLOW" });

    expect(
      await verifyGithubActionsOidc(
        await token(privateKey, { audience: "wrong-audience" }),
        config,
        publicKey,
      ),
    ).toEqual({ ok: false, reason: "INVALID_TOKEN" });
  });
});
