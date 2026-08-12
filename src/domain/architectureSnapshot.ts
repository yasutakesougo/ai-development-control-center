/**
 * Architecture Snapshot schema consumed by HANDOFF-V1.
 * JSON at docs/architecture/architecture.json is the authoritative source.
 */

export type SnapshotStatus = "confirmed" | "assumed" | "unknown";
export type SnapshotConfidence = "high" | "medium" | "low";

export interface SnapshotFact {
  id: string;
  name: string;
  responsibility: string;
  status: SnapshotStatus;
  confidence: SnapshotConfidence;
  evidence?: string[];
  layer?: number;
  source?: string;
  target?: string;
  steps?: string[];
  dependencyIds?: string[];
}

export interface ArchitectureSnapshot {
  schemaVersion: string;
  generatedFrom: {
    repository: string;
    commit: string;
    generatedAt: string;
    generator: string;
  };
  confidence: { overall: string; notes: string[] };
  components: SnapshotFact[];
  dependencies: SnapshotFact[];
  flows: SnapshotFact[];
  externalSystems: SnapshotFact[];
  humanGates: SnapshotFact[];
  holds: SnapshotFact[];
  decisions: SnapshotFact[];
  unknowns: SnapshotFact[];
  assumptions: SnapshotFact[];
  staleIndicators: SnapshotFact[];
}

export function isArchitectureSnapshot(value: unknown): value is ArchitectureSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ArchitectureSnapshot>;
  return (
    typeof snapshot.schemaVersion === "string" &&
    typeof snapshot.generatedFrom?.commit === "string" &&
    Array.isArray(snapshot.components) &&
    Array.isArray(snapshot.assumptions) &&
    Array.isArray(snapshot.unknowns) &&
    Array.isArray(snapshot.humanGates) &&
    Array.isArray(snapshot.holds) &&
    Array.isArray(snapshot.staleIndicators)
  );
}
