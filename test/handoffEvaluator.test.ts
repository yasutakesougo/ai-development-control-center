import { describe, expect, it } from "vitest";
import type { ArchitectureSnapshot } from "../src/domain/architectureSnapshot";
import {
  classifySnapshotStaleness,
  evaluateHandoff,
  isArchitectureRelevantPath,
  resolveHandoffNextAction,
  stableHandoffProjection,
} from "../src/domain/handoffEvaluator";
import { formatHandoffHumanReport } from "../src/domain/formatHandoffReport";
import type { HandoffLiveState } from "../src/domain/handoffReport";

function fact(
  id: string,
  name: string,
  responsibility: string,
  status: "confirmed" | "assumed" | "unknown" = "confirmed",
  evidence: string[] = [`evidence/${id}.ts`],
) {
  return { id, name, responsibility, status, confidence: "high" as const, evidence };
}

function makeSnapshot(overrides: Partial<ArchitectureSnapshot> = {}): ArchitectureSnapshot {
  return {
    schemaVersion: "1.0",
    generatedFrom: {
      repository: "ai-development-control-center",
      commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      generatedAt: "2026-08-11T00:00:00.000Z",
      generator: "ARCH-SNAPSHOT-GEN-V1",
    },
    confidence: { overall: "high", notes: ["fixture"] },
    components: [fact("worker-router", "Worker entry/router", "Routes requests.")],
    dependencies: [],
    flows: [],
    externalSystems: [fact("ext-github", "GitHub", "Read-only observation.")],
    humanGates: [
      fact(
        "gate-human-decision",
        "Explicit Human decision",
        "Write requires confirmed evidence and authorized Human.",
      ),
    ],
    holds: [
      fact(
        "hold-execution",
        "Execution disabled",
        "Ledger records declare externalEffect=false.",
      ),
    ],
    decisions: [fact("decision-fail-closed", "Fail closed", "Incomplete evidence denies progress.")],
    unknowns: [
      fact(
        "unknown-action-gateway",
        "Action Gateway contract",
        "No Action Gateway implementation exists.",
        "unknown",
      ),
      fact(
        "unknown-agent-execution",
        "Agent execution path",
        "No Agent execution path is implemented.",
        "unknown",
      ),
    ],
    assumptions: [
      fact(
        "assumption-target-repository",
        "Observation target remains configured in code",
        "Target repository assumption.",
        "assumed",
      ),
    ],
    staleIndicators: [
      fact("stale-worker", "Worker sources changed", "Treat changes under src/worker/** as relevant."),
    ],
    ...overrides,
  };
}

function liveOk(
  overrides: Partial<HandoffLiveState> = {},
): HandoffLiveState {
  return {
    evidenceState: "CONFIRMED",
    currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    openPullRequests: [],
    errors: [],
    sourceRefs: ["github:repo:yasutakesougo/ai-development-control-center"],
    ...overrides,
  };
}

