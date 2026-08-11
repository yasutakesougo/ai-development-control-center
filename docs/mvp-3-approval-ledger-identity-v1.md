# MVP-3-APPROVAL-LEDGER-IDENTITY-V1

Status:

```text
DESIGN ONLY
NOT IMPLEMENTED
AUTHENTICATION IMPLEMENTATION = NOT AUTHORIZED
AUTHORIZATION IMPLEMENTATION = NOT AUTHORIZED
PERSISTENCE = NOT AUTHORIZED
```

Baseline at drafting:

```text
main = dad10f9d7524777e56709f7ffe586cedf8e46258
MVP-3-APPROVAL-LEDGER-CONTRACT-V1 = MERGED
MVP-3-APPROVAL-INTENT-UI-V1 = COMPLETE
```

This document defines the minimum trustworthy **identity and authorization contract**
required before an Approval Intent may ever become a durable Approval Ledger record.

It does **not** authorize working login, OAuth, Cloudflare Access configuration,
backend mutation APIs, ledger persistence, Action Gateway, or GitHub write.

Related:

```text
docs/mvp-3-approval-ledger-contract-v1.md
```

---

## 1. Purpose / questions answered

| Question | Contract answer (summary) |
| --- | --- |
| Who is the Human approver? | An authenticated **Human** principal from a trusted IdP, identified by scoped `(issuer + subjectId)`. |
| How is that identity established? | Server-side fail-closed validation of an IdP JWT / assertion at a trusted boundary. Never from browser-supplied fields. |
| Which identifier is stable enough for audit? | Scoped principal `issuer + subjectId`. Not `subjectId` alone. Not display name / email alone. |
| What information is display-only? | `displayName`, `email`, and other human-readable claims. Persistence of those fields is NOT REQUIRED. |
| Where is authorization enforced? | Trusted server-side boundary (Worker or equivalent), never in the browser alone. |
| What if identity cannot be established? | Fail closed — Ledger write forbidden. |
| What identity facts would a future Ledger record contain? | Required: `approver.issuer`, `approver.subjectId`. Optional display metadata (see §8 / §9). |

---

## 2. Separation of concerns

```text
authentication
  = who is this Human?

authorization
  = may this Human record this decision?

approval intent
  = what decision does the Human propose? (local ephemeral draft today)

ledger recording
  = durable audit event (NOT AUTHORIZED yet)

execution
  = later Action Gateway responsibility (NOT AUTHORIZED)
```

Invariants:

```text
Approval Intent draft ≠ authenticated approver
authenticated identity ≠ authorization to record
Ledger record ≠ executed action
GitHub actor ≠ approver
  unless a later explicit contract makes a GitHub principal authoritative
approver identity MUST NOT be included in decisionFingerprint
```

---

## 3. Core principles

```text
authenticated human principal required

principal identity = issuer + subjectId

subjectId is stable only within its issuer/account scope

subjectId MUST NOT be treated as a permanent real-world Human identifier

identity continuity after account removal/re-add, IdP migration,
or organization migration MUST NOT be inferred automatically

approver identity MUST NOT be supplied by the browser as a trusted value

client-provided approverId / email / displayName MUST NOT establish identity

authorization decision must occur at a trusted server-side boundary

authorization bindings MUST use the scoped principal (issuer + subjectId),
not subjectId alone

missing identity => fail closed

ambiguous identity => fail closed

unauthorized identity => refuse future Ledger write

service-token / non-Human principal => Ledger write forbidden

no anonymous approval

no self-declared approver identity

no fallback identity

display name / email are not sufficient as the sole stable audit identifier

stable scoped principal and human-readable audit metadata must be separated

identity establishment ≠ approval authorization

decisionFingerprint represents the observed decision target
approver identity represents the Human making the decision
→ keep separate
```

---

## 4. Approach comparison (design only)

| Approach | Pros | Cons | Verdict for this app |
| --- | --- | --- | --- |
| A. Browser self-declared name/email | Easy | Forgeable; violates trust model | **REJECTED** |
| B. Infer from GitHub PR author / reviewer / token actor | Already have GitHub read | GitHub actor ≠ Control Center approver; PAT is service identity; conflates observation with approval | **REJECTED as default** |
| C. GitHub OAuth login for Control Center users | Familiar | Couples approver to GitHub account; needs OAuth app + secrets; blurs observed-repo vs approver IdP | Viable secondary option; not recommended default |
| D. Cloudflare Access (Zero Trust) in front of Worker | Edge-enforced auth; Worker validates Access JWT (`iss`/`aud`/`sub`); fits Workers hosting | Requires Access application/policy setup (NOT AUTHORIZED in this slice) | **RECOMMENDED** |
| E. Generic OIDC to Worker with server-validated JWT | Portable | More custom code; still needs IdP + secrets | Viable alternative if Access is unavailable |

