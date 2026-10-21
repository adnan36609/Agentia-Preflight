# Agentia Preflight

**Evidence-based release readiness for Agentia workflows.**

Agentia Preflight is a terminal-first plugin for the Copado Agentia CLI. It analyzes Git changes, evaluates configurable release policies, runs local validation scripts on request, and provides read-only inspection of Agentia job, pipeline, and promotion summaries.

Preflight distinguishes between observed execution results, locally executed validation, supplied evidence, and demonstration fixtures. Its objective is to make release assessments more explainable and prevent an unverified status declaration from being mistaken for verified release evidence.

> **Project status: Hackathon prototype.** Local build and test execution are implemented. Agentia context and job-inspection capabilities use the Agentia Plugin SDK. Live CI/CD job retrieval requires appropriate CI/CD authentication and has not yet been verified in an authenticated environment. Job-to-promotion correlation is currently inferred from available names and pipeline information.

## Problem

Release-readiness decisions can create false confidence when a reported success is treated as proof that the underlying check actually executed. A workflow status marked `passed` does not, by itself, establish where the evidence came from or whether the claimed validation was independently verified.

Agentia Preflight addresses this problem by evaluating evidence provenance alongside configurable release policies. It distinguishes demonstration fixtures from locally executed validation, identifies missing verification, and produces an explainable release-readiness recommendation.

The goal is to help developers and reviewers distinguish **what a system reports** from **what the available evidence actually establishes** before considering a release ready.


## Features

* **Git change assessment:** Inspects the current branch, working-tree state, changed files, and diff statistics relative to a base branch.
* **Policy as code:** Reads configurable requirements from `.agentia-preflight.yml`.
* **Local validation:** Optionally executes the project's configured build and test scripts and records their observed exit results.
* **Evidence provenance:** Distinguishes local execution, SDK-derived information, user-supplied evidence, fixtures, and unavailable results.
* **Agentia context:** Retrieves supported workspace and authentication context through the Agentia Plugin SDK when available.
* **Job inspection:** Reads job, pipeline, and promotion summaries through supported host APIs when the environment and credentials permit.
* **Conservative status mapping:** Interprets documented job statuses while treating unrecognized values as unknown.
* **Correlation confidence:** Labels job-to-promotion relationships as inferred, ambiguous, or unmatched.
* **Explainable findings:** Assigns stable risk identifiers, severity levels, and explanations.
* **Prioritized checklist:** Identifies checks requiring follow-up and distinguishes them from accepted local validation results.
* **Release artifacts:** Generates `release-plan.md` and `evidence.json`.
* **Job-inspection artifact:** Optionally generates `agentia-job-inspection.json`.
* **Agent Skill:** Includes project-local guidance for compatible coding agents.
* **Automated testing:** Uses Vitest for policy, provenance, checklist, and job-inspection tests.

## Architecture

```text
                     Git Repository
                           |
                           v
                    Git Change Analysis
                           |
             +-------------+-------------+
             |                           |
             v                           v
       Release Policy             Evidence Sources
       .agentia-preflight.yml     - YAML evidence
                                  - Local validation
                                  - Agentia context
                                  - Job inspection
             |                           |
             +-------------+-------------+
                           |
                           v
                    Policy Evaluation
                           |
                           v
                   READY / WARN / BLOCK
                           |
             +-------------+-------------+
             |             |             |
             v             v             v
          Findings      Checklist    Explanations
                           |
                           v
                     Output Artifacts
                     - release-plan.md
                     - evidence.json
                     - agentia-job-inspection.json
                       (optional)
```

### Assessment flow

1. Preflight retrieves available Agentia context and collects Git change evidence.
2. It loads the project policy and evidence configuration.
3. If `--run-validation` is supplied, it executes the configured build and test scripts and uses their results instead of the validation statuses in the evidence file.
4. If `--inspect-jobs` or `--job-id` is supplied, it attempts read-only job, pipeline, and promotion inspection through the Agentia host SDK.
5. The policy engine evaluates the configured release requirements and produces risks and a recommendation.
6. Preflight prints the assessment and generates the release artifacts.

Job inspection remains separate from the verified-workflow policy decision because the available SDK data does not establish a direct relationship between a job and the release being assessed.

## Requirements

* Node.js 18 or newer.
* npm.
* Git.
* A compatible installation of the Copado Agentia CLI.
* The Agentia Plugin SDK dependency declared in `package.json`.

Live job, pipeline, and promotion inspection requires suitable Agentia CI/CD authentication and access to the relevant records.

Local builds, unit tests, and demonstration evidence can be used without claiming access to a live Copado CI/CD workflow.

## Setup

Install dependencies:

```powershell
npm install
```

Build the project:

```powershell
npm run build
```

Run automated tests:

```powershell
npm test
```

Link the plugin into the Agentia CLI:

```powershell
agentia plugins link .
```

Confirm that the plugin commands are available:

```powershell
agentia preflight --help
```

The linked plugin uses compiled files in `dist/`. Rebuild after modifying TypeScript source files before testing the CLI.