describe("HANDOFF-V1 evaluator", () => {
  it("reports current when snapshot SHA equals current SHA", () => {
    const sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const report = evaluateHandoff({
      snapshot: makeSnapshot(),
      currentMain: sha,
      changedPaths: [],
      live: liveOk({ currentMain: sha }),
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(report.snapshot.stale).toBe(false);
    expect(report.snapshot.classification).toBe("current");
    expect(report.snapshot.staleReasons).toEqual([]);
    expect(report.currentMain).toBe(sha);
  });

  it("reports stale when snapshot SHA differs from current SHA", () => {
    const report = evaluateHandoff({
      snapshot: makeSnapshot(),
      currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      changedPaths: ["README.md"],
      live: liveOk(),
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(report.snapshot.stale).toBe(true);
    expect(report.snapshot.generatedFrom).not.toBe(report.currentMain);
  });

  it("classifies stale difference with no relevant architecture impact", () => {
    const result = classifySnapshotStaleness({
      generatedFrom: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      changedPaths: ["docs/architecture/architecture.json", "docs/architecture/architecture.html"],
    });

    expect(result.stale).toBe(true);
    expect(result.classification).toBe("stale_no_architecture_impact");
    expect(result.architectureRelevantPaths).toEqual([]);
  });

  it("detects relevant architecture change", () => {
    expect(isArchitectureRelevantPath("src/worker/index.ts")).toBe(true);
    const result = classifySnapshotStaleness({
      generatedFrom: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      changedPaths: ["src/worker/index.ts", "docs/architecture/README.md"],
    });

    expect(result.stale).toBe(true);
    expect(result.classification).toBe("stale_architecture_affecting");
    expect(result.architectureRelevantPaths).toEqual(["src/worker/index.ts"]);
  });

  it("returns UNKNOWN when evidence is insufficient for staleness", () => {
    const missingMain = classifySnapshotStaleness({
      generatedFrom: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      currentMain: null,
      changedPaths: [],
    });
    expect(missingMain.classification).toBe("UNKNOWN");
    expect(missingMain.stale).toBeNull();

    const missingPaths = classifySnapshotStaleness({
      generatedFrom: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      changedPaths: null,
    });
    expect(missingPaths.classification).toBe("UNKNOWN");
    expect(missingPaths.stale).toBeNull();
  });

  it("preserves confirmed / assumption / unknown separation from architecture.json", () => {
    const report = evaluateHandoff({
      snapshot: makeSnapshot(),
      currentMain: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      changedPaths: [],
      live: liveOk({ currentMain: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(report.confirmed.every((item) => item.status === "confirmed")).toBe(true);
    expect(report.assumptions).toEqual([
      expect.objectContaining({ id: "assumption-target-repository", status: "assumed" }),
    ]);
    expect(report.unknowns.every((item) => item.status === "unknown")).toBe(true);
    expect(report.unknowns.map((item) => item.id)).toEqual([
      "unknown-action-gateway",
      "unknown-agent-execution",
    ]);
    // Never promote unknowns/assumptions into confirmed.
    expect(report.confirmed.some((item) => item.id.startsWith("unknown-"))).toBe(false);
    expect(report.confirmed.some((item) => item.id.startsWith("assumption-"))).toBe(false);
  });

  it("does not manufacture ACTION_REQUIRED from ordinary open/Draft PRs", () => {
    const live = liveOk({
      openPullRequests: [
        {
          number: 21,
          title: "chore: backlog chore",
          draft: true,
          ci: "UNKNOWN",
          review: "UNKNOWN",
          humanDecisionState: "UNRESOLVED",
          humanDecisionRequired: null,
        },
        {
          number: 22,
          title: "feat: ordinary ready PR",
          draft: false,
          ci: "PASS",
          review: "PASS",
          humanDecisionState: "NONE",
          humanDecisionRequired: false,
        },
      ],
    });

    const action = resolveHandoffNextAction(live);
    expect(action.status).toBe("NO_ACTION");

    const report = evaluateHandoff({
      snapshot: makeSnapshot(),
      currentMain: live.currentMain,
      changedPaths: ["README.md"],
      live,
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });
    expect(report.nextAction.status).toBe("NO_ACTION");
    expect(report.liveDifferences.some((diff) => diff.id === "diff-pr-21")).toBe(true);
    expect(report.liveDifferences.some((diff) => diff.id === "diff-pr-22")).toBe(true);
  });

  it("surfaces Human Gates and HOLDs from the snapshot", () => {
    const report = evaluateHandoff({
      snapshot: makeSnapshot(),
      currentMain: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      changedPaths: [],
      live: liveOk({ currentMain: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(report.humanGates.map((item) => item.id)).toContain("gate-human-decision");
    expect(report.holds.map((item) => item.id)).toContain("hold-execution");
  });

  it("preserves forbidden capabilities and does not invent authorization", () => {
    const report = evaluateHandoff({
      snapshot: makeSnapshot(),
      currentMain: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      changedPaths: [],
      live: liveOk({ currentMain: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });

    const ids = report.forbiddenCapabilities.map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "forbid-github-mutation",
        "forbid-cloudflare-mutation",
        "forbid-ledger-write",
        "forbid-action-gateway",
        "forbid-agent-execution",
        "unknown-action-gateway",
        "unknown-agent-execution",
        "hold-execution",
      ]),
    );
  });

  it("fail-closes next action when live observation fails", () => {
    expect(resolveHandoffNextAction(null).status).toBe("UNKNOWN");
    expect(
      resolveHandoffNextAction({
        evidenceState: "ERROR",
        currentMain: null,
        openPullRequests: null,
        errors: ["GitHub API request failed"],
        sourceRefs: ["handoff:live"],
      }).status,
    ).toBe("UNKNOWN");

    const report = evaluateHandoff({
      snapshot: makeSnapshot(),
      currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      changedPaths: null,
      live: null,
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });
    expect(report.nextAction.status).toBe("UNKNOWN");
    expect(report.snapshot.classification).toBe("UNKNOWN");
  });

  it("requires only repository-native inputs (no prior conversation context)", () => {
    // This test intentionally constructs the report solely from snapshot + git/live fixtures.
    const report = evaluateHandoff({
      snapshot: makeSnapshot(),
      currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      changedPaths: ["docs/architecture/architecture.json"],
      live: liveOk(),
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(report.schemaVersion).toBe("1.0");
    expect(report.snapshot.generatedFrom).toBe(report.snapshot.generatedFrom);
    expect(report.assumptions.length).toBeGreaterThan(0);
    expect(report.unknowns.length).toBeGreaterThan(0);
    expect(Object.keys(report)).toEqual(
      expect.arrayContaining([
        "confirmed",
        "assumptions",
        "unknowns",
        "liveDifferences",
        "humanGates",
        "holds",
        "forbiddenCapabilities",
        "nextAction",
      ]),
    );
  });

  it("produces structurally stable output for equivalent inputs aside from evaluatedAt", () => {
    const input = {
      snapshot: makeSnapshot(),
      currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as string | null,
      changedPaths: ["docs/architecture/architecture.html"],
      live: liveOk(),
    };

    const first = evaluateHandoff({ ...input, evaluatedAt: "2026-08-12T00:00:00.000Z" });
    const second = evaluateHandoff({ ...input, evaluatedAt: "2026-08-12T01:00:00.000Z" });

    expect(stableHandoffProjection(first)).toEqual(stableHandoffProjection(second));
    expect(first.evaluatedAt).not.toBe(second.evaluatedAt);
  });

  it("emits ACTION_REQUIRED only for explicit confirmed Human-Decision REQUIRED gates", () => {
    const action = resolveHandoffNextAction(
      liveOk({
        openPullRequests: [
          {
            number: 30,
            title: "needs human decision",
            draft: false,
            ci: "PASS",
            review: "PASS",
            humanDecisionState: "REQUIRED",
            humanDecisionRequired: true,
          },
        ],
      }),
    );
    expect(action.status).toBe("ACTION_REQUIRED");

    const unproven = resolveHandoffNextAction(
      liveOk({
        openPullRequests: [
          {
            number: 31,
            title: "required but CI unknown",
            draft: false,
            ci: "UNKNOWN",
            review: "PASS",
            humanDecisionState: "REQUIRED",
            humanDecisionRequired: true,
          },
        ],
      }),
    );
    expect(unproven.status).toBe("UNKNOWN");
  });

  it("renders a concise Human-readable handoff with required sections", () => {
    const report = evaluateHandoff({
      snapshot: makeSnapshot(),
      currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      changedPaths: ["docs/architecture/architecture.json"],
      live: liveOk(),
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });
    const human = formatHandoffHumanReport(report);

    for (const section of [
      "## CURRENT",
      "## SNAPSHOT STATUS",
      "## LIVE DIFFERENCES",
      "## HUMAN GATES",
      "## HOLDS",
      "## UNKNOWN",
      "## NEXT ACTION",
      "## FORBIDDEN",
    ]) {
      expect(human).toContain(section);
    }
  });
});
