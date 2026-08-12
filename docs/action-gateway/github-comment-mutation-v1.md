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
    /** Must equal request.requestedBy (one Human auth ⇒ one requester scope). */
    authorizedRequestedBy: {
      principalKind: "HUMAN";
      subjectId: string;
      issuer?: string;
    };
    /**
     * Trusted provenance handle (server-issued). Caller cannot forge the
     * artifact body. Gateway MUST re-verify against authoritative store.
     * evidenceRefs alone never authorize.
     */
    authorizationArtifact: {
      kind: "SERVER_ISSUED_AUTHORIZATION_V1";
      artifactId: string;
      artifactLocator?: string; // non-secret audit locator only
    };
    authorizedAt: string; // ISO-8601
    /**
     * Absolute expiry. If omitted, effective expiry =
     * authorizedAt + ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS (1h).
     * Validity window: authorizedAt <= nowIso <= effectiveExpiry.
     */
    expiresAt?: string;
    /** Supplemental audit pointers only — not authorization provenance. */
    evidenceRefs: string[];
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
`authorizedIdempotencyKey === request.idempotencyKey` **and** to
`authorizedRequestedBy === request.requestedBy`. Content fingerprint
alone is not enough to reuse one authorization across different attempt keys
or requesters.

### Authorization provenance (trusted artifact)

Caller-assembled JSON is never sufficient authorization.

```text
Gateway auth layer
  → authenticatedPrincipal (server-derived)
  → must equal request.requestedBy
  → must equal humanAuthorization.authorizedRequestedBy

humanAuthorization.authorizationArtifact.artifactId
  → trusted store lookup (Approval Ledger grant / authz table / signed artifact)
  → trustedAuthorizationLookup.status === VERIFIED
  → bindings must match capability + repository + target + fingerprint
       + idempotencyKey + requestedBy + authorizedAt/expiresAt
```

`evidenceRefs` are supplemental audit pointers only. Non-empty `evidenceRefs`
without a VERIFIED trusted artifact ⇒ `REJECTED_AUTHORIZATION_ARTIFACT`.

Future artifact issuers (design candidates; implementation NOT AUTHORIZED yet):

```text
Approval Ledger authorization grant id
dedicated Action Gateway authorization table row
server-signed authorization artifact verified by Gateway key material
```

### Authorization lifetime

```text
evaluation clock          = independent nowIso (REQUIRED)
                            NEVER derived from authorizedAt
validity window           = authorizedAt <= nowIso <= effectiveExpiry
effectiveExpiry           = expiresAt  if present
                          = authorizedAt + DEFAULT_TTL (1h)  if expiresAt omitted
nowIso < authorizedAt     ⇒ REJECTED_AUTHORIZATION_NOT_YET_VALID
nowIso > effectiveExpiry  ⇒ REJECTED_AUTHORIZATION_EXPIRED
nowIso missing/invalid    ⇒ REJECTED_EVALUATION_CLOCK_MISSING
```

Live observation must include identity, not only existence:

```text
observedTargetExists === true
observedRepository     == request.repository
observedTargetKind     == request.target.kind
observedTargetNumber   == request.target.number
(+ nodeId/title when expected)
```

### Gateway JSON entry + schema parity

```text
raw HTTP body
  → parseGatewayJsonBody (syntax errors → REJECTED_SCHEMA, no throw)
  → parseActionGatewayCommentRequest
       mirrors JSON Schema including additionalProperties:false
       and evidenceRefs maxItems/maxLength
  → evaluateCommentRequestPreWrite
```

Canonical JSON Schema and runtime accepted shape MUST NOT drift.
Unknown properties (e.g. `operation`) ⇒ `REJECTED_SCHEMA`.

---

## 3. Machine-readable result contract

```ts
type ActionGatewayCommentResultV1 =
  | {
      schemaVersion: "ACTION-GATEWAY-COMMENT-RESULT-V1";
      capabilityId: "github.comment.create.v1";
      status: "SUCCEEDED";
      repository: string;
      target: { kind: "ISSUE" | "PULL_REQUEST"; number: number };
      comment: { id: number; url: string };
      requestFingerprint: string;
      idempotencyKey: string;
      authorization: {
        matched: boolean;
        evidenceRefs: string[];
        artifactId?: string;
      };
      timestamps: {
        acceptedAt?: string;
        attemptedAt?: string;
        completedAt: string;
      };
      reasonCode: string;
      reasonMessage: string;
    }
  | {
      schemaVersion: "ACTION-GATEWAY-COMMENT-RESULT-V1";
      capabilityId: "github.comment.create.v1";
      status: "REJECTED" | "FAILED" | "UNKNOWN";
      repository: string;
      target: { kind: "ISSUE" | "PULL_REQUEST"; number: number };
      comment?: undefined;
      requestFingerprint: string;
      idempotencyKey: string;
      authorization: {
        matched: boolean;
        evidenceRefs: string[];
        artifactId?: string;
      };
      timestamps: {
        acceptedAt?: string;
        attemptedAt?: string;
        completedAt: string;
      };
      reasonCode: string;
      reasonMessage: string;
    };
```

