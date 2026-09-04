import { describe, expect, it } from "vitest";
import {
  MAX_DETAILED_PRS,
  prioritizeOpenPulls,
  selectDetailedPulls,
  estimatedObservationCost,
  SAFE_BUDGET,
  SUBREQUEST_LIMIT,
} from "../src/domain/boundedGithubObservation";

describe("boundedGithubObservation", () => {
  it("locks SAFE_BUDGET admission math", () => {
    expect(MAX_DETAILED_PRS).toBe(14);
    expect(estimatedObservationCost(MAX_DETAILED_PRS)).toBe(SAFE_BUDGET);
    expect(SAFE_BUDGET).toBeLessThanOrEqual(SUBREQUEST_LIMIT);
  });

  it("is deterministic for identical pull sets", () => {
    const pulls = [
      {
        number: 10,
        title: "later",
        draft: false,
        body: null,
        base: { ref: "main" },
        updated_at: "2026-03-02T00:00:00Z",
      },
      {
        number: 4,
        title: "marker",
        draft: true,
        body: "Human-Decision: REQUIRED\n",
        base: { ref: "main" },
        updated_at: "2026-03-01T00:00:00Z",
      },
      {
        number: 7,
        title: "other-base",
        draft: false,
        body: null,
        base: { ref: "feature" },
        updated_at: "2026-03-03T00:00:00Z",
      },
    ];
    const first = prioritizeOpenPulls(pulls, { defaultBranch: "main" }).map((p) => p.number);
    const second = prioritizeOpenPulls(pulls, { defaultBranch: "main" }).map((p) => p.number);
    expect(first).toEqual(second);
    expect(first).toEqual([4, 10, 7]);
  });

  it("caps detailed selection at MAX_DETAILED_PRS", () => {
    const ordered = prioritizeOpenPulls(
      Array.from({ length: 20 }, (_, i) => ({
        number: i + 1,
        title: `PR ${i + 1}`,
        draft: false,
        body: null,
        base: { ref: "main" },
        updated_at: `2026-04-01T00:${String(i).padStart(2, "0")}:00Z`,
      })),
      { defaultBranch: "main" },
    );
    const { selected, omittedFromCap } = selectDetailedPulls(ordered);
    expect(selected).toHaveLength(14);
    expect(omittedFromCap).toHaveLength(6);
    expect(selected.map((p) => p.number)).toEqual(
      prioritizeOpenPulls(ordered, { defaultBranch: "main" })
        .slice(0, 14)
        .map((p) => p.number),
    );
  });
});
