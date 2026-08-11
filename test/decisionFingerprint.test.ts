import { describe, expect, it } from "vitest";
import {
  buildDecisionFacts,
  canonicalJson,
  computeDecisionFingerprint,
  computeRecordableDecision,
} from "../src/domain/decisionFingerprint";
import type { HumanAction } from "../src/domain/humanAction";
import type { ObservedFacts, ObservedPullRequest } from "../src/domain/observedFacts";

function makePr(overrides: Partial<ObservedPullRequest> = {}): ObservedPullRequest {
  return {
    number: 7,
    title: "feat: something",
    draft: false,
    ci: "PASS",
    review: "PASS",
    mergeState: "CLEAN",
    humanDecisionRequired: true,
    humanDecisionEvidence: {
      state: "REQUIRED",
      source: "PR_BODY_MARKER",
      matchedMarkers: ["Human-Decision: REQUIRED"],
    },
    sourceRefs: ["https://github.com/o/r/pull/7"],
    ...overrides,
  };
}

function makeFacts(overrides: Partial<ObservedFacts> = {}): ObservedFacts {
  return {
    repository: "yasutakesougo/severe-behavior-support-spfx",
    observedAt: "2026-08-11T10:00:00.000Z",
    evidenceState: "CONFIRMED",
    currentMain: "abc123",
    openPullRequests: [makePr()],
    relevantIssueStates: {},
    errors: [],
    sourceRefs: ["github:repo:yasutakesougo/severe-behavior-support-spfx"],
    ...overrides,
  };
}

function makeAction(overrides: Partial<HumanAction> = {}): HumanAction {
  return {
    status: "ACTION_REQUIRED",
    title: "PR #7 の判断が必要です",
    instruction: "PRの内容を確認し、次のHuman Decisionを行ってください。",
    reason: "CIとReviewが完了し、明示的にHuman Decision待ちと確認されています。",
    sourceRefs: ["https://github.com/o/r/pull/7"],
    ...overrides,
  };
}

async function fingerprintOf(facts: ObservedFacts, action: HumanAction): Promise<string> {
  const decision = buildDecisionFacts(facts, action);
  expect(decision).not.toBeNull();
  return computeDecisionFingerprint(decision!);
}

describe("decision fingerprint canonicalization", () => {
  it("same facts / different observedAt ⇒ SAME fingerprint", async () => {
    const a = await fingerprintOf(makeFacts({ observedAt: "2026-08-11T10:00:00.000Z" }), makeAction());
    const b = await fingerprintOf(makeFacts({ observedAt: "2026-08-12T23:59:59.999Z" }), makeAction());
    expect(a).toBe(b);
  });

  it("same facts / non-semantic array ordering difference ⇒ SAME fingerprint", async () => {
    const pr = makePr({ sourceRefs: ["ref:b", "ref:a"] });
    const prReordered = makePr({ sourceRefs: ["ref:a", "ref:b"] });
    const action = makeAction({ sourceRefs: ["ref:2", "ref:1"] });
    const actionReordered = makeAction({ sourceRefs: ["ref:1", "ref:2"] });

    const a = await fingerprintOf(makeFacts({ openPullRequests: [pr] }), action);
    const b = await fingerprintOf(makeFacts({ openPullRequests: [prReordered] }), actionReordered);
    expect(a).toBe(b);
  });

  it("multiple PRs in different observation order ⇒ SAME fingerprint", async () => {
    const pr7 = makePr({ number: 7 });
    const pr9 = makePr({ number: 9, sourceRefs: ["https://github.com/o/r/pull/9"] });

    const a = await fingerprintOf(makeFacts({ openPullRequests: [pr7, pr9] }), makeAction());
    const b = await fingerprintOf(makeFacts({ openPullRequests: [pr9, pr7] }), makeAction());
    expect(a).toBe(b);
  });

  it("sourceRefs change ⇒ DIFFERENT fingerprint", async () => {
    const a = await fingerprintOf(makeFacts(), makeAction());
    const b = await fingerprintOf(
      makeFacts(),
      makeAction({ sourceRefs: ["https://github.com/o/r/pull/8"] }),
    );
    expect(a).not.toBe(b);
  });

  it("CI-relevant fact change ⇒ DIFFERENT fingerprint", async () => {
    const a = await fingerprintOf(makeFacts(), makeAction());
    const b = await fingerprintOf(
      makeFacts({ openPullRequests: [makePr({ ci: "FAIL" })] }),
      makeAction(),
    );
    expect(a).not.toBe(b);
  });

  it("review fact change ⇒ DIFFERENT fingerprint", async () => {
    const a = await fingerprintOf(makeFacts(), makeAction());
    const b = await fingerprintOf(
      makeFacts({ openPullRequests: [makePr({ review: "CHANGES_REQUESTED" })] }),
      makeAction(),
    );
    expect(a).not.toBe(b);
  });

  it("mergeState fact change ⇒ DIFFERENT fingerprint", async () => {
    const a = await fingerprintOf(makeFacts(), makeAction());
    const b = await fingerprintOf(
      makeFacts({ openPullRequests: [makePr({ mergeState: "BLOCKED" })] }),
      makeAction(),
    );
    expect(a).not.toBe(b);
  });

  it("humanDecision evidence change ⇒ DIFFERENT fingerprint", async () => {
    const a = await fingerprintOf(makeFacts(), makeAction());
    const b = await fingerprintOf(
      makeFacts({
        openPullRequests: [
          makePr({
            humanDecisionRequired: false,
            humanDecisionEvidence: {
              state: "NONE",
              source: "PR_BODY_MARKER",
              matchedMarkers: ["Human-Decision: NONE"],
            },
          }),
        ],
      }),
      makeAction(),
    );
    expect(a).not.toBe(b);
  });

  it("repository change ⇒ DIFFERENT fingerprint", async () => {
    const a = await fingerprintOf(makeFacts(), makeAction());
    const b = await fingerprintOf(makeFacts({ repository: "yasutakesougo/other-repo" }), makeAction());
    expect(a).not.toBe(b);
  });

  it("ACTION_REQUIRED change ⇒ no recordable fingerprint at all", async () => {
    for (const status of ["WAIT", "NO_ACTION", "UNKNOWN"] as const) {
      expect(buildDecisionFacts(makeFacts(), makeAction({ status }))).toBeNull();
    }
    expect(await computeRecordableDecision(makeFacts(), makeAction({ status: "WAIT" }))).toBeNull();
  });

  it("non-CONFIRMED evidence ⇒ no recordable fingerprint", () => {
    for (const evidenceState of ["MISSING", "CONTRADICTORY", "ERROR"] as const) {
      expect(buildDecisionFacts(makeFacts({ evidenceState }), makeAction())).toBeNull();
    }
  });

  it("fingerprint excludes approver identity, recordedAt, recordId, idempotencyKey and UI state", () => {
    const facts = buildDecisionFacts(makeFacts(), makeAction());
    const canonical = canonicalJson(facts);
    expect(canonical).not.toContain("observedAt");
    expect(canonical).not.toContain("approver");
    expect(canonical).not.toContain("recordedAt");
    expect(canonical).not.toContain("recordId");
    expect(canonical).not.toContain("idempotency");
  });

  it("canonical JSON sorts object keys deterministically", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, null] } })).toBe(
      '{"a":{"c":[3,null],"d":2},"b":1}',
    );
  });

  it("produces a 64-char lowercase SHA-256 hex fingerprint", async () => {
    const decision = await computeRecordableDecision(makeFacts(), makeAction());
    expect(decision).not.toBeNull();
    expect(decision!.decisionFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
