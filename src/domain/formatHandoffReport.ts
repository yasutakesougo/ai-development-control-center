import type { HandoffReport } from "./handoffReport";

function staleLabel(report: HandoffReport): string {
  if (report.snapshot.stale === null || report.snapshot.classification === "UNKNOWN") return "UNKNOWN";
  if (report.snapshot.stale === false) return "NO";
  return "YES";
}

function bulletFacts(
  items: Array<{ id: string; name: string; status: string; responsibility: string }>,
): string {
  if (items.length === 0) return "- (none)\n";
  return items.map((item) => `- [${item.status}] ${item.name} (${item.id}): ${item.responsibility}`).join("\n") + "\n";
}

/**
 * Concise Human-readable HANDOFF-V1 summary.
 * Delta/current-state only — not a second architecture map.
 */
export function formatHandoffHumanReport(report: HandoffReport): string {
  const lines: string[] = [];
  lines.push("# HANDOFF-V1 Report");
  lines.push("");
  lines.push("## CURRENT");
  lines.push(`- repository: ${report.repository}`);
  lines.push(`- currentMain: ${report.currentMain ?? "UNKNOWN"}`);
  lines.push(`- evaluatedAt: ${report.evaluatedAt}`);
  lines.push("");
  lines.push("## SNAPSHOT STATUS");
  lines.push(`- generatedFrom: ${report.snapshot.generatedFrom}`);
  lines.push(`- generatedAt: ${report.snapshot.generatedAt}`);
  lines.push(`- generator: ${report.snapshot.generator}`);
  lines.push(`- schemaVersion: ${report.snapshot.schemaVersion}`);
  lines.push(`- stale: ${staleLabel(report)}`);
  lines.push(`- classification: ${report.snapshot.classification}`);
  if (report.snapshot.staleReasons.length > 0) {
    for (const reason of report.snapshot.staleReasons) lines.push(`- reason: ${reason}`);
  }
  if (report.snapshot.architectureRelevantPaths.length > 0) {
    lines.push(`- architectureRelevantPaths: ${report.snapshot.architectureRelevantPaths.join(", ")}`);
  }
  lines.push("");
  lines.push("## LIVE DIFFERENCES");
  if (report.liveDifferences.length === 0) {
    lines.push("- (none)");
  } else {
    for (const diff of report.liveDifferences) {
      lines.push(`- ${diff.summary}`);
    }
  }
  lines.push("");
  lines.push("## HUMAN GATES");
  lines.push(bulletFacts(report.humanGates).trimEnd());
  lines.push("");
  lines.push("## HOLDS");
  lines.push(bulletFacts(report.holds).trimEnd());
  lines.push("");
  lines.push("## UNKNOWN");
  lines.push(bulletFacts(report.unknowns).trimEnd());
  lines.push("");
  lines.push("## ASSUMPTIONS");
  lines.push(bulletFacts(report.assumptions).trimEnd());
  lines.push("");
  lines.push("## NEXT ACTION");
  lines.push(`- status: ${report.nextAction.status}`);
  lines.push(`- description: ${report.nextAction.description}`);
  if (report.nextAction.evidence.length > 0) {
    lines.push(`- evidence: ${report.nextAction.evidence.join(", ")}`);
  }
  lines.push("");
  lines.push("## FORBIDDEN");
  lines.push(bulletFacts(report.forbiddenCapabilities).trimEnd());
  lines.push("");
  lines.push("## CONFIRMED (count only)");
  lines.push(`- confirmed facts preserved from architecture.json: ${report.confirmed.length}`);
  lines.push("");
  return lines.join("\n");
}
