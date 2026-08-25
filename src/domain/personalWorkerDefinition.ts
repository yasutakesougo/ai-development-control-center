/**
 * PERSONAL-WORKER-DEFINITION-V1 contract helpers.
 *
 * Slice A only: parse + validate one local worker definition.
 * No evaluator, Human approval execution, audit writer, Agent invocation,
 * GitHub mutation, Ready/Merge automation, Deploy, or external send.
 */

export const PERSONAL_WORKER_DEFINITION_SCHEMA =
  "PERSONAL-WORKER-DEFINITION-V1" as const;

export const PERSONAL_WORKER_ROLES = [
  "ORCHESTRATOR",
  "DEVELOPER",
  "REVIEWER",
  "VERIFIER",
] as const;

export const PERSONAL_WORKER_LIFECYCLES = ["ACTIVE", "DISABLED"] as const;

export const PERSONAL_AUTONOMY_LEVELS = [
  "A0_OBSERVE",
  "A1_PROPOSE",
  "A2_EXECUTE_APPROVED_ACTION",
  "A3_EXECUTE_APPROVED_SCOPE",
  "A4_EXECUTE_BOUNDED",
] as const;

export const PERSONAL_RISK_TIERS = ["LOW", "MEDIUM", "HIGH"] as const;

export const PERSONAL_WORKER_SERVICES = [
  "CHATGPT",
  "CURSOR",
  "GITHUB_COPILOT",
  "OPENCODE",
  "CUSTOM",
] as const;

export const PERSONAL_WORKER_ID_MAX = 128 as const;
export const PERSONAL_WORKER_OWNER_MAX = 128 as const;
export const PERSONAL_WORKER_MODEL_MAX = 128 as const;
export const PERSONAL_ACTION_ID_MAX = 128 as const;
export const PERSONAL_RESOURCE_PATTERN_MAX = 512 as const;
export const PERSONAL_AUTHORITY_RULES_MAX = 64 as const;
export const PERSONAL_HUMAN_GATES_MAX = 64 as const;

export const PERSONAL_WORKER_ROOT_KEYS = [
  "schemaVersion",
  "workerId",
  "owner",
  "role",
  "lifecycle",
  "autonomy",
  "riskTier",
  "service",
  "model",
  "authority",
  "humanGates",
] as const;

export const PERSONAL_AUTHORITY_KEYS = ["allow", "deny"] as const;
export const PERSONAL_AUTHORITY_RULE_KEYS = ["action", "resource"] as const;
export const PERSONAL_HUMAN_GATE_RULE_KEYS = ["action", "resource"] as const;

export const PERSONAL_WORKER_EVALUATOR_IMPLEMENTED = false as const;
export const PERSONAL_HUMAN_GATE_EXECUTION_IMPLEMENTED = false as const;
export const PERSONAL_AUDIT_WRITER_IMPLEMENTED = false as const;
export const PERSONAL_EXTERNAL_EXECUTION_IMPLEMENTED = false as const;

export type PersonalWorkerRoleV1 = (typeof PERSONAL_WORKER_ROLES)[number];
export type PersonalWorkerLifecycleV1 =
  (typeof PERSONAL_WORKER_LIFECYCLES)[number];
export type PersonalAutonomyV1 = (typeof PERSONAL_AUTONOMY_LEVELS)[number];
export type PersonalRiskTierV1 = (typeof PERSONAL_RISK_TIERS)[number];
export type PersonalWorkerServiceV1 =
  (typeof PERSONAL_WORKER_SERVICES)[number];

export interface PersonalAuthorityRuleV1 {
  action: string;
  resource: string;
}

export interface PersonalHumanGateRuleV1 {
  action: string;
  resource?: string;
}

export interface PersonalWorkerDefinitionV1 {
  schemaVersion: typeof PERSONAL_WORKER_DEFINITION_SCHEMA;
  workerId: string;
  owner: string;
  role: PersonalWorkerRoleV1;
  lifecycle: PersonalWorkerLifecycleV1;
  autonomy: PersonalAutonomyV1;
  riskTier: PersonalRiskTierV1;
  service: PersonalWorkerServiceV1;
  model?: string;
  authority: {
    allow: PersonalAuthorityRuleV1[];
    deny: PersonalAuthorityRuleV1[];
  };
  humanGates: PersonalHumanGateRuleV1[];
}

