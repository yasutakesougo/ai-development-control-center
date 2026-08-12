import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type EvidenceEntry = {
  id: string;
  name?: string;
  status: "confirmed" | "assumed" | "unknown";
  confidence: "high" | "medium" | "low";
  evidence?: string[];
};

type ArchitectureSnapshot = {
  schemaVersion: string;
  generatedFrom: {
    repository: string;
    commit: string;
    generatedAt: string;
    generator: string;
  };
  confidence: { overall: string; notes: string[] };
  components: EvidenceEntry[];
  dependencies: EvidenceEntry[];
  flows: EvidenceEntry[];
  externalSystems: EvidenceEntry[];
  humanGates: EvidenceEntry[];
  holds: EvidenceEntry[];
  decisions: EvidenceEntry[];
  unknowns: EvidenceEntry[];
  assumptions: EvidenceEntry[];
  staleIndicators: EvidenceEntry[];
};

const root = resolve(import.meta.dirname, "..");
const jsonPath = resolve(root, "docs/architecture/architecture.json");
const htmlPath = resolve(root, "docs/architecture/architecture.html");
const snapshot = JSON.parse(readFileSync(jsonPath, "utf8")) as ArchitectureSnapshot;
const html = readFileSync(htmlPath, "utf8");

const collections = [
  "components",
  "dependencies",
  "flows",
  "externalSystems",
  "humanGates",
  "holds",
  "decisions",
  "unknowns",
  "assumptions",
  "staleIndicators",
] as const;

describe("Architecture Snapshot contract", () => {
  it("contains every required top-level field and an exact source commit", () => {
    expect(snapshot.schemaVersion).toBe("1.0");
    expect(snapshot.generatedFrom.repository).toBe("ai-development-control-center");
    expect(snapshot.generatedFrom.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.generatedFrom.generatedAt).toSatisfy((value: string) => !Number.isNaN(Date.parse(value)));
    expect(snapshot.generatedFrom.generator).toBe("ARCH-SNAPSHOT-GEN-V1");
    expect(snapshot.confidence).toMatchObject({ overall: "high" });
    for (const key of collections) expect(Array.isArray(snapshot[key])).toBe(true);
  });

  it("requires evidence for every confirmed fact", () => {
    const entries = collections.flatMap((key) => snapshot[key]);
    const confirmed = entries.filter((entry) => entry.status === "confirmed");
    expect(confirmed.length).toBeGreaterThan(0);
    for (const entry of confirmed) {
      expect(entry.evidence, `${entry.id} must carry evidence`).toBeDefined();
      expect(entry.evidence?.length, `${entry.id} must carry evidence`).toBeGreaterThan(0);
    }
  });

  it("keeps assumptions and unknowns explicit", () => {
    expect(snapshot.unknowns.length).toBeGreaterThan(0);
    expect(snapshot.unknowns.every((entry) => entry.status === "unknown")).toBe(true);
    expect(snapshot.assumptions.length).toBeGreaterThan(0);
    expect(snapshot.assumptions.every((entry) => entry.status === "assumed")).toBe(true);
    const unknownIds = snapshot.unknowns.map((entry) => entry.id);
    expect(unknownIds).toEqual(
      expect.arrayContaining([
        "unknown-action-gateway",
        "unknown-agent-execution",
        "unknown-auto-refresh",
      ]),
    );
    expect(snapshot.assumptions.some((entry) => entry.id === "assumption-target-repository")).toBe(
      true,
    );
  });

  it("represents merged HANDOFF-V1 architecture with evidence", () => {
    const byId = new Map(snapshot.components.map((entry) => [entry.id, entry]));
    for (const id of ["handoff-live-observer", "handoff-evaluator", "handoff-report"]) {
      const entry = byId.get(id);
      expect(entry, id).toBeDefined();
      expect(entry?.status).toBe("confirmed");
      expect(entry?.evidence?.length).toBeGreaterThan(0);
    }
    expect(snapshot.flows.some((entry) => entry.id === "flow-handoff-reconcile")).toBe(true);
    expect(
      snapshot.decisions.some((entry) => entry.id === "decision-handoff-decision-support"),
    ).toBe(true);
    expect(snapshot.staleIndicators.some((entry) => entry.id === "stale-handoff")).toBe(true);
  });

  it("does not document Action Gateway or Agent execution as implemented", () => {
    const entries = collections.flatMap((key) => snapshot[key]);
    for (const entry of entries) {
      if (/action gateway|agent execution/i.test(`${entry.id} ${entry.name}`)) {
        expect(entry.status, entry.id).not.toBe("confirmed");
      }
    }
  });

  it("generates standalone HTML from the same JSON payload", () => {
    const match = html.match(
      /<script id="architecture-data" type="application\/json">([\s\S]*?)<\/script>/,
    );
    expect(match).not.toBeNull();
    expect(JSON.parse(match?.[1] ?? "{}")).toEqual(snapshot);
    expect(html).toContain("<svg");
    expect(html).toContain('id="flow"');
    expect(html).toContain('id="details"');
    expect(html).toContain('id="warnings"');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
    expect(html).toContain("handoff-evaluator");
    expect(html).toContain("flow-handoff-reconcile");
  });
});

describe("Architecture Snapshot refresh against baseline main", () => {
  it("records generatedFrom.commit as the ARCH-SNAPSHOT-REFRESH-V1 baseline main", () => {
    // Refresh baseline locked by the slice gate: regenerate only while HEAD is this SHA.
    expect(snapshot.generatedFrom.commit).toBe(
      "c305af63dadea1ac0bc10756eb32ebe2d7761318",
    );
  });
});
