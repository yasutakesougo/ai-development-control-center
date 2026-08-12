# ACTION-GATEWAY-V1

**Status: DESIGNED · NOT IMPLEMENTED · NO EXECUTION · NO GITHUB WRITE**

This document defines the **Action Gateway** boundary for future narrowly-scoped
write capabilities. The first (and currently only) designed capability is
`github.comment.create.v1` — see `github-comment-mutation-v1.md`.

```text
DESIGN ONLY
EXECUTION = NOT AUTHORIZED
GITHUB MUTATION ADAPTER = NOT IMPLEMENTED
TOKEN SCOPE EXPANSION = FORBIDDEN in this slice
```

Baseline at drafting:

```text
main = 7305e7dd2a15f7e6f2995332b2fdce42090ea0c2
STATUS-OVERLAY-V1 production pilot = PASS / COMPLETE
Issue #39 = CLOSED / COMPLETED
Issue #41 = OPEN (this design)
STATUS-OVERLAY recommendedNextAction.authorizesMutation = false (unchanged)
```

---

## 1. Purpose

Action Gateway is the **only** future path that may turn an explicit Human
authorization into an external write. It exists so that:

- STATUS-OVERLAY / HANDOFF recommendations stay non-authorizing
- Approval Ledger records stay non-executing (`externalEffect=false`)
- each write capability is allowlisted, exact-target bound, and auditable
- UNKNOWN outcomes do not silently become retries or successes

---

## 2. Relationship to other modules

| Module | Role vs Action Gateway |
|---|---|
| STATUS-OVERLAY-V1 | Decision support only. Never authorizes Gateway invoke. |
| Approval Intent / Ledger | May later supply Human intent / durable evidence. Ledger record ≠ executed action. |
| HISTORY-V1 | Audit of snapshot/refresh; not an authorization mechanism. |
| Action Gateway | Future execution boundary for allowlisted capabilities only. |
| Agent execution | Separate, still NOT AUTHORIZED. |

Invariant:

```text
overlay recommendation ≠ authorization
ledger record ≠ execution
Action Gateway invoke requires explicit Human authorization
  bound to capability + repository + target + request fingerprint
```

---

## 3. Future call path (design)

```text
authenticated caller
  → approved intent / Human authorization evidence
  → Action Gateway entry
  → capability allowlist
  → repository allowlist
  → request schema + payload limits
  → request fingerprint + authorized idempotency key
  → exact authorization binder (incl. independent nowIso / default TTL)
  → required live target re-observation
  → idempotency reconciliation
  → capability adapter (e.g. GitHub comment create)
  → outcome reconciliation (SUCCEEDED | FAILED | UNKNOWN)
  → result evidence (no secrets)
```

`REJECTED` must occur **before** any adapter write attempt.

---

## 4. Where each check lives

| Check | Stage | Fail-closed behavior |
|---|---|---|
| Authentication | Gateway entry | Reject; no adapter call |
| Authorization (Human evidence) | authorization binder | `REJECTED`; no adapter call |
| Capability allowlist | capability validator | `REJECTED` if not exactly allowlisted |
| Repository allowlist | capability validator | `REJECTED` if outside allowlist |
| Exact target binding | authorization binder + **required** live observation | `REJECTED` on mismatch / missing observation |
| Request fingerprint | binder compares expected vs computed | `REJECTED` on mismatch |
| Attempt idempotency key | `authorizedIdempotencyKey == request.idempotencyKey` | `REJECTED` on mismatch / reuse |
| Auth lifetime | independent `nowIso` vs expiresAt or authorizedAt+DEFAULT_TTL | `REJECTED` if clock missing or expired |
| Idempotency store | before adapter | Return prior result; never duplicate on same key |
| Payload size/content limits | request validation | `REJECTED`; no adapter call |
| GitHub API outcome reconciliation | after adapter | `SUCCEEDED` / `FAILED` / `UNKNOWN` only with proof rules |
| UNKNOWN vs FAILED | outcome reconciler | No auto-retry write on UNKNOWN |
| Audit evidence | every terminal result | Persist/return metadata without secrets |

---

## 5. Capability allowlist (V1 design)

Only this capability is designed for a future implementation slice:

```text
github.comment.create.v1
```

Explicitly **not** in the V1 allowlist:

```text
github.comment.edit / delete
github.pull_request.review.submit
github.issue.create / close / reopen
github.pull_request.ready / merge
github.workflow.dispatch
repository.contents.write
history.append (writer)
cloudflare.* mutation
sharepoint.* mutation
agent.execute
```

Adding any of the above requires a **new** design + Human authorization slice.

---

## 6. Non-goals for this design slice

```text
GitHub mutation adapter implementation
Worker / API route that performs writes
GITHUB_TOKEN scope expansion
Ready / Merge / Close automation
workflow_dispatch
repository file writes
HISTORY writer
Agent execution
production mutation of any kind
```

---

## 7. Stop / next Human gate

This slice stops at:

```text
design artifacts + Draft PR + verify + Fresh Review
```

Do not Ready. Do not Merge. Do not implement the adapter.
