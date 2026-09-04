#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";

const EXACT_SHA = /^[0-9a-f]{40}$/;
const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
  ".next",
  "out",
  ".wrangler",
]);

const directivePattern = /(?:eslint-(?:disable|enable|env)|@ts-(?:ignore|expect-error|nocheck|check)|(?:istanbul|c8|v8)\s+ignore|#\s*source(?:Mapping)?URL|@__PURE__|webpack(?:ChunkName|Mode|Ignore)|vite-ignore)/i;

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function resolveExactCommit(cwd, value) {
  if (!EXACT_SHA.test(value ?? "")) {
    return { ok: false, reasonCode: "REVISION_NOT_EXACT_SHA", detail: String(value ?? "") };
  }
  try {
    const resolved = runGit(cwd, ["rev-parse", "--verify", `${value}^{commit}`]).trim();
    if (resolved !== value) {
      return { ok: false, reasonCode: "REVISION_RESOLUTION_MISMATCH", detail: resolved };
    }
    return { ok: true, sha: resolved };
  } catch (error) {
    return { ok: false, reasonCode: "REVISION_UNRESOLVED", detail: gitError(error) };
  }
}

function parseNameStatus(raw) {
  const fields = raw.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (!oldPath || !newPath) {
        return { ok: false, reasonCode: "DIFF_NAME_STATUS_INVALID" };
      }
      changes.push({ status, path: newPath, oldPath });
      continue;
    }
    const filePath = fields[index++];
    if (!filePath) return { ok: false, reasonCode: "DIFF_NAME_STATUS_INVALID" };
    changes.push({ status, path: filePath });
  }
  return { ok: true, changes };
}

function parseChangedLineRanges(patch) {
  if (/^Binary files /m.test(patch) || /^GIT binary patch$/m.test(patch)) {
    return { ok: false, reasonCode: "BINARY_DIFF" };
  }
  const ranges = [];
  for (const line of patch.split("\n")) {
    if (!line.startsWith("@@")) continue;
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) return { ok: false, reasonCode: "DIFF_HUNK_INVALID" };
    const startLine = Number(match[1]);
    const lineCount = match[2] === undefined ? 1 : Number(match[2]);
    if (lineCount > 0) ranges.push({ startLine, endLine: startLine + lineCount - 1 });
  }
  return { ok: true, ranges };
}

function isExcludedPath(filePath) {
  return filePath.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function scriptKindFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function languageVariantFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".tsx" || extension === ".jsx" ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard;
}

function tokenIntersectsChangedLines(startLine, endLine, ranges) {
  return ranges.some((range) => startLine <= range.endLine && endLine >= range.startLine);
}

function scanFileComments(filePath, text, ranges) {
  const lexicalErrors = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    languageVariantFor(filePath),
    text,
    (message, length) => lexicalErrors.push({ message: String(message), length: length ?? null }),
  );
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, false, scriptKindFor(filePath));
  const parseErrors = sourceFile.parseDiagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    start: diagnostic.start ?? null,
    length: diagnostic.length ?? null,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  }));
  const findings = [];

  while (true) {
    const token = scanner.scan();
    if (token === ts.SyntaxKind.EndOfFileToken) break;
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;

    const start = scanner.getTokenPos();
    const end = scanner.getTextPos();
    const startPosition = sourceFile.getLineAndCharacterOfPosition(start);
    const endPosition = sourceFile.getLineAndCharacterOfPosition(Math.max(start, end - 1));
    const startLine = startPosition.line + 1;
    const endLine = endPosition.line + 1;
    if (!tokenIntersectsChangedLines(startLine, endLine, ranges)) continue;

    const commentText = text.slice(start, end);
    findings.push({
      path: filePath,
      kind: directivePattern.test(commentText) ? "DIRECTIVE_REVIEW" : "COMMENT",
      tokenKind: token === ts.SyntaxKind.SingleLineCommentTrivia ? "SINGLE_LINE" : "MULTI_LINE",
      startLine,
      startColumn: startPosition.character + 1,
      endLine,
      endColumn: endPosition.character + 1,
      text: commentText,
    });
  }

  return { findings, lexicalErrors, parseErrors };
}

function gitError(error) {
  if (error && typeof error === "object") {
    const stderr = "stderr" in error && error.stderr ? String(error.stderr).trim() : "";
    const message = "message" in error && error.message ? String(error.message).trim() : "";
    return stderr || message || "git command failed";
  }
  return String(error);
}

function sortFindings(findings) {
  findings.sort((a, b) =>
    compareText(a.path, b.path) ||
    a.startLine - b.startLine ||
    a.startColumn - b.startColumn ||
    a.endLine - b.endLine ||
    a.endColumn - b.endColumn ||
    compareText(a.kind, b.kind) ||
    compareText(a.text, b.text),
  );
}

