/**
 * AUTO-REFRESH-PILOT-V1 — manual/explicit runner.
 *
 * observe → evaluate → regenerate → verify → optional Draft PR → STOP
 *
 * No cron. No push trigger. No Ready/Merge. No Action Gateway / Agent execution.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isArchitectureSnapshot } from "../src/domain/architectureSnapshot";
import {
  evaluateAutoRefresh,
  hasMaterialSnapshotDiff,
  SNAPSHOT_GENERATOR_VERSION,
  type ExistingRefreshPr,
} from "../src/domain/autoRefreshContract";
import {
  AUTO_REFRESH_PILOT,
  decidePilotPublication,
  formatRefreshIdentityMarker,
  mapReportToPilotEligibility,
  parseRefreshIdentityFromBody,
  recheckMain,
} from "../src/domain/autoRefreshPilot";
import {
  assertPilotPublisherCannotReadyOrMerge,
  createDraftPullRequest,
  listOpenPullRequests,
} from "../src/domain/autoRefreshPublisher";
import { writeSnapshot } from "./generate-architecture-snapshot.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = resolve(root, "docs/architecture/architecture.json");
const defaultOutDir = resolve(root, "docs/architecture");

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function readCurrentMain(): string | null {
  try {
    try {
      return git(["rev-parse", "origin/main"]);
    } catch {
      return git(["rev-parse", "main"]);
    }
  } catch {
    return null;
  }
}

function readChangedPaths(fromCommit: string, toCommit: string): string[] | null {
  try {
    const output = git(["diff", "--name-only", `${fromCommit}..${toCommit}`]);
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

function runNpm(script: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync("npm", ["run", script], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    });
    return { ok: true, output };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? "npm run failed"}`,
    };
  }
}

function parseArgs(argv: string[]): {
  publish: boolean;
  skipLive: boolean;
  jsonOut: string;
} {
  let publish = false;
  let skipLive = false;
  let jsonOut = resolve(defaultOutDir, "auto-refresh-pilot-result.json");
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--publish") publish = true;
    else if (arg === "--skip-live") skipLive = true;
    else if (arg === "--json-out") jsonOut = resolve(argv[++i]);
  }
  return { publish, skipLive, jsonOut };
}

async function main(): Promise<void> {
  assertPilotPublisherCannotReadyOrMerge();
  const args = parseArgs(process.argv.slice(2));
  const evaluatedAt = new Date().toISOString();

  const raw = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (!isArchitectureSnapshot(raw)) {
    throw new Error("docs/architecture/architecture.json is not a valid Architecture Snapshot");
  }

  const startMain = readCurrentMain();
  const generatedFrom = raw.generatedFrom.commit as string;
  const changedPaths =
    startMain === null ? null : readChangedPaths(generatedFrom, startMain);
  const repository = `yasutakesougo/${raw.generatedFrom.repository}`;
  const [owner, repo] = repository.split("/");

  let existingRefreshPrs: ExistingRefreshPr[] | null = [];
  let existingPrObservationFailed = false;
  if (!args.skipLive) {
    try {
      const token = process.env.GITHUB_TOKEN;
      const pulls = await listOpenPullRequests({ owner, repo, token });
      existingRefreshPrs = pulls
        .map((pr) => {
          const identity = parseRefreshIdentityFromBody(pr.body);
          if (!identity) return null;
          return {
            number: pr.number,
            refreshIdentity: identity,
            state: pr.draft ? ("DRAFT" as const) : ("READY" as const),
            targetMainSha: identity.split("::")[2] ?? "",
          };
        })
        .filter((pr): pr is ExistingRefreshPr => pr !== null);
    } catch {
      existingPrObservationFailed = true;
      existingRefreshPrs = null;
    }
  }

  // Pre-generation eligibility (verification not run yet).
  let report = evaluateAutoRefresh({
    repository,
    observedMain: startMain,
    snapshotGeneratedFrom: generatedFrom,
    changedPaths,
    existingRefreshPrs,
    existingPrObservationFailed,
    handoffStaleClassification: null,
    materialSnapshotDiff: null,
    evaluatedAt,
  });

  let eligibility = mapReportToPilotEligibility(report);
  const result: Record<string, unknown> = {
    schemaVersion: "1.0",
    pilot: AUTO_REFRESH_PILOT,
    persistentAutoRefresh: "NOT_ENABLED",
    ready: "NOT_AUTHORIZED",
    merge: "NOT_AUTHORIZED",
    evaluatedAt,
    observedMain: startMain,
    snapshotGeneratedFrom: generatedFrom,
    eligibility,
    architectureRelevantPaths: report.sourceArchitectureRelevantPaths,
    refreshIdentity: report.refreshIdentity,
    autoRefreshStatus: report.status,
    nextAction: report.nextAction,
    reason: report.reason,
    approvalActionRequired: report.approvalActionRequired,
    generation: "NOT_RUN",
    handoff: "NOT_RUN",
    verification: "NOT_RUN",
    mainRecheck: "NOT_RUN",
    duplicateRefreshPr: existingPrObservationFailed
      ? "NOT_CHECKED"
      : report.nextAction === "REUSE_EXISTING_DRAFT"
        ? "FOUND"
        : "NONE",
    publicationDecision: "NO_PUBLICATION",
    draftPrUrl: null,
    draftPrHead: null,
  };

  const shouldAttemptGeneration =
    eligibility === "REFRESH_ELIGIBLE" &&
    (report.nextAction === "CREATE_DRAFT" || report.nextAction === "REUSE_EXISTING_DRAFT");

  if (!shouldAttemptGeneration || !startMain) {
    writeResult(args.jsonOut, result);
    printSummary(result);
    return;
  }

  if (report.nextAction === "REUSE_EXISTING_DRAFT") {
    result.publicationDecision = "REUSED_EXISTING";
    result.draftPrUrl = report.existingRefreshPr
      ? `https://github.com/${repository}/pull/${report.existingRefreshPr.number}`
      : null;
    writeResult(args.jsonOut, result);
    printSummary(result);
    return;
  }

  // Regenerate Snapshot from exact observed main SHA (not feature-branch HEAD).
  const beforeSnapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  writeSnapshot({ commit: startMain });
  const afterSnapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  result.generation = afterSnapshot.generatedFrom?.commit === startMain ? "PASS" : "FAIL";

  if (afterSnapshot.generatedFrom?.commit !== startMain) {
    result.eligibility = "HOLD";
    result.publicationDecision = "HOLD";
    result.reason = "generatedFrom.commit does not match source main after regeneration";
    writeResult(args.jsonOut, result);
    printSummary(result);
    process.exitCode = 1;
    return;
  }

  const materialDiff = hasMaterialSnapshotDiff(beforeSnapshot, afterSnapshot);

  const handoffRun = runNpm("handoff");
  result.handoff = handoffRun.ok ? "PASS" : "FAIL";

  const verifyRun = runNpm("verify");
  result.verification = verifyRun.ok ? "PASS" : "FAIL";

  const verificationPassed =
    result.generation === "PASS" && handoffRun.ok && verifyRun.ok;

  const recheck = recheckMain(startMain, readCurrentMain());
  result.mainRecheck = recheck;

  report = evaluateAutoRefresh({
    repository,
    observedMain: startMain,
    snapshotGeneratedFrom: generatedFrom,
    changedPaths,
    existingRefreshPrs,
    existingPrObservationFailed,
    materialSnapshotDiff: materialDiff,
    verification: {
      architectureSnapshot: result.generation === "PASS" ? "PASS" : "FAIL",
      handoff: handoffRun.ok ? "PASS" : "FAIL",
      verify: verifyRun.ok ? "PASS" : "FAIL",
    },
    mainMovedDuringRefreshTo: recheck === "MOVED" ? readCurrentMain() : null,
    evaluatedAt: new Date().toISOString(),
  });
  eligibility = mapReportToPilotEligibility(report);
  result.eligibility = eligibility;
  result.autoRefreshStatus = report.status;
  result.nextAction = report.nextAction;
  result.reason = report.reason;
  result.refreshIdentity = report.refreshIdentity;
  result.architectureRelevantPaths = report.sourceArchitectureRelevantPaths;
  result.approvalActionRequired = report.approvalActionRequired;

  const publication = decidePilotPublication({
    eligibility,
    nextAction: report.nextAction,
    mainRecheck: recheck,
    verificationPassed,
    materialSnapshotDiff: materialDiff,
  });
  result.publicationDecision = publication.decision;
  result.publicationReason = publication.reason;

  if (publication.decision === "ABORT_PUBLICATION") {
    result.eligibility = "HOLD";
  }

  if (args.publish && publication.decision === "PUBLISH_DRAFT" && report.refreshIdentity) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      result.publicationDecision = "HOLD";
      result.publicationReason = "GITHUB_TOKEN missing; cannot publish Draft PR";
      writeResult(args.jsonOut, result);
      printSummary(result);
      process.exitCode = 1;
      return;
    }

    const branch = git(["branch", "--show-current"]);
    const headSha = git(["rev-parse", "HEAD"]);
    // Expect caller to have committed regenerated artifacts on the pilot branch.
    const body = [
      "## AUTO-REFRESH-PILOT-V1",
      "",
      "Manual/explicit Architecture Snapshot refresh pilot.",
      "",
      `- observed / source main: \`${startMain}\``,
      `- prior generatedFrom: \`${generatedFrom}\``,
      `- new generatedFrom: \`${afterSnapshot.generatedFrom.commit}\``,
      `- ${formatRefreshIdentityMarker(report.refreshIdentity)}`,
      `- generatorVersion: \`${SNAPSHOT_GENERATOR_VERSION}\``,
      `- architecture-relevant source paths: ${report.sourceArchitectureRelevantPaths.map((p) => `\`${p}\``).join(", ")}`,
      "",
      "Persistent AUTO-REFRESH: **NOT ENABLED**",
      "Ready: **NOT AUTHORIZED**",
      "Merge: **NOT AUTHORIZED**",
      "",
      "This Draft stops for Human review.",
    ].join("\n");

    const created = await createDraftPullRequest({
      owner,
      repo,
      title: "docs(architecture): auto-refresh Snapshot pilot",
      body,
      head: branch,
      base: "main",
      token,
    });
    result.draftPrUrl = created.htmlUrl;
    result.draftPrHead = headSha;
    result.duplicateRefreshPr = "NONE";
  }

  writeResult(args.jsonOut, result);
  printSummary(result);

  if (
    result.publicationDecision === "HOLD" ||
    result.publicationDecision === "ABORT_PUBLICATION" ||
    result.generation === "FAIL" ||
    result.handoff === "FAIL" ||
    result.verification === "FAIL"
  ) {
    process.exitCode = 1;
  }
}

function writeResult(path: string, result: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
}

function printSummary(result: Record<string, unknown>): void {
  process.stdout.write(`# ${AUTO_REFRESH_PILOT}\n`);
  process.stdout.write(`- observedMain: ${result.observedMain}\n`);
  process.stdout.write(`- snapshotGeneratedFrom: ${result.snapshotGeneratedFrom}\n`);
  process.stdout.write(`- eligibility: ${result.eligibility}\n`);
  process.stdout.write(
    `- architectureRelevantPaths: ${JSON.stringify(result.architectureRelevantPaths)}\n`,
  );
  process.stdout.write(`- refreshIdentity: ${result.refreshIdentity}\n`);
  process.stdout.write(`- generation: ${result.generation}\n`);
  process.stdout.write(`- handoff: ${result.handoff}\n`);
  process.stdout.write(`- verification: ${result.verification}\n`);
  process.stdout.write(`- mainRecheck: ${result.mainRecheck}\n`);
  process.stdout.write(`- duplicateRefreshPr: ${result.duplicateRefreshPr}\n`);
  process.stdout.write(`- publicationDecision: ${result.publicationDecision}\n`);
  process.stdout.write(`- draftPrUrl: ${result.draftPrUrl}\n`);
  process.stdout.write(`- persistentAutoRefresh: ${result.persistentAutoRefresh}\n`);
  process.stdout.write(`- ready: ${result.ready}\n`);
  process.stdout.write(`- merge: ${result.merge}\n`);
  process.stdout.write(`- approvalActionRequired: ${result.approvalActionRequired}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
