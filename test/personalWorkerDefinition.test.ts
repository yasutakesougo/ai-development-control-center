import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PERSONAL_AUDIT_WRITER_IMPLEMENTED,
  PERSONAL_AUTONOMY_LEVELS,
  PERSONAL_EXTERNAL_EXECUTION_IMPLEMENTED,
  PERSONAL_HUMAN_GATE_EXECUTION_IMPLEMENTED,
  PERSONAL_RISK_TIERS,
  PERSONAL_WORKER_DEFINITION_SCHEMA,
  PERSONAL_WORKER_EVALUATOR_IMPLEMENTED,
  PERSONAL_WORKER_LIFECYCLES,
  PERSONAL_WORKER_ROLES,
  PERSONAL_WORKER_SERVICES,
  isPersonalActionId,
  isPersonalResourcePattern,
  parsePersonalWorkerDefinitionV1,
  parsePersonalWorkerJsonBody,
  type PersonalWorkerDefinitionV1,
} from "../src/domain/personalWorkerDefinition";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/personal-worker-definition/fixtures",
);

function validWorker(): PersonalWorkerDefinitionV1 {
  return JSON.parse(
    readFileSync(join(fixturesDir, "developer-valid.json"), "utf8"),
  ) as PersonalWorkerDefinitionV1;
}

