import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scannerPath = fileURLToPath(new URL("../scripts/comment-workaround-scan.mjs", import.meta.url));

type ScanFinding = {
  path: string;
  kind: "COMMENT" | "DIRECTIVE_REVIEW";
  tokenKind: "SINGLE_LINE" | "MULTI_LINE";
  startLine: number;
  endLine: number;
  text: string;
};

type ScanRecord = {
  path: string | null;
  reasonCode: string;
};

type ScanResult = {
  status: "CLEAN" | "REVIEW_REQUIRED" | "HOLD";
  findings: ScanFinding[];
  excluded: ScanRecord[];
  errors: ScanRecord[];
};

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createRepository(): string {
  const cwd = mkdtempSync(path.join(tmpdir(), "comment-workaround-scan-"));
  git(cwd, ["init", "-q"]);
  git(cwd, ["config", "user.email", "test@example.invalid"]);
  git(cwd, ["config", "user.name", "Comment Workaround Test"]);
  return cwd;
}

function write(cwd: string, filePath: string, content: string): void {
  mkdirSync(path.dirname(path.join(cwd, filePath)), { recursive: true });
  writeFileSync(path.join(cwd, filePath), content);
}

function commit(cwd: string, message: string): string {
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-qm", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function runScanner(cwd: string, baseSha: string, headSha: string): { exitCode: number | null; result: ScanResult } {
  const execution = spawnSync(process.execPath, [scannerPath, baseSha, headSha], { cwd, encoding: "utf8" });
  if (!execution.stdout) throw new Error(execution.stderr || "scanner produced no output");
  return { exitCode: execution.status, result: JSON.parse(execution.stdout) as ScanResult };
}

describe("COMMENT-WORKAROUND-HARNESS-V1 scanner", () => {
  it("finds changed comments without treating comment-like strings as comments", () => {
    const cwd = createRepository();
    write(cwd, "a.ts", 'export const url = "https://example.com/a//b";\n');
    const baseSha = commit(cwd, "base");
    write(
      cwd,
      "a.ts",
      'export const url = "https://example.com/a//b";\nconst marker = "// not a comment";\n// explain this\nexport const value = 1;\n',
    );
    const headSha = commit(cwd, "head");

    const { exitCode, result } = runScanner(cwd, baseSha, headSha);

    expect(exitCode).toBe(0);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      path: "a.ts",
      kind: "COMMENT",
      tokenKind: "SINGLE_LINE",
      text: "// explain this",
    });
  });

  it("does not report unchanged historical comments", () => {
    const cwd = createRepository();
    write(cwd, "a.ts", "// historical why\nexport const value = 1;\n");
    const baseSha = commit(cwd, "base");
    write(cwd, "a.ts", "// historical why\nexport const value = 2;\n");
    const headSha = commit(cwd, "head");

    const { exitCode, result } = runScanner(cwd, baseSha, headSha);

    expect(exitCode).toBe(0);
    expect(result.status).toBe("CLEAN");
    expect(result.findings).toEqual([]);
  });

  it("separates directive comments from ordinary comments", () => {
    const cwd = createRepository();
    write(cwd, "a.ts", "export const value = 1;\n");
    const baseSha = commit(cwd, "base");
    write(cwd, "a.ts", "// @ts-expect-error external fixture\nexport const value = 1;\n");
    const headSha = commit(cwd, "head");

    const { exitCode, result } = runScanner(cwd, baseSha, headSha);

    expect(exitCode).toBe(0);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.findings[0].kind).toBe("DIRECTIVE_REVIEW");
  });

  it("orders findings deterministically by path and position", () => {
    const cwd = createRepository();
    write(cwd, "seed.ts", "export const seed = 1;\n");
    const baseSha = commit(cwd, "base");
    write(cwd, "z.ts", "// zed\nexport const z = 1;\n");
    write(cwd, "a.ts", "// alpha\nexport const a = 1;\n");
    const headSha = commit(cwd, "head");

    const { result } = runScanner(cwd, baseSha, headSha);

    expect(result.findings.map((finding) => finding.path)).toEqual(["a.ts", "z.ts"]);
  });

  it("records generated and unsupported paths as explicit exclusions", () => {
    const cwd = createRepository();
    write(cwd, "seed.ts", "export const seed = 1;\n");
    const baseSha = commit(cwd, "base");
    write(cwd, "dist/generated.js", "// generated output\n");
    write(cwd, "notes.md", "// prose\n");
    const headSha = commit(cwd, "head");

    const { exitCode, result } = runScanner(cwd, baseSha, headSha);

    expect(exitCode).toBe(0);
    expect(result.status).toBe("CLEAN");
    expect(result.excluded).toEqual([
      { path: "dist/generated.js", reasonCode: "EXCLUDED_GENERATED_VENDOR_BUILD_PATH" },
      { path: "notes.md", reasonCode: "UNSUPPORTED_EXTENSION" },
    ]);
  });

  it("fails closed when revisions are not exact full SHAs", () => {
    const cwd = createRepository();
    write(cwd, "a.ts", "export const value = 1;\n");
    const headSha = commit(cwd, "head");

    const { exitCode, result } = runScanner(cwd, "HEAD~1", headSha);

    expect(exitCode).toBe(2);
    expect(result.status).toBe("HOLD");
    expect(result.errors[0].reasonCode).toBe("REVISION_NOT_EXACT_SHA");
  });

  it("fails closed on renamed source files", () => {
    const cwd = createRepository();
    write(cwd, "a.ts", "export const value = 1;\n");
    const baseSha = commit(cwd, "base");
    renameSync(path.join(cwd, "a.ts"), path.join(cwd, "b.ts"));
    const headSha = commit(cwd, "head");

    const { exitCode, result } = runScanner(cwd, baseSha, headSha);

    expect(exitCode).toBe(2);
    expect(result.status).toBe("HOLD");
    expect(result.errors[0].reasonCode).toBe("RENAMED_OR_COPIED_FILE");
  });

  it("detects multiline comment tokens that intersect changed lines", () => {
    const cwd = createRepository();
    write(cwd, "a.ts", "export const value = 1;\n");
    const baseSha = commit(cwd, "base");
    write(cwd, "a.ts", "/* first\n * second\n */\nexport const value = 1;\n");
    const headSha = commit(cwd, "head");

    const { exitCode, result } = runScanner(cwd, baseSha, headSha);

    expect(exitCode).toBe(0);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.findings[0]).toMatchObject({ tokenKind: "MULTI_LINE", startLine: 1, endLine: 3 });
  });
});