const WORKER_ID_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const ACTION_ID_PATTERN =
  /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;

/**
 * Broad authority shortcuts remain forbidden even when syntactically valid.
 * Single-segment tool names such as github/shell/browser already fail grammar.
 */
const FORBIDDEN_ACTION_IDS = new Set(["agent.execute"]);

/** Characters reserved for pattern languages that V1 intentionally does not support. */
const UNSUPPORTED_RESOURCE_PATTERN_CHARS = /[?\[\]{}()^$+\\]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}

export function isPersonalActionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= PERSONAL_ACTION_ID_MAX &&
    ACTION_ID_PATTERN.test(value) &&
    !FORBIDDEN_ACTION_IDS.has(value)
  );
}

/**
 * V1 supports only exact, one bounded terminal wildcard, or global `*`.
 * No glob library semantics, regex, normalization, or case folding are implied.
 */
export function isPersonalResourcePattern(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > PERSONAL_RESOURCE_PATTERN_MAX
  ) {
    return false;
  }

  if (value === "*") return true;
  if (UNSUPPORTED_RESOURCE_PATTERN_CHARS.test(value)) return false;

  const firstStar = value.indexOf("*");
  if (firstStar === -1) return true;

  if (firstStar !== value.length - 1) return false;
  if (value.indexOf("*", firstStar + 1) !== -1) return false;
  if (value.length < 2) return false;

  const beforeStar = value[value.length - 2];
  return beforeStar === "/" || beforeStar === ":";
}

function isAuthorityRule(value: unknown): value is PersonalAuthorityRuleV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, PERSONAL_AUTHORITY_RULE_KEYS)) return false;
  return isPersonalActionId(value.action) && isPersonalResourcePattern(value.resource);
}

function isHumanGateRule(value: unknown): value is PersonalHumanGateRuleV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, PERSONAL_HUMAN_GATE_RULE_KEYS)) return false;
  if (!isPersonalActionId(value.action)) return false;
  if (value.resource !== undefined && !isPersonalResourcePattern(value.resource)) {
    return false;
  }
  return true;
}

