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
| Who is the Human approver? | An authenticated human principal from a trusted IdP, represented by a stable `subjectId`. |
| How is that identity established? | Server-side validation of an IdP assertion / session at a trusted boundary. Never from browser-supplied fields. |
| Which identifier is stable enough for audit? | IdP subject (`subjectId`), not display name / email alone. |
| What information is display-only? | `displayName`, `email`, and other human-readable claims. |
| Where is authorization enforced? | Trusted server-side boundary (Worker or equivalent), never in the browser alone. |
| What if identity cannot be established? | Fail closed — Ledger write forbidden. |
| What identity facts would a future Ledger record contain? | `approver.subjectId` + optional display metadata + `identityProvider` (see §7). |

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
```

---

## 3. Core principles

```text
authenticated human principal required

approver identity MUST NOT be supplied by the browser as a trusted value

client-provided approverId / email / displayName MUST NOT establish identity

authorization decision must occur at a trusted server-side boundary

missing identity => fail closed

ambiguous identity => fail closed

unauthorized identity => refuse future Ledger write

no anonymous approval

no self-declared approver identity

no fallback identity

display name / email are not sufficient as the sole stable audit identifier

stable approver subject identifier and human-readable audit metadata
must be separated

identity establishment ≠ approval authorization

decisionFingerprint represents the observed decision target
approver identity represents the Human making the decision
→ keep separate (see §9)
```

---

## 4. Approach comparison (design only)

| Approach | Pros | Cons | Verdict for this app |
| --- | --- | --- | --- |
| A. Browser self-declared name/email | Easy | Forgeable; violates trust model | **REJECTED** |
| B. Infer from GitHub PR author / reviewer / token actor | Already have GitHub read | GitHub actor ≠ Control Center approver; PAT is service identity; conflates observation with approval | **REJECTED as default** |
| C. GitHub OAuth login for Control Center users | Familiar; stable GitHub `node_id`/`id` | Couples approver to GitHub account; needs OAuth app + secrets; blurs observed-repo vs approver IdP | Viable secondary option; not recommended default |
| D. Cloudflare Access (Zero Trust) in front of Worker | Edge-enforced auth; Worker receives validated identity assertion; fits Workers hosting; secrets stay in CF Access config | Requires Access application/policy setup (NOT AUTHORIZED in this slice) | **RECOMMENDED** |
| E. Generic OIDC to Worker with server-validated JWT | Portable | More custom code; still needs IdP + secrets | Viable alternative if Access is unavailable |

### Recommendation

**Authoritative identity source:** Cloudflare Access (or equivalent **server-validated** OIDC/JWT IdP assertion consumed only at a trusted server-side boundary).

Rationale:

- Control Center already runs on Cloudflare Workers.
- Access places authentication at the edge and provides a validated identity to the Worker.
- Avoids treating the GitHub observation PAT / GitHub PR actor as the Human approver.
- Browser cannot mint a trusted `approverId`.

```text
Cloudflare Access configuration = NOT AUTHORIZED in this slice
OAuth / login implementation = NOT AUTHORIZED in this slice
```

---

## 5. Recommended identity architecture (not implemented)

```text
Human browser
  ↓
Cloudflare Access (authenticate Human)     ← future config; NOT AUTHORIZED now
  ↓ validated identity assertion
Cloudflare Worker (trusted boundary)
  ↓ authenticate assertion
  ↓ authorize ledger-write permission
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
3. UI must never send approverId/email/displayName as the source of truth.
4. Any future /api ledger write (NOT AUTHORIZED yet) must re-validate identity
   and authorization on every request.
