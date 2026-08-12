import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GENERATOR = "ARCH-SNAPSHOT-GEN-V1";
export const SCHEMA_VERSION = "1.0";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(root, "docs/architecture");

const fact = (id, name, responsibility, evidence, extra = {}) => ({
  id,
  name,
  responsibility,
  status: "confirmed",
  confidence: "high",
  evidence,
  ...extra,
});

export function buildSnapshot(commit, generatedAt = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedFrom: {
      repository: "ai-development-control-center",
      commit,
      generatedAt,
      generator: GENERATOR,
    },
    confidence: {
      overall: "high",
      notes: [
        "Implemented paths are grounded in repository source and configuration.",
        "Future execution and refresh behavior remains explicitly unknown or held.",
      ],
    },
    components: [
      fact("worker-router", "Worker entry/router", "Routes status, auth, Ledger API, and static asset requests.", ["src/worker/index.ts"], { layer: 1 }),
      fact("github-observer", "GitHub read-only observation", "Reads repository, branch, pull request, checks/status, and reviews through GET requests; failures become fail-closed evidence.", ["src/worker/github/readOnlyAdapter.ts"], { layer: 2 }),
      fact("human-action", "HumanAction resolution", "Maps ObservedFacts to UNKNOWN, WAIT, NO_ACTION, or ACTION_REQUIRED without treating incomplete evidence as actionable.", ["src/domain/humanActionResolver.ts", "src/domain/observedFacts.ts"], { layer: 3 }),
      fact("decision-fingerprint", "Recordable decision fingerprint", "Builds canonical CONFIRMED + ACTION_REQUIRED decision facts and computes the authoritative server-side SHA-256 fingerprint.", ["src/domain/decisionFingerprint.ts", "src/worker/statusApi.ts"], { layer: 4 }),
      fact("access-auth", "Cloudflare Access authentication", "Verifies Access JWT issuer, audience, RS256 signature, validity, subject, and Human principal status.", ["src/worker/auth/accessJwtVerifier.ts", "src/worker/auth/authStatus.ts"], { layer: 5 }),
      fact("ledger-guard", "Ledger authorization guard", "Applies fail-closed authenticate-then-authorize checks for ledger.record and ledger.read.", ["src/worker/auth/ledgerGuard.ts", "src/worker/auth/ledgerAuthorizer.ts"], { layer: 6 }),
      fact("ledger-api", "Approval Ledger API", "Handles authenticated GET/POST, re-observes before writes, checks idempotency and freshness, and appends recordable decisions.", ["src/worker/ledger/recordsApi.ts", "src/worker/index.ts"], { layer: 7 }),
      fact("d1-store", "D1 Ledger store", "Provides append-only record and recent-history operations with database-enforced invariants.", ["src/worker/ledger/ledgerStore.ts", "migrations/0001_approval_ledger.sql"], { layer: 8 }),
      fact("approval-ui", "Approval intent UI", "Shows decision context and submits APPROVE, REJECT, or DEFER only when the UI gate allows it.", ["src/ui/App.tsx", "src/ui/ApprovalIntentPanel.tsx", "src/ui/LedgerRecordControls.tsx"], { layer: 5 }),
      fact("history-ui", "Ledger history UI", "Reads and renders recent immutable records, empty state, auth failures, and NOT EXECUTED status.", ["src/ui/App.tsx", "src/ui/ledgerApi.ts", "src/ui/LedgerHistoryPanel.tsx"], { layer: 9 }),
      fact("staging-config", "Cloudflare staging configuration", "Wires the isolated staging Worker to Access policy mode and staging-only LEDGER_DB.", ["wrangler.jsonc", "docs/mvp-3-approval-ledger-staging-pilot-v1.md"], { layer: 1 }),
      fact("handoff-live-observer", "HANDOFF live GitHub reconciliation", "Reads this repository's default-branch tip, open PRs, checks/status, reviews, and Human-Decision markers through GET-only requests; failures become fail-closed live evidence.", ["src/domain/observeHandoffLiveState.ts", "docs/handoff/README.md"], { layer: 2 }),
      fact("handoff-evaluator", "HANDOFF-V1 evaluator", "Compares architecture.json to current main, classifies snapshot staleness, preserves confirmed/assumed/unknown facts, and resolves nextAction as NO_ACTION, ACTION_REQUIRED, or UNKNOWN without inventing work.", ["src/domain/handoffEvaluator.ts", "src/domain/architectureSnapshot.ts", "docs/handoff/README.md"], { layer: 3 }),
      fact("handoff-report", "HANDOFF report generation", "Emits machine-readable handoff.json and Human-readable handoff.md from an evaluated HandoffReport; decision-support only, no Ledger write or execution.", ["src/domain/formatHandoffReport.ts", "src/domain/handoffReport.ts", "scripts/run-handoff.ts"], { layer: 4 }),
    ],
    dependencies: [
      fact("dep-route-observe", "route status", "Worker invokes observation for status and record validation.", ["src/worker/index.ts", "src/worker/ledger/recordsApi.ts"], { source: "worker-router", target: "github-observer" }),
      fact("dep-observe-github", "GitHub REST GET", "Observer reads the configured external repository.", ["src/worker/github/readOnlyAdapter.ts"], { source: "github-observer", target: "ext-github" }),
      fact("dep-observe-action", "ObservedFacts", "Observation feeds fail-closed HumanAction resolution.", ["src/worker/index.ts", "src/domain/humanActionResolver.ts"], { source: "github-observer", target: "human-action" }),
      fact("dep-action-fingerprint", "recordability", "HumanAction and evidence determine whether canonical facts exist.", ["src/domain/decisionFingerprint.ts"], { source: "human-action", target: "decision-fingerprint" }),
      fact("dep-ui-router", "status + record requests", "Approval UI uses Worker APIs.", ["src/ui/App.tsx", "src/ui/ledgerApi.ts"], { source: "approval-ui", target: "worker-router" }),
      fact("dep-router-api", "GET/POST /api/ledger/records", "Worker routes Ledger requests to the API.", ["src/worker/index.ts"], { source: "worker-router", target: "ledger-api" }),
      fact("dep-api-guard", "capability check", "Ledger API requires read or record capability before store access.", ["src/worker/ledger/recordsApi.ts"], { source: "ledger-api", target: "ledger-guard" }),
      fact("dep-guard-auth", "verified Human principal", "Guard authenticates via Access before authorization.", ["src/worker/auth/ledgerGuard.ts"], { source: "ledger-guard", target: "access-auth" }),
      fact("dep-auth-access", "JWT/JWKS", "Authentication trusts configured Access issuer and audience.", ["src/worker/auth/accessJwtVerifier.ts", "wrangler.jsonc"], { source: "access-auth", target: "ext-access" }),
      fact("dep-api-fingerprint", "fresh fingerprint", "POST recomputes and compares the current server fingerprint.", ["src/worker/ledger/recordsApi.ts"], { source: "ledger-api", target: "decision-fingerprint" }),
      fact("dep-api-store", "append/list", "Ledger API accesses the store only after its gates.", ["src/worker/ledger/recordsApi.ts"], { source: "ledger-api", target: "d1-store" }),
      fact("dep-store-d1", "D1 SQL", "Store persists immutable records in Cloudflare D1.", ["src/worker/ledger/ledgerStore.ts", "migrations/0001_approval_ledger.sql"], { source: "d1-store", target: "ext-d1" }),
      fact("dep-history-router", "GET records", "History UI fetches recent records through the Worker.", ["src/ui/ledgerApi.ts", "src/ui/LedgerHistoryPanel.tsx"], { source: "history-ui", target: "worker-router" }),
      fact("dep-config-runtime", "staging bindings", "Staging config supplies Access and D1 bindings to runtime gates.", ["wrangler.jsonc"], { source: "staging-config", target: "ledger-guard" }),
      fact("dep-handoff-live-github", "control-center GitHub GET", "HANDOFF live observer reads this repository through GET-only GitHub REST calls.", ["src/domain/observeHandoffLiveState.ts"], { source: "handoff-live-observer", target: "ext-github" }),
      fact("dep-handoff-live-eval", "live state", "HANDOFF evaluator consumes fail-closed live observation when classifying nextAction and live differences.", ["src/domain/handoffEvaluator.ts", "scripts/run-handoff.ts"], { source: "handoff-live-observer", target: "handoff-evaluator" }),
      fact("dep-handoff-eval-report", "HandoffReport", "Evaluated handoff facts are formatted into machine- and Human-readable reports.", ["src/domain/formatHandoffReport.ts", "scripts/run-handoff.ts"], { source: "handoff-evaluator", target: "handoff-report" }),
    ],
    flows: [
      fact("flow-observation", "Observe and resolve", "Read-only GitHub observation becomes a HumanAction and optional recordable fingerprint.", ["src/worker/index.ts", "src/worker/github/readOnlyAdapter.ts", "src/domain/humanActionResolver.ts", "src/domain/decisionFingerprint.ts"], {
        steps: ["ext-github", "github-observer", "human-action", "decision-fingerprint", "approval-ui"],
        dependencyIds: ["dep-observe-github", "dep-observe-action", "dep-action-fingerprint"],
      }),
      fact("flow-ledger-record", "Human-gated Ledger record", "A recordable decision passes Human authentication and authorization before append-only persistence and history display.", ["src/ui/App.tsx", "src/worker/ledger/recordsApi.ts", "src/worker/auth/ledgerGuard.ts", "src/worker/ledger/ledgerStore.ts", "src/ui/LedgerHistoryPanel.tsx"], {
        steps: ["ext-github", "github-observer", "human-action", "decision-fingerprint", "gate-human-decision", "access-auth", "ledger-guard", "ledger-api", "d1-store", "ext-d1", "history-ui"],
        dependencyIds: ["dep-observe-github", "dep-observe-action", "dep-action-fingerprint", "dep-guard-auth", "dep-api-guard", "dep-api-fingerprint", "dep-api-store", "dep-store-d1"],
      }),
      fact("flow-handoff-reconcile", "HANDOFF-V1 context reconciliation", "Architecture Snapshot facts plus current main and read-only GitHub live state produce a fail-closed handoff report without regenerating the Snapshot or authorizing execution.", ["scripts/run-handoff.ts", "src/domain/observeHandoffLiveState.ts", "src/domain/handoffEvaluator.ts", "src/domain/formatHandoffReport.ts", "docs/handoff/README.md"], {
        steps: ["ext-github", "handoff-live-observer", "handoff-evaluator", "handoff-report"],
        dependencyIds: ["dep-handoff-live-github", "dep-handoff-live-eval", "dep-handoff-eval-report"],
      }),
    ],
    externalSystems: [
      fact("ext-github", "GitHub", "Observed read-only for repository and pull-request evidence.", ["src/worker/github/readOnlyAdapter.ts"], { layer: 1 }),
      fact("ext-access", "Cloudflare Access", "Authenticates interactive Human principals for the staging Worker.", ["src/worker/auth/accessJwtVerifier.ts", "wrangler.jsonc"], { layer: 5 }),
      fact("ext-d1", "Cloudflare D1", "Hosts the isolated staging Approval Ledger database.", ["wrangler.jsonc", "migrations/0001_approval_ledger.sql"], { layer: 9 }),
    ],
    humanGates: [
      fact("gate-human-decision", "Explicit Human decision", "A write requires CONFIRMED evidence, ACTION_REQUIRED, an explicit intent, and an authenticated/authorized Human.", ["src/domain/decisionFingerprint.ts", "src/ui/App.tsx", "src/worker/ledger/recordsApi.ts"], { layer: 5 }),
      fact("gate-human-review", "PR lifecycle decisions", "Ready and merge decisions remain Human actions; the Control Center observes but does not execute them.", ["src/domain/humanDecisionEvidence.ts", "src/domain/humanActionResolver.ts"], { layer: 3 }),
    ],
    holds: [
      fact("hold-no-recordable-decision", "No recordable decision", "Ledger POST returns NO_RECORDABLE_DECISION unless evidence is CONFIRMED and HumanAction is ACTION_REQUIRED.", ["src/worker/ledger/recordsApi.ts", "src/domain/decisionFingerprint.ts"]),
      fact("hold-execution", "Execution disabled", "Ledger records declare externalEffect=false and the UI labels them NOT EXECUTED.", ["src/worker/ledger/ledgerStore.ts", "migrations/0001_approval_ledger.sql", "src/ui/LedgerHistoryPanel.tsx"]),
    ],
    decisions: [
      fact("decision-fail-closed", "Fail closed on incomplete evidence or auth", "Unknown observation, invalid Access identity, and absent authorization policy deny progress.", ["src/domain/humanActionResolver.ts", "src/worker/auth/ledgerGuard.ts"]),
      fact("decision-append-only", "Ledger is append-only", "Application exposes no update/delete path and D1 triggers reject both operations.", ["src/worker/ledger/ledgerStore.ts", "migrations/0001_approval_ledger.sql"]),
      fact("decision-handoff-decision-support", "HANDOFF is decision-support only", "HANDOFF-V1 reconstructs current state and nextAction without regenerating the Snapshot, writing the Ledger, mutating GitHub/Cloudflare, or authorizing execution.", ["docs/handoff/README.md", "src/domain/handoffEvaluator.ts", "scripts/run-handoff.ts"]),
    ],
    unknowns: [
      { id: "unknown-action-gateway", name: "Action Gateway contract", responsibility: "No Action Gateway implementation or approved contract exists in this snapshot.", status: "unknown", confidence: "high", evidence: ["src/worker/index.ts", "src/worker/ledger/recordsApi.ts"] },
      { id: "unknown-agent-execution", name: "Agent execution path", responsibility: "No path from Ledger records to Agent execution is implemented.", status: "unknown", confidence: "high", evidence: ["src/worker/ledger/ledgerStore.ts", "src/ui/LedgerHistoryPanel.tsx"] },
      { id: "unknown-auto-refresh", name: "Automatic snapshot refresh", responsibility: "Watcher, scheduled regeneration, and staleness automation are not defined in V1.", status: "unknown", confidence: "high", evidence: ["docs/architecture/README.md"] },
    ],
    assumptions: [
      { id: "assumption-target-repository", name: "Observation target remains configured in code", responsibility: "The snapshot assumes the current hard-coded severe-behavior-support-spfx observation target remains intentional until a later decision changes it.", status: "assumed", confidence: "medium", evidence: ["src/worker/index.ts"] },
    ],
    staleIndicators: [
      fact("stale-head", "Repository HEAD differs", "Compare repository HEAD with generatedFrom.commit.", ["scripts/generate-architecture-snapshot.mjs"]),
      fact("stale-worker", "Worker sources changed", "Treat changes under src/worker/** as architecture-relevant.", ["src/worker/index.ts"]),
      fact("stale-config", "Architecture configuration changed", "Treat wrangler.jsonc, migrations/**, package.json, and architecture generator changes as relevant.", ["wrangler.jsonc", "migrations/0001_approval_ledger.sql", "package.json"]),
      fact("stale-handoff", "HANDOFF-V1 sources changed", "Treat changes to scripts/run-handoff.ts and HANDOFF domain modules as architecture-relevant.", ["scripts/run-handoff.ts", "src/domain/handoffEvaluator.ts", "src/domain/observeHandoffLiveState.ts", "src/domain/formatHandoffReport.ts", "src/domain/handoffReport.ts", "src/domain/architectureSnapshot.ts"]),
      fact("stale-generator", "Schema or generator changed", `Regenerate when schemaVersion differs from ${SCHEMA_VERSION} or generator differs from ${GENERATOR}.`, ["scripts/generate-architecture-snapshot.mjs"]),
    ],
  };
}

function escapeEmbeddedJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function renderHtml(snapshot) {
  const data = escapeEmbeddedJson(snapshot);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Architecture Snapshot · ai-development-control-center</title>
<style>
:root{color-scheme:dark;--bg:#07111f;--panel:#101e31;--line:#41627f;--text:#e7f0f8;--muted:#9fb2c4;--cyan:#48d6d2;--amber:#f4bd50;--red:#f07878;--blue:#76a9fa}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#17304c 0,#07111f 42%);color:var(--text);font:14px/1.5 system-ui,sans-serif}header{padding:26px 30px 18px;border-bottom:1px solid #29425a}h1{margin:0;font-size:26px}.meta{color:var(--muted);font-family:ui-monospace,monospace}.layout{display:grid;grid-template-columns:minmax(620px,1fr) 340px;gap:18px;padding:18px}.panel{background:color-mix(in srgb,var(--panel) 94%,transparent);border:1px solid #29425a;border-radius:12px;box-shadow:0 18px 45px #0004}.toolbar{display:flex;gap:8px;align-items:center;padding:12px 14px;border-bottom:1px solid #29425a}.toolbar label{color:var(--muted)}select{background:#0a1728;color:var(--text);border:1px solid #41627f;border-radius:6px;padding:7px 10px}#graph{width:100%;min-height:660px;display:block}.edge{stroke:var(--line);stroke-width:1.5;fill:none;marker-end:url(#arrow)}.edge.active{stroke:var(--amber);stroke-width:3}.node rect{fill:#13263c;stroke:#42637e;stroke-width:1.5}.node text{fill:var(--text);font-size:12px;pointer-events:none}.node .kind{fill:var(--muted);font-size:9px;text-transform:uppercase}.node.active rect{stroke:var(--amber);stroke-width:3;filter:drop-shadow(0 0 7px #f4bd5066)}.node.selected rect{stroke:var(--cyan);stroke-width:3}.node.humanGate rect{fill:#3b2d12;stroke:var(--amber)}.node.externalSystem rect{fill:#17243d;stroke:var(--blue)}aside{padding:18px;min-height:300px}aside h2{margin-top:0}.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;text-transform:uppercase;margin-right:5px}.confirmed{background:#123b38;color:#71e0d8}.assumed{background:#493713;color:#ffd37a}.unknown{background:#462429;color:#ffabab}.evidence{padding-left:18px;color:var(--muted);font-family:ui-monospace,monospace;font-size:12px}.warnings{margin:0 18px 18px;padding:14px 18px}.warnings h2{margin:0 0 8px;color:var(--amber)}.legend{display:flex;gap:12px;margin-left:auto;color:var(--muted);font-size:12px}@media(max-width:980px){.layout{grid-template-columns:1fr}.layout>aside{min-height:auto}}
</style>
</head>
<body>
<header><h1>Architecture Snapshot</h1><div class="meta">commit <span id="commit"></span> · generated <span id="generated"></span></div></header>
<main>
<section class="layout">
<div class="panel"><div class="toolbar"><label for="flow">Flow</label><select id="flow"></select><div class="legend"><span>◆ Human gate</span><span>□ External</span></div></div><svg id="graph" viewBox="0 0 1180 660" role="img" aria-label="Architecture component graph"></svg></div>
<aside class="panel" id="details"><h2>Select a node</h2><p>Choose a component to inspect responsibility and source evidence.</p></aside>
</section>
<section class="panel warnings"><h2>Human Gates, HOLDs & staleness</h2><div id="warnings"></div></section>
</main>
<script id="architecture-data" type="application/json">${data}</script>
<script>
const data=JSON.parse(document.getElementById("architecture-data").textContent);
const categories=[["components","component"],["externalSystems","externalSystem"],["humanGates","humanGate"]];
const nodes=categories.flatMap(([key,kind])=>data[key].map(x=>({...x,kind})));
const byId=new Map(nodes.map(n=>[n.id,n]));
document.getElementById("commit").textContent=data.generatedFrom.commit;
document.getElementById("generated").textContent=data.generatedFrom.generatedAt;
const flowSelect=document.getElementById("flow");
flowSelect.innerHTML='<option value="">All dependencies</option>'+data.flows.map(f=>'<option value="'+f.id+'">'+f.name+'</option>').join("");
const svg=document.getElementById("graph"),NS="http://www.w3.org/2000/svg";
const positions=new Map();
const grouped=new Map();
for(const n of nodes){const layer=n.layer||5;if(!grouped.has(layer))grouped.set(layer,[]);grouped.get(layer).push(n)}
for(const [layer,items] of grouped){items.forEach((n,i)=>positions.set(n.id,{x:34+(layer-1)*126,y:70+i*150}))}
function el(name,attrs={}){const x=document.createElementNS(NS,name);Object.entries(attrs).forEach(([k,v])=>x.setAttribute(k,v));return x}
const defs=el("defs"),marker=el("marker",{id:"arrow",viewBox:"0 0 10 10",refX:"9",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto-start-reverse"});marker.append(el("path",{d:"M 0 0 L 10 5 L 0 10 z",fill:"context-stroke"}));defs.append(marker);svg.append(defs);
const edgeLayer=el("g"),nodeLayer=el("g");svg.append(edgeLayer,nodeLayer);
function render(){
 const flow=data.flows.find(f=>f.id===flowSelect.value),activeNodes=new Set(flow?.steps||[]),activeEdges=new Set(flow?.dependencyIds||[]);
 edgeLayer.replaceChildren();nodeLayer.replaceChildren();
 for(const d of data.dependencies){const a=positions.get(d.source),b=positions.get(d.target);if(!a||!b)continue;const edge=el("path",{class:"edge "+(activeEdges.has(d.id)?"active":""),d:"M "+(a.x+112)+" "+(a.y+32)+" C "+(a.x+120)+" "+(a.y+32)+", "+(b.x-12)+" "+(b.y+32)+", "+b.x+" "+(b.y+32)});edgeLayer.append(edge)}
 for(const n of nodes){const p=positions.get(n.id),g=el("g",{class:"node "+n.kind+(activeNodes.has(n.id)?" active":""),tabindex:"0",role:"button"});g.append(el("rect",{x:p.x,y:p.y,width:112,height:64,rx:8}));const kind=el("text",{x:p.x+9,y:p.y+17,class:"kind"});kind.textContent=n.kind.replace(/([A-Z])/g," $1");g.append(kind);const label=el("text",{x:p.x+9,y:p.y+38});const words=n.name.split(" ");let line="";words.forEach(word=>{if((line+" "+word).length>17){const t=el("tspan",{x:p.x+9,dy:line?"14":"0"});t.textContent=line;label.append(t);line=word}else line+=(line?" ":"")+word});const t=el("tspan",{x:p.x+9,dy:label.children.length?"14":"0"});t.textContent=line;label.append(t);g.append(label);g.onclick=()=>show(n,g);g.onkeydown=e=>{if(e.key==="Enter")show(n,g)};nodeLayer.append(g)}
}
function show(n,g){document.querySelectorAll(".node.selected").forEach(x=>x.classList.remove("selected"));g.classList.add("selected");document.getElementById("details").innerHTML='<h2>'+n.name+'</h2><p><span class="badge '+n.status+'">'+n.status+'</span><span class="badge '+n.confidence+'">'+n.confidence+' confidence</span></p><p>'+n.responsibility+'</p><h3>Evidence</h3><ul class="evidence">'+n.evidence.map(x=>'<li>'+x+'</li>').join("")+'</ul>'}
flowSelect.onchange=render;render();
const section=(title,items)=>'<h3>'+title+'</h3>'+items.map(x=>'<p><span class="badge '+x.status+'">'+x.status+'</span><strong>'+x.name+'</strong> — '+x.responsibility+'</p>').join("");
document.getElementById("warnings").innerHTML=section("Human gates",data.humanGates)+section("HOLDs",data.holds)+section("Unknowns",data.unknowns)+section("Assumptions",data.assumptions)+section("Stale indicators",data.staleIndicators);
</script>
</body>
</html>
`;
}

export function writeSnapshot({ commit, generatedAt } = {}) {
  const sourceCommit = commit ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("generatedFrom.commit must be a full Git SHA");
  const snapshot = buildSnapshot(sourceCommit, generatedAt);
  mkdirSync(outputDirectory, { recursive: true });
  const jsonPath = resolve(outputDirectory, "architecture.json");
  writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  // JSON is the source of the Human view; read back the emitted artifact so
  // HTML can never silently diverge into a separately maintained description.
  const emittedSnapshot = JSON.parse(readFileSync(jsonPath, "utf8"));
  writeFileSync(resolve(outputDirectory, "architecture.html"), renderHtml(emittedSnapshot));
  return snapshot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snapshot = writeSnapshot();
  console.log(`Architecture Snapshot generated from ${snapshot.generatedFrom.commit}`);
}