### Recommendation

**Authoritative identity source:** Cloudflare Access (or equivalent **server-validated** OIDC/JWT IdP assertion consumed only at a trusted server-side boundary).

Rationale:

- Control Center already runs on Cloudflare Workers.
- Access places authentication at the edge and provides a JWT the Worker can validate fail-closed.
- Avoids treating the GitHub observation PAT / GitHub PR actor as the Human approver.
- Browser cannot mint a trusted principal.

```text
Cloudflare Access configuration = NOT AUTHORIZED in this slice
OAuth / login implementation = NOT AUTHORIZED in this slice
JWT validation code = NOT AUTHORIZED in this slice
```

---

## 5. Recommended identity architecture (not implemented)

```text
Human browser
  ↓
Cloudflare Access (authenticate Human)     ← future config; NOT AUTHORIZED now
  ↓ Access JWT / identity assertion
Cloudflare Worker (trusted boundary)
  ↓ fail-closed JWT validation (see §7)
  ↓ authorize ledger.write for (issuer + subjectId)
  ↓ (only after PERSIST slice is authorized)
Approval Ledger append
  ↓
NO Action Gateway / GitHub write here
```

Current production reality:

```text
workers.dev UI is reachable without Access
Approval Intent is local-only and non-operative
therefore: no durable Ledger write path exists (correct / fail-closed)
```

Trusted boundary rules:

```text
1. Only the Worker (or equivalent server component) may accept identity assertions.
2. UI may display “signed-in as …” only after server confirms identity.
3. UI must never send issuer/subjectId/email/displayName as the source of truth.
4. Any future privileged Ledger request (NOT AUTHORIZED yet) must re-validate
   JWT + authorization on every request.
```

---

## 6. Scoped principal identity

Do **not** treat `subjectId` / JWT `sub` alone as a globally stable Human audit identifier.

Preferred contract shape:

```ts
approver: {
  issuer: string;        // exact validated JWT `iss`
  subjectId: string;     // validated JWT `sub`
  displayName?: string;  // display-only
  email?: string;        // display-only
}
```

Contract invariant:

```text
principal identity = issuer + subjectId
```

Clarify:

```text
subjectId is stable only within its issuer/account scope.

subjectId MUST NOT be treated as a permanent real-world Human identifier.

identity continuity after account removal/re-add, IdP migration,
or organization migration MUST NOT be inferred automatically.
```

Authorization guidance:

```text
authorization bindings MUST use the scoped principal
(issuer + subjectId), not subjectId alone.
```

Approver identity fields (`issuer`, `subjectId`, `displayName`, `email`)
MUST NOT be included in `decisionFingerprint`.

---

## 7. JWT validation contract (fail-closed; not implemented)

For any future privileged Ledger request, the trusted server boundary MUST verify at least:

```text
JWT signature is valid

issuer (`iss`) exactly matches the configured trusted issuer

audience (`aud`) contains the expected Access application audience

token is currently valid
(exp / nbf as applicable)

subject (`sub`) is present and non-empty

principal represents an authenticated Human suitable for approval
```

Explicit refusals:

```text
service-token / non-Human principal
=> Ledger write forbidden

unexpected issuer
=> Ledger write forbidden

unexpected audience
=> Ledger write forbidden

expired / not-yet-valid token
=> Ledger write forbidden

missing / empty subject
=> Ledger write forbidden
```

```text
JWT validation implementation = NOT AUTHORIZED in this slice
```

This section defines the contract only. It does not add runtime validation code.

---

## 8. Required security decisions

### 8.1 Authoritative identity source

```text
RECOMMENDED: Cloudflare Access (OIDC/JWT) validated server-side
ALTERNATE:   other OIDC IdP with server-side JWT validation
REJECTED:    browser fields, Approval Intent state, GitHub read token actor
```

### 8.2 Stable scoped principal

```text
approver.issuer    = exact validated JWT `iss`
approver.subjectId = validated JWT `sub`
principal          = issuer + subjectId
```