`comment.id/url` may appear **only** on `SUCCEEDED`.

---

## 4. Authorization rules (fail-closed)

1. STATUS-OVERLAY recommendation alone **never** authorizes this mutation.
2. `recommendedNextAction.authorizesMutation` remains **`false`** and is not an
   input to the Gateway authorizer.
3. Mutation requires `humanAuthorization` bound to **exact**
   `capabilityId + repository + target + requestFingerprint + idempotencyKey + requestedBy`
   **and** a VERIFIED server-issued `authorizationArtifact` re-checked by Gateway.
   Also: `authenticatedPrincipal == requestedBy == authorizedRequestedBy`.
4. Missing / malformed / expired / not-yet-valid / mismatched authorization ⇒ `REJECTED`
   before any GitHub write. Default TTL applies when `expiresAt` is omitted.
   Validity window is `authorizedAt <= nowIso <= effectiveExpiry`.
5. Repository allowlist (V1) is exactly
   `yasutakesougo/ai-development-control-center`.
6. Target must already exist and be **live re-observed** with matching
   `repository / kind / number` before write (`observedTargetExists === true`
   alone is insufficient). If `expectedObservations` includes `targetNodeId` /
   `targetTitle`, matching live observations are required.
7. Authorization for number N cannot be replayed against number M.
8. Authorization for `github.comment.create.v1` cannot authorize Ready / Merge /
   Close / workflow dispatch / repository-file writes / other capabilities.
9. Same `idempotencyKey` (within principal+capability+repository scope) must not
   create a second comment; return the prior terminal result **only when**
   stored `repository/target/requestFingerprint/requestedBy` match.
   Mismatch ⇒ `REJECTED_IDEMPOTENCY_CONFLICT`.
   Different key **or** different `requestedBy` requires a **new** Human
   authorization bound to that key and requester (plus new trusted artifact).
10. Secrets / tokens never appear in request, result, UI, logs, or persisted
    evidence documents.

### Authorization binder checklist

```text
authenticatedPrincipal  == request.requestedBy
authorizedRequestedBy   == request.requestedBy
authorizedCapabilityId  == request.capabilityId == allowlist entry
authorizedRepository    == request.repository == allowlist repo
                            == expectedObservations.repository
authorizedTarget        == request.target == expectedObservations target
authorizedRequestFingerprint == computeCommentRequestFingerprint(...)
authorizedIdempotencyKey == request.idempotencyKey
authorizationArtifact   → trustedAuthorizationLookup.status == VERIFIED
                          + bindings match request + auth timestamps
nowIso provided independently of authorizedAt
authorizedAt <= nowIso <= effectiveExpiry
evidenceRefs            = supplemental audit only (still schema-limited)
live re-observation:
  observedTargetExists === true
  observedRepository/kind/number == request target
  + if expected targetNodeId/title set → live observed values required and equal
idempotency existing record (if any):
  same repository + target + fingerprint + requestedBy + key → REPLAY
  else → REJECTED_IDEMPOTENCY_CONFLICT
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
| First attempt, all checks pass, write confirmed | Store terminal `SUCCEEDED` under key **with** repository/target/fingerprint/requestedBy; return comment id/url |
| Retry with **same** key after `SUCCEEDED` and **same** identity | Return prior `SUCCEEDED` (**no** second GitHub POST) |
| Same key, **different** fingerprint/target/repository/requestedBy | `REJECTED_IDEMPOTENCY_CONFLICT` (do not replay foreign result) |
| Retry with **same** key after `REJECTED` (same identity) | Return prior `REJECTED` (deterministic); do not invent success |
| Retry with **same** key after `FAILED` (same identity) | Return prior `FAILED` unless a later Human-authorized recovery design says otherwise (V1: no auto-retry write) |
| Retry with **same** key while prior is `UNKNOWN` (same identity) | Run **reconciliation only** (§6); do not blindly POST again |
| Different key, same content fingerprint | **Forbidden** with the prior Human auth/artifact. Requires a **new** authorization + artifact whose `authorizedIdempotencyKey` equals the new key |
| Missing / empty idempotencyKey | `REJECTED` |
| Auth `authorizedIdempotencyKey` ≠ request key | `REJECTED_IDEMPOTENCY_KEY_MISMATCH` |

Duplicate publication for the same `idempotencyKey` is **forbidden**.
One Human authorization + trusted artifact authorizes **exactly one** idempotencyKey.

---

## 6. Outcome semantics (REJECTED / FAILED / UNKNOWN / SUCCEEDED)

| Status | Meaning | GitHub write attempted? |
|---|---|---|
| `REJECTED` | Deterministic policy / auth / validation failure | **No** |
| `FAILED` | Write attempted and failure **positively confirmed** (e.g. HTTP 4xx/5xx with conclusive body, or confirmed non-creation) | **Yes** |
| `UNKNOWN` | Write may have been attempted but success/failure **cannot be proven** (timeout, truncated response, ambiguous error) | Maybe |
| `SUCCEEDED` | Created comment **positively confirmed** (comment id + url observed) | **Yes** |

### UNKNOWN reconciliation (mandatory)

On `UNKNOWN` or UNKNOWN retry, promotion to `SUCCEEDED` requires **positive proof
stronger than ordinary validation**:

```text
1. Look up idempotency store for a prior terminal SUCCEEDED under the same scope
   where ALL of the following match the current request:
     repository, target.kind, target.number, idempotencyKey, requestFingerprint
   - If found → return that SUCCEEDED (no new write).
