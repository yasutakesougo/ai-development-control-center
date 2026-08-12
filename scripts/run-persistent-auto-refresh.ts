/**
 * PERSISTENT-AUTO-REFRESH-V1 — DISABLED-MODE runner.
 *
 * observe → evaluate → regenerate → verify → recheck main →
 * duplicate check → Draft publication capability → STOP
 *
 * Persistent AUTO-REFRESH remains NOT ENABLED (no push-to-main automatic execution).
 * workflow_dispatch / explicit CLI only. No Ready/Merge/close.
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
  formatRefreshIdentityMarker,
  parseRefreshIdentityFromBody,
  recheckMain,
} from "../src/domain/autoRefreshPilot";
import {
  createDraftPullRequest,
  listOpenPullRequests,
} from "../src/domain/autoRefreshPublisher";
import {
  assertGeneratedFromMatchesSourceMain,
  assertPersistentAutoRefreshNotEnabled,
  assertPersistentPublisherCannotReadyOrMerge,
  classifyPersistentDraftDisposition,
  classifyPersistentFailure,
  decidePersistentPublication,
  mayRetryPublication,
  PERSISTENT_AUTO_REFRESH_MODE,
  type PersistentAutoRefreshRunReport,
  type PersistentFailureClass,
} from "../src/domain/persistentAutoRefreshContract";
import { writeSnapshot } from "./generate-architecture-snapshot.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = resolve(root, "docs/architecture/architecture.json");
const defaultOutDir = resolve(root, "docs/architecture");
const snapshotArtifacts = [
  "docs/architecture/architecture.json",
  "docs/architecture/architecture.html",
] as const;

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
  let jsonOut = resolve(defaultOutDir, "persistent-auto-refresh-result.json");
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--publish") publish = true;
    else if (arg === "--skip-live") skipLive = true;
    else if (arg === "--json-out") jsonOut = resolve(argv[++i]);
  }
  return { publish, skipLive, jsonOut };
}

function mapExistingPulls(
  pulls: Awaited<ReturnType<typeof listOpenPullRequests>>,
): ExistingRefreshPr[] {
  return pulls
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
}

async function main(): Promise<void> {
  assertPersistentAutoRefreshNotEnabled();
  assertPersistentPublisherCannotReadyOrMerge();

  const args = parseArgs(process.argv.slice(2));
  const evaluatedAt = new Date().toISOString();
  const triggerEnv = process.env.PERSISTENT_AUTO_REFRESH_TRIGGER;
  const trigger =
    triggerEnv === "workflow_dispatch"
      ? ("workflow_dispatch" as const)
      : ("manual_cli" as const);
  const runId = process.env.GITHUB_RUN_ID ?? null;

  const raw = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (!isArchitectureSnapshot(raw)) {
    throw new Error("docs/architecture/architecture.json is not a valid Architecture Snapshot");
  }

  const startMain = readCurrentMain();
  const generatedFrom = raw.generatedFrom.commit as string;
  const changedPaths = startMain === null ? null : readChangedPaths(generatedFrom, startMain);
  const repository = `yasutakesougo/${raw.generatedFrom.repository}`;
  const [owner, repo] = repository.split("/");

  let existingRefreshPrs: ExistingRefreshPr[] = [];
  let existingPrObservationFailed = false;
  let duplicateState: PersistentAutoRefreshRunReport["duplicateState"] = "NONE";

  if (!args.skipLive) {
    try {
      const token = process.env.GITHUB_TOKEN;
      const pulls = await listOpenPullRequests({ owner, repo, token });
      existingRefreshPrs = mapExistingPulls(pulls);
    } catch {
      existingPrObservationFailed = true;
      duplicateState = "LOOKUP_FAILED";
    }
  }

  let failureClass: PersistentFailureClass | null = null;
  if (startMain === null) {
    failureClass = classifyPersistentFailure({ kind: "observation_unavailable" });
  } else if (changedPaths === null) {
    failureClass = classifyPersistentFailure({ kind: "changed_paths_unavailable" });
  } else if (existingPrObservationFailed) {
    failureClass = classifyPersistentFailure({ kind: "duplicate_check_unavailable" });
  }

  const eligibilityReport = evaluateAutoRefresh({
    repository,
    observedMain: startMain,
    snapshotGeneratedFrom: generatedFrom,
    changedPaths,
    existingRefreshPrs: existingPrObservationFailed ? null : existingRefreshPrs,
    existingPrObservationFailed,
    handoffStaleClassification: null,
    materialSnapshotDiff: null,
    evaluatedAt,
  });

  const eligible =
    eligibilityReport.refreshRequired === true &&
    (eligibilityReport.nextAction === "CREATE_DRAFT" ||
      eligibilityReport.nextAction === "REUSE_EXISTING_DRAFT");

  const refreshIdentity =
    eligibilityReport.refreshIdentity ??
    (startMain
      ? `${repository}::${generatedFrom}::${startMain}::${SNAPSHOT_GENERATOR_VERSION}`
      : null);

  const disposition =
    refreshIdentity && startMain
      ? classifyPersistentDraftDisposition({
          refreshIdentity,
          targetMainSha: startMain,
          eligible: eligible && !existingPrObservationFailed && failureClass === null,
          existing: existingRefreshPrs,
        })
      : ("NO_ACTION" as const);

  if (disposition === "REUSE") duplicateState = "REUSE";
  if (disposition === "SUPERSEDED_CANDIDATE") duplicateState = "SUPERSEDED_CANDIDATE";
  if (existingPrObservationFailed) duplicateState = "LOOKUP_FAILED";

  const report: PersistentAutoRefreshRunReport = {
    schemaVersion: "1.0",
    mode: PERSISTENT_AUTO_REFRESH_MODE,
    trigger,
    repository,
    runId,
    observedMain: startMain,
    snapshotGeneratedFrom: generatedFrom,
    changedPaths: changedPaths ?? [],
    architectureRelevantPaths: eligibilityReport.sourceArchitectureRelevantPaths,
    refreshRequired: eligibilityReport.refreshRequired,
    refreshIdentity,
    status: "EVALUATING",
    reason: eligibilityReport.reason,
    verification: {
      architectureSnapshot: "NOT_RUN",
      handoff: "NOT_RUN",
      verify: "NOT_RUN",
    },
    duplicateState,
    mainRecheck: "NOT_RUN",
    publicationOutcome: "NO_PUBLICATION",
    draftPr: null,
    mutations: {
      featureBranch: false,
      snapshotCommit: false,
      draftPrCreated: false,
    },
    failureClass,
    approvalActionRequired: false,
    persistentAutoRefreshEnabled: false,
    evaluatedAt,
  };

  if (failureClass || !startMain || !refreshIdentity) {
    report.status = failureClass === "OUTCOME_UNKNOWN" ? "OUTCOME_UNKNOWN" : "HOLD";
    report.publicationOutcome = "HOLD";
    report.reason =
      failureClass === null
        ? "observation incomplete; fail closed"
        : `fail closed (${failureClass}): ${report.reason}`;
    writeResult(args.jsonOut, report);
    printSummary(report);
    process.exitCode = 1;
    return;
  }

  if (disposition === "REUSE") {
    const existing = existingRefreshPrs.find((pr) => pr.refreshIdentity === refreshIdentity);
    report.status = "REUSED_EXISTING";
    report.publicationOutcome = "REUSED_EXISTING";
    report.reason = eligibilityReport.reason;
    report.draftPr = existing
      ? {
          number: existing.number,
          url: `https://github.com/${repository}/pull/${existing.number}`,
          headSha: "",
        }
      : null;
    writeResult(args.jsonOut, report);
    printSummary(report);
    return;
  }

  if (disposition === "SUPERSEDED_CANDIDATE") {
    const decided = decidePersistentPublication({
      disposition,
      mainRecheck: "MATCH",
      verificationPassed: true,
      materialSnapshotDiff: null,
      failureClass: null,
    });
    report.status = decided.status;
    report.publicationOutcome = decided.decision;
    report.reason = decided.reason;
    writeResult(args.jsonOut, report);
    printSummary(report);
    process.exitCode = 1;
    return;
  }

  if (disposition === "NO_ACTION" || !eligible) {
    report.status = "NOT_REQUIRED";
    report.publicationOutcome = "NO_PUBLICATION";
    report.reason = eligibilityReport.reason;
    writeResult(args.jsonOut, report);
    printSummary(report);
    return;
  }

  // NEW_DRAFT_REQUIRED — regenerate from exact observed main SHA.
  report.status = "GENERATING";
  const beforeSnapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  try {
    writeSnapshot({ commit: startMain });
  } catch {
    failureClass = classifyPersistentFailure({ kind: "generator_failed" });
    report.failureClass = failureClass;
    report.status = "HOLD";
    report.publicationOutcome = "HOLD";
    report.verification.architectureSnapshot = "FAIL";
    report.reason = "generator failure; no Draft publication";
    writeResult(args.jsonOut, report);
    printSummary(report);
    process.exitCode = 1;
    return;
  }

  const afterSnapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  try {
    assertGeneratedFromMatchesSourceMain({
      generatedFromCommit: afterSnapshot.generatedFrom.commit,
      sourceMainSha: startMain,
    });
    report.verification.architectureSnapshot = "PASS";
  } catch {
    failureClass = classifyPersistentFailure({ kind: "generator_failed" });
    report.failureClass = failureClass;
    report.status = "HOLD";
    report.publicationOutcome = "HOLD";
    report.verification.architectureSnapshot = "FAIL";
    report.reason = "generatedFrom.commit does not match source main after regeneration";
    writeResult(args.jsonOut, report);
    printSummary(report);
    process.exitCode = 1;
    return;
  }

  const materialDiff = hasMaterialSnapshotDiff(beforeSnapshot, afterSnapshot);

  report.status = "VERIFYING";
  const handoffRun = runNpm("handoff");
  report.verification.handoff = handoffRun.ok ? "PASS" : "FAIL";
  if (!handoffRun.ok) {
    failureClass = classifyPersistentFailure({ kind: "handoff_failed" });
  }

  const verifyRun = runNpm("verify");
  report.verification.verify = verifyRun.ok ? "PASS" : "FAIL";
  if (!verifyRun.ok && failureClass === null) {
    failureClass = classifyPersistentFailure({ kind: "verification_failed" });
  }

  const verificationPassed =
    report.verification.architectureSnapshot === "PASS" &&
    handoffRun.ok &&
    verifyRun.ok;

  const currentMain = readCurrentMain();
  if (currentMain === null) {
    report.mainRecheck = "UNAVAILABLE";
    failureClass = classifyPersistentFailure({ kind: "main_recheck_unavailable" });
  } else {
    report.mainRecheck = recheckMain(startMain, currentMain);
  }

  // Second duplicate check immediately before publication.
  if (!args.skipLive) {
    try {
      const token = process.env.GITHUB_TOKEN;
      const pulls = await listOpenPullRequests({ owner, repo, token });
      existingRefreshPrs = mapExistingPulls(pulls);
      const postDisposition = classifyPersistentDraftDisposition({
        refreshIdentity,
        targetMainSha: startMain,
        eligible: true,
        existing: existingRefreshPrs,
      });
      if (postDisposition === "REUSE") {
        report.duplicateState = "REUSE";
        report.status = "REUSED_EXISTING";
        report.publicationOutcome = "REUSED_EXISTING";
        const existing = existingRefreshPrs.find((pr) => pr.refreshIdentity === refreshIdentity);
        report.draftPr = existing
          ? {
              number: existing.number,
              url: `https://github.com/${repository}/pull/${existing.number}`,
              headSha: "",
            }
          : null;
        report.reason = "second duplicate check found equivalent Draft/Ready";
        writeResult(args.jsonOut, report);
        printSummary(report);
        return;
      }
      if (postDisposition === "SUPERSEDED_CANDIDATE") {
        report.duplicateState = "SUPERSEDED_CANDIDATE";
        const decided = decidePersistentPublication({
          disposition: postDisposition,
          mainRecheck: report.mainRecheck === "MOVED" ? "MOVED" : "MATCH",
          verificationPassed,
          materialSnapshotDiff: materialDiff,
          failureClass: null,
        });
        report.status = decided.status;
        report.publicationOutcome = decided.decision;
        report.reason = decided.reason;
        writeResult(args.jsonOut, report);
        printSummary(report);
        process.exitCode = 1;
        return;
      }
      report.duplicateState = "NONE";
    } catch {
      failureClass = classifyPersistentFailure({ kind: "duplicate_check_unavailable" });
      report.duplicateState = "LOOKUP_FAILED";
    }
  }

  report.failureClass = failureClass;
  const decided = decidePersistentPublication({
    disposition: "NEW_DRAFT_REQUIRED",
    mainRecheck: report.mainRecheck,
    verificationPassed,
    materialSnapshotDiff: materialDiff,
    failureClass,
  });
  report.status = decided.status;
  report.publicationOutcome = decided.decision;
  report.reason = decided.reason;

  if (decided.decision !== "PUBLISH_DRAFT") {
    writeResult(args.jsonOut, report);
    printSummary(report);
    if (decided.decision !== "NO_PUBLICATION") process.exitCode = 1;
    return;
  }

  if (!args.publish) {
    report.status = "ELIGIBLE";
    report.publicationOutcome = "NO_PUBLICATION";
    report.reason = `${decided.reason}; --publish not set (DISABLED-MODE dry evaluation)`;
    writeResult(args.jsonOut, report);
    printSummary(report);
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    report.failureClass = classifyPersistentFailure({ kind: "publish_rejected" });
    report.status = "HOLD";
    report.publicationOutcome = "HOLD";
    report.reason = "GITHUB_TOKEN missing; cannot publish Draft PR";
    writeResult(args.jsonOut, report);
    printSummary(report);
    process.exitCode = 1;
    return;
  }

  report.status = "DRAFT_PUBLISHING";
  const branch = `auto-refresh/persistent-${startMain.slice(0, 12)}`;

  try {
    git(["checkout", "-B", branch]);
    report.mutations.featureBranch = true;
    git(["add", ...snapshotArtifacts]);
    git(["commit", "-m", `docs(architecture): persistent auto-refresh Snapshot (${startMain.slice(0, 7)})`]);
    report.mutations.snapshotCommit = true;
    git(["push", "-u", "origin", `HEAD:${branch}`]);
  } catch {
    report.failureClass = classifyPersistentFailure({ kind: "commit_push_failed" });
    report.status = "HOLD";
    report.publicationOutcome = "HOLD";
    report.reason = "branch/commit/push failed; no Draft publication";
    writeResult(args.jsonOut, report);
    printSummary(report);
    process.exitCode = 1;
    return;
  }

  const headSha = git(["rev-parse", "HEAD"]);
  const body = [
    "## PERSISTENT-AUTO-REFRESH-V1 (DISABLED-MODE run)",
    "",
    "Architecture Snapshot refresh Draft. Persistent push-to-main automation remains **NOT ENABLED**.",
    "",
    `- observed / source main: \`${startMain}\``,
    `- prior generatedFrom: \`${generatedFrom}\``,
    `- new generatedFrom: \`${afterSnapshot.generatedFrom.commit}\``,
    `- ${formatRefreshIdentityMarker(refreshIdentity)}`,
    `- generatorVersion: \`${SNAPSHOT_GENERATOR_VERSION}\``,
    `- mode: \`${PERSISTENT_AUTO_REFRESH_MODE}\``,
    `- architecture-relevant source paths: ${report.architectureRelevantPaths.map((p) => `\`${p}\``).join(", ") || "(none)"}`,
    "",
    "Ready: **NOT AUTHORIZED**",
    "Merge: **NOT AUTHORIZED**",
    "",
    "This Draft stops for Human review.",
  ].join("\n");

  try {
    const created = await createDraftPullRequest({
      owner,
      repo,
      title: "docs(architecture): persistent auto-refresh Snapshot",
      body,
      head: branch,
      base: "main",
      token,
    });
    report.mutations.draftPrCreated = true;
    report.draftPr = {
      number: created.number,
      url: created.htmlUrl,
      headSha,
    };
    report.status = "DRAFT_OPEN";
    report.publicationOutcome = "PUBLISH_DRAFT";
    report.reason = "Draft PR created; persistent automation still NOT ENABLED";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Ambiguous transport / server outcome → never blind-retry.
    const unknown =
      /fetch failed|network|ECONNRESET|ETIMEDOUT|socket|502|503|504/i.test(message) ||
      /unknown/i.test(message);
    report.failureClass = classifyPersistentFailure({
      kind: unknown ? "publish_transport_unknown" : "publish_rejected",
    });
    report.status =
      report.failureClass === "OUTCOME_UNKNOWN" ? "OUTCOME_UNKNOWN" : "HOLD";
    report.publicationOutcome =
      report.failureClass === "OUTCOME_UNKNOWN" ? "OUTCOME_UNKNOWN" : "HOLD";
    report.reason = `Draft publication failed (${report.failureClass}): ${message}`;
    // Explicit: OUTCOME_UNKNOWN must not authorize blind retry.
    if (
      report.failureClass === "OUTCOME_UNKNOWN" &&
      mayRetryPublication({
        failureClass: report.failureClass,
        equivalentDraftStillAbsent: true,
      })
    ) {
      throw new Error("invariant violated: OUTCOME_UNKNOWN must not be retryable");
    }
    writeResult(args.jsonOut, report);
    printSummary(report);
    process.exitCode = 1;
    return;
  }

  writeResult(args.jsonOut, report);
  printSummary(report);
}

function writeResult(path: string, result: PersistentAutoRefreshRunReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
}

function printSummary(result: PersistentAutoRefreshRunReport): void {
  process.stdout.write(`# PERSISTENT-AUTO-REFRESH-V1 (${result.mode})\n`);
  process.stdout.write(`- trigger: ${result.trigger}\n`);
  process.stdout.write(`- observedMain: ${result.observedMain}\n`);
  process.stdout.write(`- snapshotGeneratedFrom: ${result.snapshotGeneratedFrom}\n`);
  process.stdout.write(
    `- architectureRelevantPaths: ${JSON.stringify(result.architectureRelevantPaths)}\n`,
  );
  process.stdout.write(`- refreshRequired: ${result.refreshRequired}\n`);
  process.stdout.write(`- refreshIdentity: ${result.refreshIdentity}\n`);
  process.stdout.write(`- status: ${result.status}\n`);
  process.stdout.write(`- reason: ${result.reason}\n`);
  process.stdout.write(`- verification: ${JSON.stringify(result.verification)}\n`);
  process.stdout.write(`- duplicateState: ${result.duplicateState}\n`);
  process.stdout.write(`- mainRecheck: ${result.mainRecheck}\n`);
  process.stdout.write(`- publicationOutcome: ${result.publicationOutcome}\n`);
  process.stdout.write(`- draftPr: ${result.draftPr?.url ?? null}\n`);
  process.stdout.write(`- failureClass: ${result.failureClass}\n`);
  process.stdout.write(`- persistentAutoRefreshEnabled: ${result.persistentAutoRefreshEnabled}\n`);
  process.stdout.write(`- approvalActionRequired: ${result.approvalActionRequired}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