function hasDuplicateAuthorityRules(values: PersonalAuthorityRuleV1[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = `${value.action}\u0000${value.resource}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function hasDuplicateHumanGateRules(values: PersonalHumanGateRuleV1[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = JSON.stringify([value.action, value.resource ?? null]);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function parseAuthority(value: unknown):
  | {
      ok: true;
      authority: PersonalWorkerDefinitionV1["authority"];
    }
  | { ok: false; reasonMessage: string } {
  if (!isPlainObject(value) || !hasOnlyKeys(value, PERSONAL_AUTHORITY_KEYS)) {
    return { ok: false, reasonMessage: "authority must contain only allow and deny." };
  }

  if (!Array.isArray(value.allow) || !Array.isArray(value.deny)) {
    return { ok: false, reasonMessage: "authority.allow and authority.deny must be arrays." };
  }

  if (
    value.allow.length > PERSONAL_AUTHORITY_RULES_MAX ||
    value.deny.length > PERSONAL_AUTHORITY_RULES_MAX
  ) {
    return { ok: false, reasonMessage: "authority rule arrays exceed the V1 maximum." };
  }

  if (!value.allow.every(isAuthorityRule) || !value.deny.every(isAuthorityRule)) {
    return { ok: false, reasonMessage: "authority contains a malformed rule." };
  }

  const allow = value.allow as PersonalAuthorityRuleV1[];
  const deny = value.deny as PersonalAuthorityRuleV1[];

  if (hasDuplicateAuthorityRules(allow) || hasDuplicateAuthorityRules(deny)) {
    return { ok: false, reasonMessage: "authority contains duplicate rules." };
  }

  return { ok: true, authority: { allow, deny } };
}

function parseHumanGates(value: unknown):
  | { ok: true; humanGates: PersonalHumanGateRuleV1[] }
  | { ok: false; reasonMessage: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reasonMessage: "humanGates must be an array." };
  }
  if (value.length > PERSONAL_HUMAN_GATES_MAX) {
    return { ok: false, reasonMessage: "humanGates exceeds the V1 maximum." };
  }
  if (!value.every(isHumanGateRule)) {
    return { ok: false, reasonMessage: "humanGates contains a malformed rule." };
  }

  const humanGates = value as PersonalHumanGateRuleV1[];
  if (hasDuplicateHumanGateRules(humanGates)) {
    return { ok: false, reasonMessage: "humanGates contains duplicate rules." };
  }

  return { ok: true, humanGates };
}

/** JSON text adapter. YAML may later parse to an object and call the same validator. */
export function parsePersonalWorkerJsonBody(raw: unknown):
  | { ok: true; value: unknown }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (typeof raw !== "string") {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Personal worker body must be a UTF-8 JSON string.",
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Personal worker body is not valid JSON syntax.",
    };
  }
}

/**
 * Structural fail-closed parser for the serialization-independent V1 object.
 * It validates declarations only and grants zero execution authority.
 */
export function parsePersonalWorkerDefinitionV1(value: unknown):
  | { ok: true; worker: PersonalWorkerDefinitionV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Personal worker definition must be an object.",
    };
  }

  if (!hasOnlyKeys(value, PERSONAL_WORKER_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Personal worker definition contains unknown properties.",
    };
  }

  if (value.schemaVersion !== PERSONAL_WORKER_DEFINITION_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${PERSONAL_WORKER_DEFINITION_SCHEMA}.`,
    };
  }

  if (
    typeof value.workerId !== "string" ||
    !WORKER_ID_PATTERN.test(value.workerId)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "workerId is missing or malformed.",
    };
  }

  if (!isBoundedString(value.owner, 1, PERSONAL_WORKER_OWNER_MAX)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "owner must be a non-empty bounded string.",
    };
  }

  if (!isOneOf(value.role, PERSONAL_WORKER_ROLES)) {
    return { ok: false, reasonCode: "REJECTED_SCHEMA", reasonMessage: "role is invalid." };
  }
  if (!isOneOf(value.lifecycle, PERSONAL_WORKER_LIFECYCLES)) {
    return { ok: false, reasonCode: "REJECTED_SCHEMA", reasonMessage: "lifecycle is invalid." };
  }
  if (!isOneOf(value.autonomy, PERSONAL_AUTONOMY_LEVELS)) {
    return { ok: false, reasonCode: "REJECTED_SCHEMA", reasonMessage: "autonomy is invalid." };
  }
  if (!isOneOf(value.riskTier, PERSONAL_RISK_TIERS)) {
    return { ok: false, reasonCode: "REJECTED_SCHEMA", reasonMessage: "riskTier is invalid." };
  }
  if (!isOneOf(value.service, PERSONAL_WORKER_SERVICES)) {
    return { ok: false, reasonCode: "REJECTED_SCHEMA", reasonMessage: "service is invalid." };
  }

  const model = value.model;
  if (
    model !== undefined &&
    !isBoundedString(model, 1, PERSONAL_WORKER_MODEL_MAX)
  ) {
    return { ok: false, reasonCode: "REJECTED_SCHEMA", reasonMessage: "model is malformed." };
  }

  const authority = parseAuthority(value.authority);
  if (authority.ok === false) {
    return { ok: false, reasonCode: "REJECTED_SCHEMA", reasonMessage: authority.reasonMessage };
  }

  const humanGates = parseHumanGates(value.humanGates);
  if (humanGates.ok === false) {
    return { ok: false, reasonCode: "REJECTED_SCHEMA", reasonMessage: humanGates.reasonMessage };
  }

  return {
    ok: true,
    worker: {
      schemaVersion: PERSONAL_WORKER_DEFINITION_SCHEMA,
      workerId: value.workerId,
      owner: value.owner,
      role: value.role,
      lifecycle: value.lifecycle,
      autonomy: value.autonomy,
      riskTier: value.riskTier,
      service: value.service,
      ...(model === undefined ? {} : { model }),
      authority: authority.authority,
      humanGates: humanGates.humanGates,
    },
  };
}
