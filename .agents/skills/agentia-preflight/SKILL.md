---
name: agentia-preflight
description: Assess Agentia workflow release readiness using Git state, supplied workflow and validation evidence, human approval, and project policies.
---

# Agentia Preflight

Use Agentia Preflight before recommending that an Agentia-managed change proceed toward release.

## Workflow

1. Inspect the repository and identify the intended base branch.
2. Review the current Git working-tree state.
3. Gather available Agentia workflow results.
4. Gather actual validation results, such as build and test outcomes.
5. Gather the current human approval status.
6. Review the project policy in `.agentia-preflight.yml`.
7. Ensure the available evidence is recorded in `.agentia-preflight-evidence.yml`.
8. Run:

   `agentia preflight analyze --base main`

   Replace `main` with the appropriate base branch when necessary.

9. Review the recommendation, every finding, and the prioritized test checklist.
10. Use the relevant risk explanation when a finding requires clarification.
11. Follow the decision rules below before recommending the next step.

## Evidence Sources

Preflight evaluates the following information:

- Git working-tree state and change statistics
- Supplied Agentia workflow status and individual workflow checks
- Supplied validation status and individual validation checks
- Human approval status
- Configured project policies

Project policies are defined in:

`.agentia-preflight.yml`

Workflow, validation, and approval evidence are supplied through:

`.agentia-preflight-evidence.yml`

**Important:** The evidence file is an input to Preflight. A status marked `passed` is not independent proof that an external workflow or validation command actually ran. Obtain real results before recording them. Never invent successful checks or approvals.

## Decision Rules

### BLOCK

One or more blocking conditions require attention.

Examples include:

- Uncommitted changes when a clean working tree is required
- Missing or failed workflow evidence
- A failed individual workflow check
- Missing or failed validation evidence
- A failed or unverified individual validation check

Resolve blocking findings and rerun Preflight before recommending that the change proceed.

### WARN

The assessment identified a condition requiring review.

Examples include:

- Human approval is still pending
- The change set exceeds the configured file-count threshold

Review each warning and obtain the required approval before proceeding.

### READY

The configured readiness checks passed without reported risks.

`READY` is not release authorization. Follow the normal Agentia workflow and obtain all required human approvals before promotion or deployment.

## Explaining Findings

Run:

`agentia preflight explain <risk-id>`

Examples:

- `agentia preflight explain WORKTREE_DIRTY`
- `agentia preflight explain WORKFLOW_EVIDENCE_MISSING`
- `agentia preflight explain WORKFLOW_FAILED`
- `agentia preflight explain WORKFLOW_CHECK_FAILED`
- `agentia preflight explain WORKFLOW_CHECK_UNVERIFIED`
- `agentia preflight explain VALIDATION_MISSING`
- `agentia preflight explain VALIDATION_FAILED`
- `agentia preflight explain VALIDATION_CHECK_FAILED`
- `agentia preflight explain VALIDATION_CHECK_UNVERIFIED`
- `agentia preflight explain HUMAN_APPROVAL_REQUIRED`
- `agentia preflight explain CHANGESET_TOO_LARGE`

## Release Artifacts

Preflight generates:

- `release-plan.md` — a human-readable release-readiness brief and prioritized test checklist
- `evidence.json` — a structured record of the collected inputs, policy, recommendation, checklist, and risks

Review these artifacts before recommending a release path.

## Guardrails

- Never fabricate workflow, validation, or approval evidence.
- Never ignore failed or unverified individual checks.
- Never bypass blocking findings.
- Never treat `READY` as automatic authorization to release.
- Never treat Preflight as a replacement for human approval.
- Do not claim that Preflight itself promotes, deploys, or blocks native Agentia commands.
- Do not claim that the supplied evidence was independently verified unless an actual verification mechanism performed that work.
- Keep readiness decisions explainable through recorded evidence and risk identifiers.
- Use the normal Agentia workflow after readiness checks and required approvals are satisfied.