Used for audit and authorization allowlisting **as a pair**.

### 8.3 Display-name / email treatment (PII)

```text
displayName = optional display-only metadata
email       = optional display-only metadata
```

Neither may be the sole stable audit identifier.
Neither may authorize a Ledger write by itself.
Either may change without changing `(issuer + subjectId)`.

Because the Ledger is append-only and PII retention remains unresolved:

```text
persistence of displayName/email is NOT REQUIRED by IDENTITY-V1

a future persistence slice must not assume those fields must be stored
until the PII retention decision is explicitly resolved
```

### 8.4 Server-side trust boundary

```text
Worker validates JWT / identity assertion on every privileged request
Browser is untrusted for identity and authorization decisions
```

### 8.5 Authorization policy boundary

Authentication ≠ authorization.

Future authorization (NOT AUTHORIZED to implement now) must answer:

```text
May this (issuer + subjectId) record a Ledger entry
for this repository / decision class?
```

Recommended policy shape (design only):

```text
allowlist or role binding of (issuer + subjectId) → ledger.write
evaluated only server-side
deny by default
```

Policy storage / admin UX = NOT AUTHORIZED in this slice.

### 8.6 Unauthenticated behavior

```text
no authenticated identity
=> Ledger write forbidden
=> no fallback / anonymous approver
```

Approval Intent UI may still show local drafts under existing ACTION_REQUIRED rules
because Intent is non-operative. Intent must not be promoted to Ledger without identity.

### 8.7 Unauthorized / invalid-token behavior

```text
identity verified but not permitted to record
=> refuse future Ledger write

JWT validation failure (signature/iss/aud/exp/nbf/sub/non-Human)
=> refuse future Ledger write

=> do not record
=> do not escalate to GitHub / SharePoint / Agent
```

### 8.8 Identity / audit metadata on a future record

Required identity facts:

```text
approver.issuer
approver.subjectId
```

Optional (NOT REQUIRED to persist until PII decision resolves):

```text
approver.displayName?
approver.email?
```

Plus CONTRACT-V1 fields (`decisionFingerprint`, `idempotencyKey`, etc.).

### 8.9 Relationship to decisionFingerprint

```text
decisionFingerprint = observed decision target facts
approver identity   = who decided (issuer + subjectId)
```

**Keep separate.**

Do **not** put `issuer` / `subjectId` / email / displayName into the canonical decision fingerprint.

Rationale:

- Same decision target can be recorded by different authorized Humans (append-only history).
- Fingerprint stale checks must not spuriously fail when a different authorized approver acts.
- Identity must not reshape the decision target fingerprint.

### 8.10 Relationship to idempotencyKey

```text
idempotencyKey generation/storage = NOT AUTHORIZED
```

Contract guidance for a future PERSIST slice:

```text
idempotencyKey uniqueness SHOULD be scoped with
(issuer + subjectId) + decision identity
so that retries by one Human do not collide with another Human’s distinct record
```

`idempotencyKey` is not an identity proof.
Missing/invalid identity still fails closed even if a key is present.

---

## 9. Future ledger identity fields (contract-level)

Illustrative shape only. **Not implemented in runtime.**

```ts
approver: {
  issuer: string;        // exact validated JWT `iss`
  subjectId: string;     // validated JWT `sub`
  displayName?: string;  // display-only; persistence NOT REQUIRED
  email?: string;        // display-only; persistence NOT REQUIRED
};
```

Extended future Ledger record (composes CONTRACT-V1):

```ts
type ApprovalLedgerRecordWithIdentityV1 = {
  subject: {
    repository: string;
    sourceRefs: string[];
    decisionFingerprint: string; // excludes observedAt; excludes approver identity
    humanActionStatus: "ACTION_REQUIRED";
    evidenceState: "CONFIRMED";
  };
  observedAt: string; // audit metadata only
  intent: "APPROVE" | "REJECT" | "DEFER";
  recordedAt: string;
  recordId: string;
  idempotencyKey: string;
  approver: {
    issuer: string;
    subjectId: string;
    displayName?: string;
    email?: string;
  };
  submissionState: "RECORDED";
  externalEffect: false;
};
```

---

## 10. Fail-closed matrix