function sortRecords(records) {
  records.sort((a, b) => compareText(a.path ?? "", b.path ?? "") || compareText(a.reasonCode, b.reasonCode));
}

export function scanCommentWorkaround({ baseSha, headSha, cwd = process.cwd() }) {
  const errors = [];
  const excluded = [];
  const findings = [];

  const base = resolveExactCommit(cwd, baseSha);
  const head = resolveExactCommit(cwd, headSha);
  if (!base.ok) errors.push({ path: null, reasonCode: base.reasonCode, detail: base.detail ?? null });
  if (!head.ok) errors.push({ path: null, reasonCode: head.reasonCode, detail: head.detail ?? null });

  if (errors.length > 0) {
    sortRecords(errors);
    return result(baseSha ?? null, headSha ?? null, findings, excluded, errors);
  }

  let parsed;
  try {
    parsed = parseNameStatus(
      runGit(cwd, ["diff", "--name-status", "-z", "--find-renames=50%", base.sha, head.sha, "--"]),
    );
  } catch (error) {
    errors.push({ path: null, reasonCode: "DIFF_FAILED", detail: gitError(error) });
    return result(base.sha, head.sha, findings, excluded, errors);
  }

  if (!parsed.ok) {
    errors.push({ path: null, reasonCode: parsed.reasonCode, detail: null });
    return result(base.sha, head.sha, findings, excluded, errors);
  }

  for (const change of parsed.changes) {
    const extension = path.extname(change.path).toLowerCase();

    if (change.status === "D") {
      excluded.push({ path: change.path, reasonCode: "DELETED_FILE" });
      continue;
    }
    if (change.status.startsWith("R") || change.status.startsWith("C")) {
      errors.push({ path: change.path, reasonCode: "RENAMED_OR_COPIED_FILE", detail: change.oldPath ?? null });
      continue;
    }
    if (change.status !== "A" && change.status !== "M") {
      errors.push({ path: change.path, reasonCode: "DIFF_STATUS_UNSUPPORTED", detail: change.status });
      continue;
    }
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      excluded.push({ path: change.path, reasonCode: "UNSUPPORTED_EXTENSION" });
      continue;
    }
    if (isExcludedPath(change.path)) {
      excluded.push({ path: change.path, reasonCode: "EXCLUDED_GENERATED_VENDOR_BUILD_PATH" });
      continue;
    }

    let patch;
    let text;
    try {
      patch = runGit(cwd, ["diff", "--unified=0", "--no-ext-diff", "--no-color", base.sha, head.sha, "--", change.path]);
      text = runGit(cwd, ["show", `${head.sha}:${change.path}`]);
    } catch (error) {
      errors.push({ path: change.path, reasonCode: "FILE_EVIDENCE_UNAVAILABLE", detail: gitError(error) });
      continue;
    }

    if (text.includes("\0")) {
      errors.push({ path: change.path, reasonCode: "BINARY_SOURCE", detail: null });
      continue;
    }

    const changedLines = parseChangedLineRanges(patch);
    if (!changedLines.ok) {
      errors.push({ path: change.path, reasonCode: changedLines.reasonCode, detail: null });
      continue;
    }

    const scanned = scanFileComments(change.path, text, changedLines.ranges);
    if (scanned.lexicalErrors.length > 0) {
      errors.push({
        path: change.path,
        reasonCode: "LEXICAL_SCAN_FAILED",
        detail: JSON.stringify(scanned.lexicalErrors),
      });
      continue;
    }
    if (scanned.parseErrors.length > 0) {
      errors.push({
        path: change.path,
        reasonCode: "SOURCE_SYNTAX_INVALID_OR_UNSUPPORTED",
        detail: JSON.stringify(scanned.parseErrors),
      });
      continue;
    }
    findings.push(...scanned.findings);
  }

  sortFindings(findings);
  sortRecords(excluded);
  sortRecords(errors);
  return result(base.sha, head.sha, findings, excluded, errors);
}

function result(baseSha, headSha, findings, excluded, errors) {
  return {
    schemaVersion: "COMMENT-WORKAROUND-SCAN-V1",
    comparisonMode: "EXACT_TWO_TREE",
    baseSha,
    headSha,
    status: errors.length > 0 ? "HOLD" : findings.length > 0 ? "REVIEW_REQUIRED" : "CLEAN",
    findings,
    excluded,
    errors,
  };
}

function runCli() {
  const output = scanCommentWorkaround({ baseSha: process.argv[2], headSha: process.argv[3] });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.status === "HOLD") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runCli();
