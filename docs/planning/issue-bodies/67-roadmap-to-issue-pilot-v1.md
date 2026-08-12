<!--
Title: ROADMAP-TO-ISSUE-PILOT-V1 — project roadmap to validated GitHub Issues
Action: UPDATE GitHub Issue #67
Replace ISSUE-CREATE-CAPABILITY-V1 with the real issue number after create.
-->

# ROADMAP-TO-ISSUE-PILOT-V1

## Objective

Prove the upper planning pipeline from approved project/roadmap data to validated
GitHub Issues, including the Issue-create mutation authority boundary.

## Dependencies

Depends on #60, #61, #62, #63, #64, ISSUE-CREATE-CAPABILITY-V1, and #66.
#65 is used when oversize splitting is required.

## Pilot path

```text
ProjectContractV1
→ RoadmapContractV1
→ RoadmapNode
→ ISSUE-DECOMPOSER-V1
→ IssueProposalV1
→ ISSUE-VALIDATOR-V1
→ VALID
→ ISSUE-CREATE-CAPABILITY-V1 authorization
→ Action Gateway
→ ISSUE-PUBLISHER-V1
→ GitHub Issue(s)
→ STOP
```

## KPI

- no manual rewrite of generated Issue authority fields
- invalid proposal never published
- VALID alone never authorizes GitHub write
- exact provenance Project → RoadmapNode → Proposal → Capability auth → GitHub Issue
- idempotent publication

## Non-goals

Do not auto-dispatch Agent work yet. No scheduler/autopilot in this slice.

## Acceptance

A bounded synthetic project roadmap produces validated GitHub Issues with
deterministic evidence, explicit mutation authorization, and a Human-visible stop
point.

## Delivery gate

Implementation → verify → Draft PR → Fresh Review → STOP.