## Usage

### 1. Assess the repository

```powershell
agentia preflight analyze
```

The default command evaluates the project policy and supplied evidence. It does not execute the build and test scripts or request job inspection.

YAML declarations are not treated as independent proof that workflow or validation commands ran.

### 2. Execute local validation

```powershell
agentia preflight analyze --run-validation
```

This option executes:

```powershell
npm run build
npm run test
```

Preflight records whether each command passed, failed, or could not be verified.

The resulting validation evidence is labelled `local-execution` when the commands are actually executed. Failed commands are not treated as successes.

These results establish the outcome of executing the project's configured scripts. They do not independently establish the quality of those scripts or verify that a live Agentia workflow succeeded.

### 3. Inspect Agentia jobs

```powershell
agentia preflight analyze --inspect-jobs
```

This requests one page of job, pipeline, and promotion summaries through the Agentia Plugin SDK.

The initial implementation requests up to 100 records from each list API. It does not claim to retrieve every historical record.

The operation writes:

```text
agentia-job-inspection.json
```

The inspection report records query availability, observed job statuses, step summaries, possible promotion matches, pipeline information, correlation confidence, and errors.

If the necessary authentication is missing, the inspection reports `unavailable` or `partial` rather than treating empty results as successful execution.

### 4. Inspect one job

```powershell
agentia preflight analyze --job-id YOUR_JOB_ID
```

Replace `YOUR_JOB_ID` with an actual job ID from your Agentia environment. The SDK expects a valid Salesforce ID; the placeholder itself is not a valid job identifier.

This option uses `host.job.get(id)` and also inspects available pipeline and promotion summaries for possible correlation.

### 5. Combine validation and job inspection

```powershell
agentia preflight analyze --inspect-jobs --run-validation
```

This performs the local validation and attempts Agentia job inspection in the same assessment.

The overall recommendation may still be `BLOCK` even when local validation passes. Job inspection does not override the existing workflow-evidence policy.

### 6. Select a Git base branch

```powershell
agentia preflight analyze --base main
```

The `--base` option specifies the comparison branch. Without it, Preflight uses the available Agentia workspace base branch or falls back to `main`.

### 7. Explain a finding

```powershell
agentia preflight explain WORKTREE_DIRTY
```

```powershell
agentia preflight explain WORKFLOW_EVIDENCE_UNVERIFIED
```

```powershell
agentia preflight explain VALIDATION_EVIDENCE_UNVERIFIED
```

Each supported risk identifier provides an explanation of the condition and why it matters for release readiness.

## Release Recommendations

| Recommendation | Meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| `BLOCK`        | At least one blocking policy condition requires resolution.     |
| `WARN`         | No blocking conditions were found, but warnings require review. |
| `READY`        | No configured readiness risks were detected.                    |

`READY` means that the configured checks did not identify a risk. It is not a guarantee that the release is defect-free or independently approved.

The default policy requires a clean working tree, workflow and validation evidence, verified workflow and validation provenance, and human approval.

## Policy Configuration

The `.agentia-preflight.yml` file defines release-readiness requirements.

```yaml
policies:
  requireCleanWorkingTree: true
  requireWorkflowEvidence: true
  requireVerifiedWorkflowEvidence: true
  requireValidationEvidence: true
  requireVerifiedValidationEvidence: true
  requireHumanApproval: true
  maxChangedFiles: 50
```

| Field                               | Behavior                                                            |
| ----------------------------------- | ------------------------------------------------------------------- |
| `requireCleanWorkingTree`           | Blocks when uncommitted changes are detected.                       |
| `requireWorkflowEvidence`           | Requires an overall workflow result.                                |
| `requireVerifiedWorkflowEvidence`   | Requires workflow evidence with `agentia-host-api` provenance.      |
| `requireValidationEvidence`         | Requires an overall validation result.                              |
| `requireVerifiedValidationEvidence` | Requires validation evidence with `local-execution` provenance.     |
| `requireHumanApproval`              | Warns if the recorded approval status is not `approved`.            |
| `maxChangedFiles`                   | Warns when the changed-file count exceeds the configured threshold. |

The job-inspection feature is deliberately not wired into the verified-workflow policy yet. The available SDK data does not provide a definitive job-to-release relationship.

## Evidence Provenance

Preflight distinguishes evidence by its source.

| Provenance         | Meaning                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `local-execution`  | Preflight executed local validation scripts and observed their results.       |
| `fixture`          | Demonstration or test evidence.                                               |
| `user-supplied`    | Evidence loaded from a local file without independent execution verification. |
| `agentia-host-api` | Information retrieved through an Agentia host API, where the query succeeds.  |
| `unavailable`      | The expected evidence could not be obtained.                                  |

Provenance is an application-level classification, not cryptographic attestation.

### Demonstration evidence

The `.agentia-preflight-evidence.yml` file contains example workflow and validation statuses.

Those statuses are useful for demonstrating policy evaluation, but they remain fixtures. They must not be interpreted as actual Copado workflow executions.

