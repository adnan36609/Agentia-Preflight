# Agentia Preflight — Hackathon Demo Script

**Target duration:** 2–3 minutes
**Format:** Terminal demonstration
**Goal:** Demonstrate evidence-aware readiness decisions, executed local validation, explainable risks, and generated artifacts.

## 1. Introduction — 15 seconds

**Show:** Project directory and terminal.

**Narration:**

"Agentia Preflight is a terminal-first release-readiness plugin for the Copado Agentia CLI. It evaluates repository changes against configurable policies, runs local validation on request, explains release blockers, and distinguishes executed checks from demonstration evidence."

## 2. Scenario A — Supplied evidence — 30 seconds

Run:

```powershell
agentia preflight analyze
```

Show:

* Recommendation.
* Workflow and validation provenance marked `fixture`.
* `WORKFLOW_EVIDENCE_UNVERIFIED`.
* `VALIDATION_EVIDENCE_UNVERIFIED`.
* Unchecked fixture-based checklist items.

**Narration:**

"This assessment uses demonstration evidence from a local YAML file. Although the declared statuses say passed, Preflight does not treat those declarations as proof that the workflow or validation commands actually ran. Its policy blocks unverified evidence."

## 3. Scenario B — Local validation — 45 seconds

Run:

```powershell
agentia preflight analyze --run-validation
```

Show:

* Build command executing.
* Test suite executing.
* Validation provenance reported as `local-execution`.
* Build and test checks marked complete.
* Workflow evidence still marked as a fixture.

**Narration:**

"With the validation flag, Preflight actually executes the project's configured build and test scripts. It records their observed outcomes separately from the demonstration evidence. The release remains blocked because local validation does not prove that a real Copado workflow succeeded."

## 4. Explain a finding — 15 seconds

Run:

```powershell
agentia preflight explain WORKFLOW_EVIDENCE_UNVERIFIED
```

**Narration:**

"Each finding has a stable identifier and an explanation, making it easier to understand why an assessment is blocked and what evidence is still needed."

## 5. Show job-inspection capability — optional 25 seconds

This section is optional for recordings made without CI/CD credentials.

Run:

```powershell
agentia preflight analyze --inspect-jobs --run-validation
```

If the environment has valid CI/CD credentials, show the returned job records, statuses, and correlation confidence.

If CI/CD credentials are unavailable, show that the collector reports `unavailable` rather than fabricating successful results.

**Narration when credentials are unavailable:**

"Preflight also includes a read-only job-inspection path using supported Agentia host APIs. This environment does not have CI/CD authentication configured, so live job retrieval is unavailable. The tool reports that limitation rather than treating missing records as a successful workflow."

Do not describe this output as proof that live job retrieval succeeded.

## 6. Inspect artifacts — 15 seconds

Run:

```powershell
Get-Content .\release-plan.md
Get-Content .\evidence.json
```

If job inspection was included:

```powershell
Get-Content .\agentia-job-inspection.json
```

**Narration:**

"Preflight creates a human-readable release plan and a structured JSON receipt. When job inspection is requested, it also records the query status, job summaries, and any inferred correlations separately."

## 7. Closing — 10 seconds

**Narration:**

"Agentia Preflight brings change analysis, local validation, policy enforcement, explainable findings, and reviewable release evidence into one terminal workflow. Verified live workflow correlation remains a distinct integration milestone."

## Demonstration guardrails

* Do not describe a fixture as a real Copado workflow execution.
* Do not claim that a job was correlated definitively with the assessed release.
* Do not claim live job retrieval succeeded if the API queries were unavailable.
* Do not hide blocking findings simply to make the tool display `READY`.
* Do not describe local build and test execution as proof that the entire release is safe.
* Follow the hackathon's actual recording and submission requirements.
