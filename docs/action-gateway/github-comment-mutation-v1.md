# github.comment.create.v1 — GitHub Comment Mutation Design

**Status: DESIGNED · NOT IMPLEMENTED · NO GITHUB WRITE**

Issue: [#41](https://github.com/yasutakesougo/ai-development-control-center/issues/41)  
Capability ID: `github.comment.create.v1`  
Schema: `ACTION-GATEWAY-COMMENT-REQUEST-V1` / `ACTION-GATEWAY-COMMENT-RESULT-V1`  
Companion contract helpers: `src/domain/actionGatewayCommentContract.ts`  
Gateway overview: `action-gateway-v1.md`

```text
DESIGN ONLY
CREATE-ONLY top-level Issue / PR conversation comment
EXECUTION / ADAPTER = NOT AUTHORIZED
```

Baseline:

```text
main = 7305e7dd2a15f7e6f2995332b2fdce42090ea0c2
STATUS-OVERLAY authorizesMutation = false (MUST remain false)
canonical repository = yasutakesougo/ai-development-control-center
```

---

## 1. Capability scope

### Included (exactly one mutation)

Post **one** top-level GitHub Issue or Pull Request **conversation** comment on an
**already existing** target in the allowlisted repository.

GitHub mapping (future adapter only):

```text
POST /repos/{owner}/{repo}/issues/{number}/comments
```

PR conversation comments use the same Issues Comments API. Inline review
comments / review submissions are out of scope.

### Explicitly excluded

```text
edit / delete comment
inline PR review comments (pulls/.../comments)
submit PR review (APPROVE / REQUEST_CHANGES / COMMENT review)
create Issue
close / reopen Issue or PR
labels / assignees / milestones
Draft → Ready
Merge
workflow_dispatch
repository contents writes
HISTORY writes
Cloudflare / SharePoint mutation
Agent execution
```

---

## 2. Machine-readable request contract

TypeScript-shaped design (also mirrored in
`src/domain/actionGatewayCommentContract.ts`). **Not wired to runtime.**

```ts
type ActionGatewayCommentRequestV1 = {
  schemaVersion: "ACTION-GATEWAY-COMMENT-REQUEST-V1";
  capabilityId: "github.comment.create.v1";

  repository: "yasutakesougo/ai-development-control-center"; // V1 allowlist exact
  target: {
    kind: "ISSUE" | "PULL_REQUEST";
    number: number; // positive integer; must already exist
  };

  body: string;      // comment markdown/plaintext; size-limited
  purpose: string;   // human-readable reason (evidence / handoff / review note)

  idempotencyKey: string; // client-supplied stable key for this attempt

  requestedBy: {
    principalKind: "HUMAN";
    subjectId: string; // opaque non-secret subject identifier
    issuer?: string;   // optional issuer; never a token
  };

  /** Explicit Human authorization — never inferred from STATUS-OVERLAY. */
  humanAuthorization: {
    authorizedCapabilityId: "github.comment.create.v1";
    authorizedRepository: string;
    authorizedTarget: { kind: "ISSUE" | "PULL_REQUEST"; number: number };
    /** Must equal computeCommentRequestFingerprint(requestFacts). */
    authorizedRequestFingerprint: string;
    /** Must equal request.idempotencyKey (one Human auth ⇒ one attempt key). */
    authorizedIdempotencyKey: string;
    authorizedAt: string; // ISO-8601
    /**
     * Absolute expiry. If omitted, effective expiry =
     * authorizedAt + ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS (1h).
     */
    expiresAt?: string;
    evidenceRefs: string[]; // non-secret refs (e.g. authorizing comment URLs)
  };

  /**
   * Observations the authorizer used when binding approval.
   * Gateway re-observes and compares before any write.
   */
  expectedObservations: {
    repository: string;
    targetKind: "ISSUE" | "PULL_REQUEST";
    targetNumber: number;
    targetExists: true;
    /** Optional stronger binding when observed. */
    targetNodeId?: string;
    targetTitle?: string;
  };
};
```

### Request fingerprint (canonical)

Fingerprint covers **semantic mutation facts only**:

```text
capabilityId
repository
target.kind
target.number
body
purpose
```

MUST exclude:

```text
idempotencyKey
requestedBy
humanAuthorization.*
expectedObservations.*
timestamps / audit metadata
tokens / secrets
```

Canonicalization: deterministic JSON (sorted object keys) → SHA-256 hex
(same family as Approval Ledger `canonicalJson` / decision fingerprint).

Human authorization must bind to that fingerprint **and** to
`authorizedIdempotencyKey === request.idempotencyKey`. Content fingerprint
alone is not enough to reuse one authorization across different attempt keys.

### Authorization lifetime

```text
evaluation clock          = independent nowIso (REQUIRED)
                            NEVER derived from authorizedAt
effectiveExpiry           = expiresAt  if present
                          = authorizedAt + DEFAULT_TTL (1h)  if expiresAt omitted
nowIso > effectiveExpiry  ⇒ REJECTED_AUTHORIZATION_EXPIRED
nowIso missing/invalid    ⇒ REJECTED_EVALUATION_CLOCK_MISSING
```

---

## 3. Machine-readable result contract

```ts
type ActionGatewayCommentResultStatus =
  | "SUCCEEDED"
  | "REJECTED"
  | "FAILED"
  | "UNKNOWN";

type ActionGatewayCommentResultV1 = {
  schemaVersion: "ACTION-GATEWAY-COMMENT-RESULT-V1";
  capabilityId: "github.comment.create.v1";
  status: ActionGatewayCommentResultStatus;

  repository: string;
  target: { kind: "ISSUE" | "PULL_REQUEST"; number: number };

  /** Present only when status === SUCCEEDED and creation is positively confirmed. */
  comment?: {
    id: number;
    url: string;
  };

  requestFingerprint: string;
  idempotencyKey: string;

  authorization: {
    matched: boolean;
    evidenceRefs: string[];
  };

  timestamps: {
    acceptedAt?: string;  // gateway accepted request for evaluation
    attemptedAt?: string; // adapter write attempted (absent on REJECTED)
    completedAt: string;  // terminal result time
  };

  reasonCode: string;     // stable machine code (see §6)
  reasonMessage: string;  // non-secret human-readable summary

  /** Never include tokens, Authorization headers, or raw credential material. */
};
```

---

## 4. Authorization rules (fail-closed)

1. STATUS-OVERLAY recommendation alone **never** authorizes this mutation.
2. `recommendedNextAction.authorizesMutation` remains **`false`** and is not an
   input to the Gateway authorizer.
3. Mutation requires `humanAuthorization` bound to **exact**
   `capabilityId + repository + target + requestFingerprint + idempotencyKey`.
4. Missing / malformed / expired / mismatched authorization ⇒ `REJECTED`
   before any GitHub write. Default TTL applies when `expiresAt` is omitted.
5. Repository allowlist (V1) is exactly
   `yasutakesougo/ai-development-control-center`.
6. Target must already exist and be **live re-observed** as existing before
   write (`observedTargetExists === true` required; omitted observation fails
   closed). If `expectedObservations` includes `targetNodeId` / `targetTitle`,
   matching live observations are required (not optional).
7. Authorization for number N cannot be replayed against number M.
8. Authorization for `github.comment.create.v1` cannot authorize Ready / Merge /
   Close / workflow dispatch / repository-file writes / other capabilities.
9. Same `idempotencyKey` (within principal+capability+repository scope) must not
   create a second comment; return the prior terminal result.
   Different key requires a **new** Human authorization whose
   `authorizedIdempotencyKey` matches that key.
10. Secrets / tokens never appear in request, result, UI, logs, or persisted
    evidence documents.

### Authorization binder checklist

```text
authorizedCapabilityId  == request.capabilityId == allowlist entry
authorizedRepository    == request.repository == allowlist repo
                            == expectedObservations.repository
authorizedTarget        == request.target == expectedObservations target
authorizedRequestFingerprint == computeCommentRequestFingerprint(...)
authorizedIdempotencyKey == request.idempotencyKey
nowIso provided independently of authorizedAt
nowIso <= effectiveExpiry (expiresAt or authorizedAt+DEFAULT_TTL)
evidenceRefs non-empty and non-secret
live re-observation: observedTargetExists === true
  + if expected targetNodeId/title set → live observed values required and equal
```

Any failure ⇒ `REJECTED` / no adapter call.

---

## 5. Idempotency

### Scope

```text
idempotency scope =
  capabilityId
  + repository
  + requestedBy.issuer? + requestedBy.subjectId
  + idempotencyKey
```

### Rules

| Situation | Required behavior |
|---|---|
| First attempt, all checks pass, write confirmed | Store terminal `SUCCEEDED` under key; return comment id/url |
| Retry with **same** key after `SUCCEEDED` | Return prior `SUCCEEDED` (**no** second GitHub POST) |
| Retry with **same** key after `REJECTED` | Return prior `REJECTED` (deterministic); do not invent success |
| Retry with **same** key after `FAILED` | Return prior `FAILED` unless a later Human-authorized recovery design says otherwise (V1: no auto-retry write) |
| Retry with **same** key while prior is `UNKNOWN` | Run **reconciliation only** (§6); do not blindly POST again |
| Different key, same content fingerprint | **Forbidden** with the prior Human auth. Requires a **new** authorization whose `authorizedIdempotencyKey` equals the new key. Reusing prior auth ⇒ `REJECTED_IDEMPOTENCY_KEY_MISMATCH` |
| Missing / empty idempotencyKey | `REJECTED` |
| Auth `authorizedIdempotencyKey` ≠ request key | `REJECTED_IDEMPOTENCY_KEY_MISMATCH` |

Duplicate publication for the same `idempotencyKey` is **forbidden**.
One Human authorization authorizes **exactly one** idempotencyKey.

---

## 6. Outcome semantics (REJECTED / FAILED / UNKNOWN / SUCCEEDED)

| Status | Meaning | GitHub write attempted? |
|---|---|---|
| `REJECTED` | Deterministic policy / auth / validation failure | **No** |
| `FAILED` | Write attempted and failure **positively confirmed** (e.g. HTTP 4xx/5xx with conclusive body, or confirmed non-creation) | **Yes** |
| `UNKNOWN` | Write may have been attempted but success/failure **cannot be proven** (timeout, truncated response, ambiguous error) | Maybe |
| `SUCCEEDED` | Created comment **positively confirmed** (comment id + url observed) | **Yes** |

### UNKNOWN reconciliation (mandatory)

On `UNKNOWN` or UNKNOWN retry:

```text
1. Look up idempotency store for a prior terminal SUCCEEDED under the same scope.
   - If found → return that SUCCEEDED (no new write).
2. Optionally search recent comments on the target for an embedded
   non-secret idempotency marker (design: HTML comment or footer line
   containing the idempotencyKey). If exactly one match → treat as SUCCEEDED
   and record it.
3. If still unproven → remain UNKNOWN.
4. Do NOT automatically POST again unless reconciliation proves no prior success
   AND a later Human-authorized recovery slice explicitly allows a new attempt
   (NOT AUTHORIZED in this design-only slice).
```

Malformed input / auth always fails closed as `REJECTED` **before** mutation.

### Stable reason codes (non-exhaustive)

```text
REJECTED_SCHEMA
REJECTED_CAPABILITY_NOT_ALLOWED
REJECTED_REPOSITORY_NOT_ALLOWED
REJECTED_AUTHORIZATION_MISSING
REJECTED_AUTHORIZATION_MISMATCH
REJECTED_AUTHORIZATION_EXPIRED
REJECTED_FINGERPRINT_MISMATCH
REJECTED_TARGET_NOT_FOUND
REJECTED_TARGET_MISMATCH
REJECTED_PAYLOAD_LIMIT
REJECTED_IDEMPOTENCY_KEY_MISSING
REJECTED_IDEMPOTENCY_KEY_MISMATCH
REJECTED_OBSERVATION_MISSING
REJECTED_EVALUATION_CLOCK_MISSING
REJECTED_OVERLAY_NOT_AUTHORIZATION   // if caller tries to treat overlay as auth
FAILED_GITHUB_HTTP
FAILED_GITHUB_CONFIRMED
UNKNOWN_GITHUB_OUTCOME
SUCCEEDED_CREATED
SUCCEEDED_IDEMPOTENT_REPLAY
```

---

## 7. Payload limits (design)

```text
body max length        = 65536 Unicode code points (GitHub practical bound; impl may tighten)
purpose max length     = 2048
evidenceRefs max count = 16
evidenceRefs max each  = 2048
idempotencyKey         = non-empty, max 128, printable ASCII
authorizedIdempotencyKey = same constraints; must equal idempotencyKey
default auth TTL       = 1 hour from authorizedAt when expiresAt omitted
```

Body MUST NOT contain credential material (token patterns fail closed as
`REJECTED_PAYLOAD_LIMIT` / content policy — exact detectors are implementation
detail; design requires a deny-on-secret-scan hook before write).

---

## 8. Check placement map

| Concern | Location |
|---|---|
| Authentication | Action Gateway entry |
| Human authorization binder | Before observation finalize / before adapter |
| Capability allowlist | Capability validator (`github.comment.create.v1` only) |
| Repository allowlist | Capability validator |
| Exact target binding | Auth binder + **required** live target re-observation |
| Request fingerprint | Computed from semantic facts; compared to `authorizedRequestFingerprint` |
| Attempt key binding | `authorizedIdempotencyKey == request.idempotencyKey` |
| Auth lifetime | Independent `nowIso` vs `expiresAt` or `authorizedAt+DEFAULT_TTL` |
| Idempotency store | After auth+observation pass; before adapter |
| Payload limits / secret scan | Request validation (pre-adapter) |
| GitHub outcome reconciliation | Adapter result handler |
| UNKNOWN vs FAILED | Outcome reconciler (no auto-retry write) |
| Audit evidence | Every terminal `ActionGatewayCommentResultV1` |

---

## 9. Threat / failure table

| Threat / failure | Mitigation |
|---|---|
| Overlay “next action” treated as auth | Explicit rule: overlay never authorizes; reason `REJECTED_OVERLAY_NOT_AUTHORIZATION` |
| Auth replay on different Issue/PR | Exact target + fingerprint binding |
| Auth reused with a different idempotencyKey | `authorizedIdempotencyKey` exact match |
| Clock derived from `authorizedAt` skips expiry | Independent required `nowIso`; default TTL always applied when `expiresAt` omitted |
| Skipping live target probe | `observedTargetExists === true` required; expected nodeId/title require live values |
| Auth for comment used as Ready/Merge | Capability allowlist exact-match only |
| Cross-repo write | Repository allowlist exact-match |
| Network retry duplicates comment | Idempotency key scope + replay prior result |
| Timeout after comment created | UNKNOWN + reconciliation via store / marker; no blind retry |
| Token leakage into evidence | Result/request schemas forbid secrets; redaction invariant in tests |
| Adapter implemented “early” in this PR | `ACTION_GATEWAY_EXECUTION_IMPLEMENTED = false`; no Worker write route in this slice |

---

## 10. Example fixtures

See `fixtures/`:

| File | Expected status |
|---|---|
| `request-valid.json` + matching auth | Would be eligible for future SUCCEEDED path (execution still NOT IMPLEMENTED) |
| `result-succeeded.json` | `SUCCEEDED` |
| `result-rejected-auth-mismatch.json` | `REJECTED` |
| `result-failed-github.json` | `FAILED` |
| `result-unknown-timeout.json` | `UNKNOWN` |

---

## 11. Testable invariants (future implementation + design helpers)

Contract helpers in `src/domain/actionGatewayCommentContract.ts` encode:

1. Only `github.comment.create.v1` is allowlisted.
2. Only canonical repository is allowlisted.
3. Content fingerprint excludes idempotency / auth / timestamps; attempt uniqueness
   is enforced via `authorizedIdempotencyKey`.
4. Auth mismatch / fingerprint mismatch / missing key / key mismatch ⇒ `REJECTED`
   without marking a write attempt.
5. Overlay document is never accepted as `humanAuthorization`.
6. Independent `nowIso` required; default TTL enforced when `expiresAt` omitted.
7. Live `observedTargetExists === true` required; expected nodeId/title require
   live observed values.
8. `SUCCEEDED` requires comment id+url; `REJECTED` forbids comment field and
   forbids `attemptedAt`.
9. UNKNOWN reconciliation prefers prior SUCCEEDED over new write.
10. `ACTION_GATEWAY_EXECUTION_IMPLEMENTED === false` in this slice.

---

## 12. Acceptance (design slice)

| # | Gate | Design response |
|---|---|---|
| 1 | Exactly one create-only top-level comment mutation | §1 |
| 2 | Exact-target + exact-request auth | §4 |
| 3 | STATUS-OVERLAY remains non-authorizing | §4.1–4.2 |
| 4 | Fail-closed explicit | §4–§6 |
| 5 | Idempotency / duplicate prevention | §5 |
| 6 | UNKNOWN reconciliation | §6 |
| 7 | No mutation implementation | Status + `EXECUTION_IMPLEMENTED=false` |
| 8 | No token scope expansion | Non-goals |
| 9 | No Ready/Merge/Close/workflow/file-write capability | §1 excluded + gateway allowlist |
| 10 | `npm run verify` | Contract unit tests |

---

## 13. Delivery boundary

```text
This PR: docs + pure contract helpers + tests
NOT this PR: GitHub adapter, Worker write route, token changes, production comment posts
Next Human gate: Fresh Review of the design Draft PR
Ready / Merge: NOT YET
```
