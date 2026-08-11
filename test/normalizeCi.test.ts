import { describe, expect, it } from "vitest";
import { normalizeCi } from "../src/worker/github/readOnlyAdapter";

describe("normalizeCi", () => {
  it("uses check runs when Checks API succeeds", () => {
    expect(
      normalizeCi(
        {
          check_runs: [
            { status: "completed", conclusion: "success" },
            { status: "completed", conclusion: "skipped" },
          ],
        },
        { state: "failure" },
      ),
    ).toBe("PASS");
  });

  it("returns PENDING when any check run is incomplete", () => {
    expect(
      normalizeCi(
        { check_runs: [{ status: "in_progress", conclusion: null }] },
        { state: "success" },
      ),
    ).toBe("PENDING");
  });

  it("returns FAIL when a check run conclusion is failure", () => {
    expect(
      normalizeCi(
        { check_runs: [{ status: "completed", conclusion: "failure" }] },
        { state: "success" },
      ),
    ).toBe("FAIL");
  });

  it("falls back to commit status when Checks API is unavailable", () => {
    expect(normalizeCi(null, { state: "success" })).toBe("PASS");
    expect(normalizeCi(null, { state: "pending" })).toBe("PENDING");
    expect(normalizeCi(null, { state: "failure" })).toBe("FAIL");
    expect(normalizeCi(null, { state: "error" })).toBe("FAIL");
  });

  it("falls back to commit status when check runs are empty", () => {
    expect(normalizeCi({ total_count: 0, check_runs: [] }, { state: "success" })).toBe("PASS");
  });

  it("returns UNKNOWN when neither checks nor commit status can determine CI", () => {
    expect(normalizeCi(null, {})).toBe("UNKNOWN");
    expect(normalizeCi(null, { state: "unknown" })).toBe("UNKNOWN");
    expect(normalizeCi({ check_runs: [] }, { state: undefined })).toBe("UNKNOWN");
  });
});