When `--run-validation` is used, Preflight replaces the validation evidence loaded from the YAML file with the results of the local build and test execution for that assessment.

## Job Status and Correlation

The job-inspection component uses the SDK's job, pipeline, and promotion APIs.

### Status interpretation

The current implementation normalizes statuses case-insensitively.

| Reported status                                                           | Interpretation |
| ------------------------------------------------------------------------- | -------------- |
| `Successful`, `Success`                                                   | Passed         |
| `Error`, `Failed`, `Aborted`                                              | Failed         |
| `In Progress`, `Pending`, `Queued`, `Running`, and recognized equivalents | Pending        |
| Unrecognized or missing status                                            | Unknown        |

Unknown statuses are never treated as successful.

### Correlation confidence

The SDK does not currently expose a definitive relationship between each job and the branch, release, or promotion being assessed.

Preflight therefore uses available job names, promotion names, pipeline names, and branch configuration to produce a best-effort correlation.

| Confidence  | Meaning                                                 |
| ----------- | ------------------------------------------------------- |
| `inferred`  | One possible promotion matches the available job names. |
| `ambiguous` | Multiple promotions match the available job names.      |
| `unmatched` | No promotion matches the available job names.           |

A branch comparison can indicate whether the matched pipeline's configured branches include the current workspace branch.

These results are observational and inferred. They do not prove that a particular job validated the release under assessment. Consequently, job inspection does not currently satisfy the verified-workflow policy automatically.

### Authentication

The Agentia host APIs may be available in the CLI even when CI/CD authentication is not configured. In that case, workspace context may still be available while job, pipeline, and promotion queries fail.

The current collector reports partial or unavailable query results. It does not fabricate job data or mark an unavailable inspection as a successful workflow.

Follow the installed Agentia CLI's documented authentication procedure to configure valid CI/CD credentials before expecting live results.

## Generated Artifacts

### `release-plan.md`

A human-readable assessment containing the recommendation, Agentia context, Git change summary, workflow and validation evidence, checklist, approval status, risks, and next step.

### `evidence.json`

A structured JSON receipt containing the assessment's inputs, policy, evidence provenance, checklist, risks, and recommendation.

### `agentia-job-inspection.json`

Generated when `--inspect-jobs` or `--job-id` is used. It records the job-inspection attempt, returned job summaries, available pipeline and promotion information, correlation confidence, query statuses, and errors.

This artifact is separate from `evidence.json` because job inspection is not currently used as verified workflow evidence by the policy engine.

## Testing

Build:

```powershell
npm run build
```

Test:

```powershell
npm test
```

The automated test suite covers policy evaluation, evidence provenance, Agentia context handling, checklist generation, local validation, job-status interpretation, correlation classification, and partial or unavailable API results.

The job-inspection tests use mocked SDK responses. They verify interpretation and error handling, but do not establish that live Copado queries succeed in an authenticated environment.

## Permission Model

The plugin manifest declares Agentia host API requirements and the `git` and `npm` commands used by the project. Copado confirmed that the job, pipeline, and promotion APIs are supported for third-party plugins and do not require additional manifest permissions beyond declaring the needed methods in `getAgentiaHost({ requires: [...] })`.

Live job inspection still requires suitable CI/CD credentials.

Local validation invokes the scripts configured in `package.json`. Review those scripts before using the plugin against an unfamiliar repository.

## Current Limitations

* **Live job data depends on CI/CD authentication:** Queries cannot return actual job, pipeline, or promotion records without the required access.
* **Job-to-release correlation is inferred:** The SDK does not currently expose a definitive relationship between a job and the release under assessment.
* **No automatic release execution:** Preflight assesses readiness; it does not promote or deploy changes.
* **No authenticated human approval:** The current approval check evaluates a recorded status rather than an authenticated approver identity.
* **Script trust:** Local validation executes the configured npm scripts and does not independently establish their quality.
* **Prototype status:** The project is not intended to serve as the sole production release gate without further integration, security, and operational testing.

## Demonstrated Impact

Preflight demonstrates how evidence provenance can change a release-readiness decision.

In the default assessment, the example workflow reports successful validation and quality-gate results, but the evidence is identified as `fixture`. Preflight blocks release readiness rather than treating those results as independently verified workflow execution.

When invoked with `--run-validation`, Preflight executes the configured build and test commands. In the verified local run, both completed successfully, and their evidence was recorded as `local-execution`. The validation-evidence blocker was removed, while the workflow-evidence blocker remained.

This distinction is deliberate: passing local tests does not prove that an Agentia CI/CD workflow actually ran.

The current implementation passes 57 automated tests across six test files. These results demonstrate the prototype's tested behavior; production adoption, incident reduction, and operational savings have not been measured.

Preflight complements Agentia; it does not authorize releases or execute promotions or deployments. It provides evidence-informed recommendations and does not claim to independently enforce or prevent a production release.

## Project Goal

Agentia Preflight aims to make release readiness more explainable, evidence-aware, and reproducible by combining change analysis, local validation, policy evaluation, read-only job inspection, and reviewable artifacts in a single terminal workflow.