```

---

## 6. Required security decisions

### 6.1 Authoritative identity source

```text
RECOMMENDED: Cloudflare Access (OIDC/JWT) validated server-side
ALTERNATE:   other OIDC IdP with server-side JWT validation
REJECTED:    browser fields, Approval Intent state, GitHub read token actor
```

### 6.2 Stable subject identifier

```text
approver.subjectId = IdP subject (e.g. Access/OIDC `sub`)
```

Stable across sessions. Used for audit and authorization allowlisting.

### 6.3 Display-name / email treatment

```text
displayName = optional audit metadata (display-only)
email       = optional audit metadata (display-only)
```

Neither may be the sole stable audit identifier.
Neither may authorize a Ledger write by itself.
Either may change without changing `subjectId`.

### 6.4 Server-side trust boundary

```text
Worker validates identity assertion on every privileged request
Browser is untrusted for identity and authorization decisions
```

### 6.5 Authorization policy boundary

Authentication ≠ authorization.

Future authorization (NOT AUTHORIZED to implement now) must answer:

```text
May this subjectId record a Ledger entry for this repository / decision class?
```

Recommended policy shape (design only):

```text
allowlist or role binding of subjectId → ledger.write
evaluated only server-side
deny by default
```

Policy storage / admin UX = NOT AUTHORIZED in this slice.

### 6.6 Unauthenticated behavior

```text
no authenticated identity
=> Ledger write forbidden
=> no fallback / anonymous approver
```

Approval Intent UI may still show local drafts under existing ACTION_REQUIRED rules
because Intent is non-operative. Intent must not be promoted to Ledger without identity.

### 6.7 Unauthorized behavior

```text
identity verified but not permitted to record
=> refuse future Ledger write
=> do not record
=> do not escalate to GitHub / SharePoint / Agent
```

### 6.8 Identity / audit metadata to retain (future record)

Minimum identity facts on a future Ledger record:

```text
approver.subjectId
approver.identityProvider
approver.displayName?   (optional metadata)
approver.email?         (optional metadata)
```

Plus CONTRACT-V1 fields (`decisionFingerprint`, `idempotencyKey`, etc.).

### 6.9 Relationship to decisionFingerprint

```text
decisionFingerprint = observed decision target facts
approver identity   = who decided
```

**Keep separate.**

Do **not** put `subjectId` / email / displayName into the canonical decision fingerprint
unless a later contract proves coupling is required.

Rationale:

- Same decision target can be recorded by different authorized Humans (append-only history).
- Fingerprint stale checks must not spuriously fail when a different authorized approver acts.
- Identity spoofing must not be able to reshape the decision target fingerprint.

### 6.10 Relationship to idempotencyKey

```text
idempotencyKey generation/storage = NOT AUTHORIZED
```

Contract guidance for a future PERSIST slice:

```text
idempotencyKey uniqueness SHOULD be scoped with approver.subjectId
+ decision identity
so that retries by one Human do not collide with another Human’s distinct record
```

`idempotencyKey` is not an identity proof.
Missing/invalid identity still fails closed even if a key is present.

---

## 7. Future ledger identity fields (contract-level)

Illustrative shape only. **Not implemented in runtime.**

```ts
approver: {
  subjectId: string;          // stable IdP subject — required for audit
  displayName?: string;       // display-only metadata
  email?: string;             // display-only metadata
  identityProvider: string;   // e.g. "cloudflare-access" | "oidc:<issuer>"
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
    subjectId: string;
    displayName?: string;
    email?: string;
    identityProvider: string;
  };
  submissionState: "RECORDED";
  externalEffect: false;
};
```

---

## 8. Fail-closed matrix

| Condition | Ledger write |
| --- | --- |
| no authenticated identity | **forbidden** |
| identity cannot be verified | **forbidden** |
| authorization cannot be established | **forbidden** |
| unauthorized subjectId | **forbidden** |
| `evidenceState != CONFIRMED` | **forbidden** |
| `HumanAction != ACTION_REQUIRED` | **forbidden** |
| decision fingerprint mismatch | **forbidden** |
| missing `idempotencyKey` (PERSIST contract) | **forbidden** |
| client-supplied approver fields only | **forbidden** |

No fallback identity. No anonymous approval. No self-declared approver.

---

## 9. Explicit non-effects

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

## 10. Unresolved security decisions (Human may decide later)

These remain open on purpose; this slice does not silently close them:

```text
1. Exact IdP product choice confirmation
   (Cloudflare Access recommended; alternate OIDC allowed)

2. Access application / policy / IdP connector configuration
   (NOT AUTHORIZED now)

3. Authorization allowlist contents and admin process
   (who may ledger.write for severe-behavior-support-spfx)

4. Whether multiple approvers are required for some decision classes
   (multi-approver = NOT AUTHORIZED / unspecified)

5. Session lifetime / step-up authentication requirements

6. Whether any future slice will ever treat a GitHub principal
   as authoritative approver identity (default = no)

7. PII retention policy for email/displayName on ledger records

8. IdempotencyKey concrete generation algorithm
   (NOT AUTHORIZED; only scoping guidance given)
```

If a later slice needs any of (2)–(3) or runtime auth code:

```text
STOP and require a separate Human GO
```

---

## 11. OUT / FORBIDDEN (this slice)

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
GitHub write capabilities
SharePoint mutation
Action Gateway
Agent execution
automatic approval
severe-behavior-support-spfx mutation
src/** / test/** mutation
```

---

## 12. Suggested sequence (not authorized beyond this doc)

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

## 13. Acceptance for this design slice

```text
- docs/mvp-3-approval-ledger-identity-v1.md exists
- README points to identity contract
- recommended architecture documented
- fail-closed identity/auth rules recorded
- no runtime auth/persistence/write capability added
- npm run verify PASS on docs-only change
- Draft PR for Human review
```

---

## 14. Capability board

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