| Condition | Ledger write |
| --- | --- |
| no authenticated identity | **forbidden** |
| JWT signature invalid | **forbidden** |
| unexpected issuer (`iss`) | **forbidden** |
| unexpected audience (`aud`) | **forbidden** |
| expired / not-yet-valid token | **forbidden** |
| missing / empty subject (`sub`) | **forbidden** |
| service-token / non-Human principal | **forbidden** |
| identity cannot be verified | **forbidden** |
| authorization cannot be established | **forbidden** |
| unauthorized `(issuer + subjectId)` | **forbidden** |
| `evidenceState != CONFIRMED` | **forbidden** |
| `HumanAction != ACTION_REQUIRED` | **forbidden** |
| decision fingerprint mismatch | **forbidden** |
| missing `idempotencyKey` (PERSIST contract) | **forbidden** |
| client-supplied approver fields only | **forbidden** |

No fallback identity. No anonymous approval. No self-declared approver.

---

## 11. Explicit non-effects

Even with a future authenticated + authorized Human:

```text
GitHub Ready / Merge / Comment / Review / Issue write = 0
SharePoint mutation = 0
Action Gateway = 0
Agent execution = 0
automatic approval = 0
```

Identity establishment does not execute the decision.

---

## 12. Unresolved security decisions (Human may decide later)

These remain open on purpose; this slice does not silently close them:

```text
1. Exact IdP product choice confirmation
   (Cloudflare Access recommended; alternate OIDC allowed)

2. Access application / policy / IdP connector configuration
   (NOT AUTHORIZED now)

3. Authorization allowlist contents and admin process
   (which (issuer + subjectId) may ledger.write)

4. Whether multiple approvers are required for some decision classes
   (multi-approver = NOT AUTHORIZED / unspecified)

5. Session lifetime / step-up authentication requirements

6. Whether any future slice will ever treat a GitHub principal
   as authoritative approver identity (default = no)

7. PII retention policy for email/displayName on ledger records
   (persistence of those fields remains NOT REQUIRED until resolved)

8. IdempotencyKey concrete generation algorithm
   (NOT AUTHORIZED; only scoping guidance given)

9. Concrete Access audience value / trusted issuer value
   (configuration = NOT AUTHORIZED)
```

If a later slice needs Access config, allowlist admin, or runtime auth code:

```text
STOP and require a separate Human GO
```

---

## 13. OUT / FORBIDDEN (this slice)

```text
working login implementation
OAuth implementation
Cloudflare Access configuration
Cloudflare secret creation/change
Cloudflare permission change
GITHUB_TOKEN scope change
backend approval POST/PUT/PATCH/DELETE
Approval Ledger persistence
KV / D1 / DO / R2 writes
browser persistence
idempotencyKey generation/storage implementation
decisionFingerprint canonicalization implementation
JWT validation implementation
GitHub write capabilities
SharePoint mutation
Action Gateway
Agent execution
automatic approval
severe-behavior-support-spfx mutation
src/** / test/** mutation
```

---

## 14. Suggested sequence (not authorized beyond this doc)

```text
A. CONTRACT-V1     = MERGED (design)
B. IDENTITY-V1     = this document (design-only)
C. PERSIST-V1      = durable write/read — NOT AUTHORIZED
   (+ auth enforcement implementation GO required before/with C)
D. Action Gateway  = NOT AUTHORIZED
E. GitHub write    = NOT AUTHORIZED
```

IDENTITY-V1 design acceptance does **not** authorize PERSIST-V1 or auth implementation.

---

## 15. Acceptance for this design slice

```text
- docs/mvp-3-approval-ledger-identity-v1.md exists
- README points to identity contract
- scoped principal = issuer + subjectId
- JWT validation fail-closed contract recorded
- service/non-Human rejection recorded
- PII persistence remains unresolved/optional
- no runtime auth/persistence/write capability added
- npm run verify PASS on docs-only change
- Draft PR for Human review
```

---

## 16. Capability board

```text
Approval Intent UI             = IMPLEMENTED (local ephemeral)
Approval Ledger CONTRACT-V1    = DESIGN (merged)
Approval Ledger IDENTITY-V1    = DESIGN ONLY (this doc)
Authentication implementation  = 0 / NOT AUTHORIZED
Authorization implementation   = 0 / NOT AUTHORIZED
Approval Ledger persist        = 0 / NOT AUTHORIZED
Backend approval API           = 0
GitHub write                   = 0
SharePoint mutation            = 0
Action Gateway                 = 0
Agent execution                = 0
real approval execution        = NOT AUTHORIZED
```
