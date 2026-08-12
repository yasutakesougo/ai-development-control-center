/**
 * STATUS-OVERLAY-V1 read-only runtime wiring.
 *
 * Orchestrates:
 *   read-only observer → StatusOverlayGeneratorInput
 *   → generateStatusOverlay() → StatusOverlayDocument
 *
 * Does not mutate GitHub, write repository/HISTORY files, invoke Action Gateway /
 * Ledger / Agents, or redefine Generator decision semantics.
 */

import type { ArchitectureSnapshot } from "../domain/architectureSnapshot";
import { isArchitectureSnapshot } from "../domain/architectureSnapshot";
import type { HandoffReport } from "../domain/handoffReport";
import type { StatusOverlayDocument } from "../domain/statusOverlayContract";
import {
  generateStatusOverlay,
  type StatusOverlayGeneratorInput,
} from "../domain/statusOverlayGenerator";
import {
  observeStatusOverlayGithub,
  type StatusOverlayLocalObservation,
  type StatusOverlayReadonlyGithubClient,
} from "../observer/statusOverlayGithubObserver";

export const STATUS_OVERLAY_RUNTIME_IMPLEMENTED = true as const;
export const STATUS_OVERLAY_RUNTIME_DESIGN = "STATUS-OVERLAY-RUNTIME-V1" as const;

/** Default repository for STATUS-OVERLAY observation. */
export const STATUS_OVERLAY_DEFAULT_REPOSITORY =
  "yasutakesougo/ai-development-control-center" as const;

export type StatusOverlayRuntimePhase =
  | "disabled"
  | "loading"
  | "ready"
  | "unavailable";

export interface StatusOverlayRuntimeResult {
  phase: Exclude<StatusOverlayRuntimePhase, "disabled" | "loading">;
  document: StatusOverlayDocument | null;
  reason: string | null;
}

export interface StatusOverlayRuntimeDeps {
  repository: string;
  client: StatusOverlayReadonlyGithubClient;
  local: StatusOverlayLocalObservation;
  /** Called once per cycle; value is preserved through Generator into the document. */
  now: () => string;
  /** Optional injectables for tests — defaults to production observe/generate. */
  observe?: typeof observeStatusOverlayGithub;
  generate?: typeof generateStatusOverlay;
}

/**
 * One observation cycle → one StatusOverlayDocument.
 * Decision logic remains owned by the Generator.
 */
export async function runStatusOverlayCycle(
  deps: StatusOverlayRuntimeDeps,
): Promise<StatusOverlayDocument> {
  const observe = deps.observe ?? observeStatusOverlayGithub;
  const generate = deps.generate ?? generateStatusOverlay;

  const input: StatusOverlayGeneratorInput = await observe({
    repository: deps.repository,
    client: deps.client,
    local: deps.local,
    now: deps.now,
  });

  const document = generate(input);
  assertStatusOverlayRuntimeInvariants(document, input.observedAt);
  return document;
}

/**
 * Hard orchestration failure (before a trustworthy document exists).
 * Surfaces explicit unavailable — never silent healthy/NO_ACTION.
 */
export function statusOverlayRuntimeUnavailable(
  reason: string,
): StatusOverlayRuntimeResult {
  return {
    phase: "unavailable",
    document: null,
    reason,
  };
}

export function statusOverlayRuntimeReady(
  document: StatusOverlayDocument,
): StatusOverlayRuntimeResult {
  assertStatusOverlayRuntimeInvariants(document, document.observedAt);
  return {
    phase: "ready",
    document,
    reason: null,
  };
}

export function assertStatusOverlayRuntimeInvariants(
  document: StatusOverlayDocument,
  expectedObservedAt: string,
): void {
  if (document.observedAt !== expectedObservedAt) {
    throw new Error("STATUS-OVERLAY observedAt must be preserved end-to-end");
  }
  if (document.recommendedNextAction.authorizesMutation !== false) {
    throw new Error("STATUS-OVERLAY recommendedNextAction must not authorize mutation");
  }
  const serialized = JSON.stringify(document);
  if (/bearer\s+[a-z0-9._\-]+/i.test(serialized) || /ghp_[a-zA-Z0-9]+/.test(serialized)) {
    throw new Error("STATUS-OVERLAY document must not embed secrets/tokens");
  }
}

/**
 * Build local observation artifacts without GitHub mutation.
 * When path deltas are unavailable, stale classification stays UNKNOWN (fail closed).
 */
export function buildStatusOverlayLocalObservation(input: {
  snapshot: ArchitectureSnapshot | null;
  handoff?: Pick<HandoffReport, "nextAction" | "snapshot"> | null;
  persistentWorkflowYaml?: string | null;
  currentMain?: string | null;
  architectureRelevantChanges?: string[] | null;
  holds?: string[];
  unknowns?: string[];
}): StatusOverlayLocalObservation {
  const generatedFrom = input.snapshot?.generatedFrom.commit ?? null;
  const currentMain = input.currentMain ?? null;
  const pathSet = input.architectureRelevantChanges;

  let snapshotStale: boolean | null = null;
  let snapshotStaleClassification: string | null = "UNKNOWN";

  if (input.handoff?.snapshot?.classification) {
    snapshotStaleClassification = input.handoff.snapshot.classification;
    snapshotStale =
      input.handoff.snapshot.classification === "current"
        ? false
        : input.handoff.snapshot.classification === "UNKNOWN"
          ? null
          : true;
  } else if (generatedFrom && currentMain) {
    if (generatedFrom === currentMain) {
      snapshotStale = false;
      snapshotStaleClassification = "current";
    } else if (pathSet == null) {
      snapshotStale = null;
      snapshotStaleClassification = "UNKNOWN";
    } else if (pathSet.length > 0) {
      snapshotStale = true;
      snapshotStaleClassification = "stale_architecture_affecting";
    } else {
      snapshotStale = true;
      snapshotStaleClassification = "stale_no_architecture_impact";
    }
  }

  const handoffStatus = input.handoff?.nextAction?.status ?? "NO_ACTION";

  return {
    snapshotGeneratedFrom: generatedFrom,
    snapshotStale,
    snapshotStaleClassification,
    architectureRelevantChanges: pathSet ?? [],
    handoffNextActionStatus: handoffStatus,
    handoffStaleClassification:
      input.handoff?.snapshot?.classification ?? snapshotStaleClassification,
    persistentWorkflowYaml: input.persistentWorkflowYaml ?? null,
    holds: [...(input.holds ?? [])],
    unknowns: [...(input.unknowns ?? [])],
  };
}

export function parseArchitectureSnapshotJson(value: unknown): ArchitectureSnapshot | null {
  return isArchitectureSnapshot(value) ? value : null;
}