describe("PERSONAL-WORKER-DEFINITION-V1", () => {
  it("keeps evaluator, Human Gate execution, audit writer, and external execution out of Slice A", () => {
    expect(PERSONAL_WORKER_EVALUATOR_IMPLEMENTED).toBe(false);
    expect(PERSONAL_HUMAN_GATE_EXECUTION_IMPLEMENTED).toBe(false);
    expect(PERSONAL_AUDIT_WRITER_IMPLEMENTED).toBe(false);
    expect(PERSONAL_EXTERNAL_EXECUTION_IMPLEMENTED).toBe(false);
  });

  it("locks the small V1 enum vocabularies", () => {
    expect(PERSONAL_WORKER_ROLES).toEqual([
      "ORCHESTRATOR",
      "DEVELOPER",
      "REVIEWER",
      "VERIFIER",
    ]);
    expect(PERSONAL_WORKER_LIFECYCLES).toEqual(["ACTIVE", "DISABLED"]);
    expect(PERSONAL_AUTONOMY_LEVELS).toEqual([
      "A0_OBSERVE",
      "A1_PROPOSE",
      "A2_EXECUTE_APPROVED_ACTION",
      "A3_EXECUTE_APPROVED_SCOPE",
      "A4_EXECUTE_BOUNDED",
    ]);
    expect(PERSONAL_RISK_TIERS).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(PERSONAL_WORKER_SERVICES).toEqual([
      "CHATGPT",
      "CURSOR",
      "GITHUB_COPILOT",
      "OPENCODE",
      "CUSTOM",
    ]);
  });

  it("parses the example fixture without granting runtime execution", () => {
    const parsed = parsePersonalWorkerDefinitionV1(validWorker());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.worker.schemaVersion).toBe(PERSONAL_WORKER_DEFINITION_SCHEMA);
    expect(parsed.worker.workerId).toBe("developer-01");
    expect(parsed.worker.authority.allow).toHaveLength(3);
    expect(parsed.worker.humanGates.map((gate) => gate.action)).toContain(
      "pull_request.ready",
    );
  });

  it("parses JSON text then validates the same object contract", () => {
    const body = parsePersonalWorkerJsonBody(JSON.stringify(validWorker()));
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(parsePersonalWorkerDefinitionV1(body.value).ok).toBe(true);

    expect(parsePersonalWorkerJsonBody("{").ok).toBe(false);
    expect(parsePersonalWorkerJsonBody({}).ok).toBe(false);
  });

  it("accepts the corrected action grammar and rejects broad authority shortcuts", () => {
    expect(isPersonalActionId("repository.read")).toBe(true);
    expect(isPersonalActionId("pull_request.ready")).toBe(true);
    expect(isPersonalActionId("pull_request.merge")).toBe(true);
    expect(isPersonalActionId("repository.branch-write")).toBe(true);

    expect(isPersonalActionId("github")).toBe(false);
    expect(isPersonalActionId("shell")).toBe(false);
    expect(isPersonalActionId("browser")).toBe(false);
    expect(isPersonalActionId("agent.execute")).toBe(false);
    expect(isPersonalActionId("Repository.read")).toBe(false);
    expect(isPersonalActionId("repository..read")).toBe(false);
  });

  it("supports only exact, bounded-prefix wildcard, and global resource forms", () => {
    expect(
      isPersonalResourcePattern(
        "github:yasutakesougo/ai-development-control-center",
      ),
    ).toBe(true);
    expect(isPersonalResourcePattern("github:yasutakesougo/*")).toBe(true);
    expect(isPersonalResourcePattern("local:*")).toBe(true);
    expect(isPersonalResourcePattern("*")).toBe(true);

    expect(isPersonalResourcePattern("github:*repo")).toBe(false);
    expect(isPersonalResourcePattern("github:**")).toBe(false);
    expect(isPersonalResourcePattern("github:owner/repo*")).toBe(false);
    expect(isPersonalResourcePattern("github:owner/?")).toBe(false);
    expect(isPersonalResourcePattern("github:owner/[ab]")).toBe(false);
  });

  it("fails closed on unknown root and nested keys", () => {
    expect(parsePersonalWorkerDefinitionV1({ ...validWorker(), extra: true }).ok).toBe(
      false,
    );

    const authorityExtra = validWorker();
    expect(
      parsePersonalWorkerDefinitionV1({
        ...authorityExtra,
        authority: { ...authorityExtra.authority, extra: true },
      }).ok,
    ).toBe(false);

    const ruleExtra = validWorker();
    expect(
      parsePersonalWorkerDefinitionV1({
        ...ruleExtra,
        authority: {
          ...ruleExtra.authority,
          allow: [
            ...ruleExtra.authority.allow,
            { action: "repository.read", resource: "local:*", extra: true },
          ],
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects malformed identities, enums, model values, actions, and resources", () => {
    expect(parsePersonalWorkerDefinitionV1({ ...validWorker(), workerId: "Developer" }).ok).toBe(
      false,
    );
    expect(parsePersonalWorkerDefinitionV1({ ...validWorker(), owner: "" }).ok).toBe(false);
    expect(parsePersonalWorkerDefinitionV1({ ...validWorker(), role: "ADMIN" }).ok).toBe(false);
    expect(parsePersonalWorkerDefinitionV1({ ...validWorker(), lifecycle: "UNKNOWN" }).ok).toBe(
      false,
    );
    expect(parsePersonalWorkerDefinitionV1({ ...validWorker(), autonomy: "A5" }).ok).toBe(false);
    expect(parsePersonalWorkerDefinitionV1({ ...validWorker(), riskTier: "CRITICAL" }).ok).toBe(
      false,
    );
    expect(parsePersonalWorkerDefinitionV1({ ...validWorker(), service: "OTHER" }).ok).toBe(false);
    expect(parsePersonalWorkerDefinitionV1({ ...validWorker(), model: "" }).ok).toBe(false);

    const badRule = validWorker();
    expect(
      parsePersonalWorkerDefinitionV1({
        ...badRule,
        authority: {
          ...badRule.authority,
          allow: [{ action: "agent.execute", resource: "local:*" }],
        },
      }).ok,
    ).toBe(false);

    const badResource = validWorker();
    expect(
      parsePersonalWorkerDefinitionV1({
        ...badResource,
        authority: {
          ...badResource.authority,
          allow: [{ action: "repository.read", resource: "github:**" }],
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects exact duplicates without silently deduplicating", () => {
    const duplicateAllow = validWorker();
    duplicateAllow.authority.allow.push({ ...duplicateAllow.authority.allow[0] });
    expect(parsePersonalWorkerDefinitionV1(duplicateAllow).ok).toBe(false);

    const duplicateDeny = validWorker();
    duplicateDeny.authority.deny.push({ ...duplicateDeny.authority.deny[0] });
    expect(parsePersonalWorkerDefinitionV1(duplicateDeny).ok).toBe(false);

    const duplicateGate = validWorker();
    duplicateGate.humanGates.push({ ...duplicateGate.humanGates[0] });
    expect(parsePersonalWorkerDefinitionV1(duplicateGate).ok).toBe(false);
  });

  it("enforces the V1 array bounds and permits empty declarations", () => {
    const empty = validWorker();
    empty.authority.allow = [];
    empty.authority.deny = [];
    empty.humanGates = [];
    expect(parsePersonalWorkerDefinitionV1(empty).ok).toBe(true);

    const tooMany = validWorker();
    tooMany.authority.allow = Array.from({ length: 65 }, (_, index) => ({
      action: `repository.read_${index}`,
      resource: "local:*",
    }));
    expect(parsePersonalWorkerDefinitionV1(tooMany).ok).toBe(false);
  });
});
