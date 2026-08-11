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
        { state: "failure", total_count: 1 },
      ),
    ).toBe("PASS");
  });

  it("returns PENDING when any check run is incomplete", () => {
    expect(
      normalizeCi(
        { check_runs: [{ status: "in_progress", conclusion: null }] },
        { state: "success", total_count: 1 },
      ),
    ).toBe("PENDING");
  });

  it("returns FAIL when a check run conclusion is failure", () => {
    expect(
      normalizeCi(
        { check_runs: [{ status: "completed", conclusion: "failure" }] },
        { state: "success", total_count: 1 },
      ),
    ).toBe("FAIL");
  });

  it("uses commit status only when total_count > 0", () => {
    expect(normalizeCi(null, { state: "success", total_count: 1 })).toBe("PASS");
    expect(normalizeCi(null, { state: "pending", total_count: 1 })).toBe("PENDING");
    expect(normalizeCi(null, { state: "failure", total_count: 1 })).toBe("FAIL");
    expect(normalizeCi(null, { state: "error", total_count: 1 })).toBe("FAIL");
  });

  it("returns UNKNOWN when checks unavailable and commit status total_count is 0", () => {
    expect(normalizeCi(null, { state: "pending", total_count: 0 })).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when checks empty and commit status total_count is 0", () => {
    expect(normalizeCi({ total_count: 0, check_runs: [] }, { state: "pending", total_count: 0 })).toBe(
      "UNKNOWN",
    );
  });

  it("returns PENDING when checks unavailable and one commit status is pending", () => {
    expect(normalizeCi(null, { state: "pending", total_count: 1 })).toBe("PENDING");
  });

  it("returns UNKNOWN when total_count cannot be confirmed", () => {
    expect(normalizeCi(null, { state: "pending" })).toBe("UNKNOWN");
    expect(normalizeCi(null, { state: "success" })).toBe("UNKNOWN");
    expect(normalizeCi({ check_runs: [] }, { state: undefined })).toBe("UNKNOWN");
  });
});
