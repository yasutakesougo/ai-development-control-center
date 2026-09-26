import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("AC7 infrastructure boundary materialization", () => {
  it("Main Worker has Service Bindings but no Production Authority-store or deploy-secret binding", () => {
    const config = read("../wrangler.jsonc");
    expect(config).toContain('"binding": "AUTHORITY_RECORDER"');
    expect(config).toContain('"binding": "AUTHORITY_EXECUTOR"');
    expect(config).not.toContain('"binding": "APPROVAL_DB"');
    expect(config).not.toContain('"binding": "RECEIPT_CONSUMPTION_DB"');
    expect(config).not.toContain("AUTHORIZATION_RECEIPT_SIGNING_KEY_PKCS8_B64");
    expect(config).not.toContain("CLOUDFLARE_API_TOKEN");
  });

  it("Recorder owns approval store only; Enforcer owns consumption store and public verify key only", () => {
    const recorder = read("../infrastructure/authority-recorder/wrangler.jsonc");
    const enforcer = read("../infrastructure/authority-execution-enforcer/wrangler.jsonc");

    expect(recorder).toContain('"binding": "APPROVAL_DB"');
    expect(recorder).not.toContain('"binding": "RECEIPT_CONSUMPTION_DB"');
    expect(recorder).not.toContain("CLOUDFLARE_API_TOKEN");

    expect(enforcer).toContain('"binding": "RECEIPT_CONSUMPTION_DB"');
    expect(enforcer).toContain("AUTHORIZATION_RECEIPT_VERIFY_KEY_SPKI_B64");
    expect(enforcer).not.toContain('"binding": "APPROVAL_DB"');
    expect(enforcer).not.toContain("AUTHORIZATION_RECEIPT_SIGNING_KEY_PKCS8_B64");
  });

  it("deployment gateway uses GitHub OIDC and contains no Cloudflare secret reference", () => {
    const workflow = read("../.github/workflows/main-deployment-gateway.yml");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("ACTIONS_ID_TOKEN_REQUEST_TOKEN");
    expect(workflow).not.toContain("CLOUDFLARE_API_TOKEN");
    expect(workflow).not.toMatch(/secrets\./);
  });

  it("production Environment IaC requires at least one Human reviewer", () => {
    const terraform = read("../infrastructure/github/production-environment.tf");
    expect(terraform).toContain('environment = "production"');
    expect(terraform).toContain("reviewers");
    expect(terraform).toContain("length(var.production_reviewer_user_ids) > 0");
  });
});
