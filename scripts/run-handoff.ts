import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isArchitectureSnapshot } from "../src/domain/architectureSnapshot";
import { evaluateHandoff } from "../src/domain/handoffEvaluator";
import { formatHandoffHumanReport } from "../src/domain/formatHandoffReport";
import { observeHandoffLiveState } from "../src/domain/observeHandoffLiveState";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = resolve(root, "docs/architecture/architecture.json");
const defaultOutDir = resolve(root, "docs/handoff");

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function readCurrentMain(): string | null {
  try {
    // Prefer origin/main when available; fall back to local main.
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

function parseArgs(argv: string[]): { jsonOut?: string; mdOut?: string; skipLive: boolean } {
  let jsonOut: string | undefined;
  let mdOut: string | undefined;
  let skipLive = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json-out") jsonOut = argv[++i];
    else if (arg === "--md-out") mdOut = argv[++i];
    else if (arg === "--skip-live") skipLive = true;
    else if (arg === "--out-dir") {
      const dir = argv[++i];
      jsonOut = resolve(dir, "handoff.json");
      mdOut = resolve(dir, "handoff.md");
    }
  }
  return { jsonOut, mdOut, skipLive };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (!isArchitectureSnapshot(raw)) {
    throw new Error("docs/architecture/architecture.json is not a valid Architecture Snapshot");
  }

  const currentMain = readCurrentMain();
  const changedPaths =
    currentMain === null ? null : readChangedPaths(raw.generatedFrom.commit, currentMain);

  const repository = `yasutakesougo/${raw.generatedFrom.repository}`;
  const live = args.skipLive
    ? null
    : await observeHandoffLiveState(repository, { GITHUB_TOKEN: process.env.GITHUB_TOKEN });

  // Prefer independently observed git main; if missing, fall back to live main.
  const effectiveMain = currentMain ?? live?.currentMain ?? null;

  const report = evaluateHandoff({
    snapshot: raw,
    currentMain: effectiveMain,
    changedPaths:
      effectiveMain === null
        ? null
        : currentMain !== null
          ? changedPaths
          : readChangedPaths(raw.generatedFrom.commit, effectiveMain),
    live,
    repository: raw.generatedFrom.repository,
  });

  const human = formatHandoffHumanReport(report);
  const jsonText = `${JSON.stringify(report, null, 2)}\n`;

  const jsonOut = args.jsonOut ?? resolve(defaultOutDir, "handoff.json");
  const mdOut = args.mdOut ?? resolve(defaultOutDir, "handoff.md");
  mkdirSync(dirname(jsonOut), { recursive: true });
  mkdirSync(dirname(mdOut), { recursive: true });
  writeFileSync(jsonOut, jsonText);
  writeFileSync(mdOut, human);

  process.stdout.write(human);
  process.stdout.write(`\nMachine-readable report: ${jsonOut}\n`);
  process.stdout.write(`Human-readable report: ${mdOut}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