2. Marker search (optional): a candidate comment must embed / carry proof of
     repository + target + idempotencyKey + requestFingerprint
   (not merely the raw key string). Exactly one full match → SUCCEEDED.
3. Partial matches (key-only, wrong target, wrong fingerprint) remain UNKNOWN.
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
REJECTED_AUTHORIZATION_NOT_YET_VALID
REJECTED_AUTHORIZATION_ARTIFACT
REJECTED_AUTHENTICATED_PRINCIPAL_MISMATCH
REJECTED_FINGERPRINT_MISMATCH
REJECTED_TARGET_NOT_FOUND
REJECTED_TARGET_MISMATCH
REJECTED_PAYLOAD_LIMIT
REJECTED_IDEMPOTENCY_KEY_MISSING
REJECTED_IDEMPOTENCY_KEY_MISMATCH
REJECTED_IDEMPOTENCY_CONFLICT
REJECTED_REQUESTER_MISMATCH
REJECTED_OBSERVATION_MISSING
REJECTED_EVALUATION_CLOCK_MISSING
REJECTED_OVERLAY_NOT_AUTHORIZATION   // if caller tries to treat overlay as auth
FAILED_GITHUB_HTTP
FAILED_GITHUB_CONFIRMED
UNKNOWN_GITHUB_OUTCOME
SUCCEEDED_CREATED
SUCCEEDED_IDEMPOTENT_REPLAY
```

`comment.id/url` may appear **only** on `SUCCEEDED`. `FAILED` / `UNKNOWN` /
`REJECTED` must omit `comment`.

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
| Auth reused under a different requestedBy / scope | `authorizedRequestedBy` + authenticatedPrincipal exact match |
| Caller forges humanAuthorization JSON | Trusted `authorizationArtifact` + server-side VERIFIED lookup required |
| Same idempotencyKey, different target/fingerprint | `REJECTED_IDEMPOTENCY_CONFLICT` |
| UNKNOWN promoted from foreign prior/marker | Require repository+target+key+fingerprint proof |
| Clock derived from `authorizedAt` skips expiry | Independent required `nowIso`; default TTL always applied when `expiresAt` omitted |
| Future-dated authorization used early | `authorizedAt <= nowIso <= expiry` |
| Skipping live target probe / identity | existence + repository/kind/number required; expected nodeId/title require live values |
| FAILED/UNKNOWN carrying comment ids | Result invariant + discriminated union: comment only on SUCCEEDED |
| Schema/runtime drift (unknown props, evidence limits) | Parser mirrors JSON Schema; contract tests reject extras |
| Malformed JSON syntax throws | `parseGatewayJsonBody` → `REJECTED_SCHEMA` |
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
