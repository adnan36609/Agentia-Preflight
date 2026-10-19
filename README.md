# Agentia Preflight

**Evidence-based release readiness for Agentia workflows.**

Agentia Preflight is a terminal-first plugin for the Copado Agentia CLI. It evaluates Git changes, supplied workflow and validation evidence, human approval status, and project policies to produce an explainable release-readiness recommendation.

The result is one of three states:

- **BLOCK** — A blocking policy condition requires resolution.
- **WARN** — Review or approval is required.
- **READY** — No configured readiness risks were detected.

Preflight also generates a prioritized test checklist, a human-readable release plan, and a structured JSON evidence receipt.

> **Project status:** Hackathon prototype. The current version evaluates explicitly supplied YAML evidence. It does not independently verify that a live Copado workflow ran or automatically retrieve workflow results from a Copado organization.

## Why Preflight?

AI-assisted development can accelerate software delivery, but release decisions still need evidence of successful validation, policy compliance, and human oversight.

Preflight makes those requirements visible in one terminal assessment. Developers can review the detected risks and recommended next steps before proceeding through the normal Agentia release workflow.

Preflight complements Agentia. It does not replace Copado's system of record, authorize releases, or execute promotions and deployments.

## Features

- **Git change assessment:** Inspects the current branch, working-tree state, changed-file inventory, and tracked-file diff statistics relative to a selected base branch.
- **Policy as code:** Reads configurable readiness requirements from `.agentia-preflight.yml`.
- **Workflow evidence assessment:** Evaluates supplied Agentia workflow status and individual workflow checks.
- **Validation assessment:** Evaluates supplied build, test, and other validation results.
- **Approval awareness:** Identifies when the configured policy requires human approval that has not yet been recorded.
- **Explainable findings:** Assigns risk identifiers and provides explanations through a dedicated CLI command.
- **Prioritized test checklist:** Organizes required follow-up work by priority.
- **Release artifacts:** Produces `release-plan.md` and `evidence.json`.
- **Agent Skill:** Includes a project-local skill that guides compatible coding agents through the assessment and its guardrails.
- **Automated tests:** Uses Vitest to test policy decisions and checklist behavior.

## How It Works

```text
Git repository
      |
      v
Git change evidence
      |
      +----------------------------+
      |                            |
      v                            v
Project policy              Supplied evidence
.agentia-preflight.yml       .agentia-preflight-evidence.yml
      |                            |
      +-------------+--------------+
                    |
                    v
          Policy evaluation
                    |
                    v
          READY / WARN / BLOCK
                    |
          +---------+---------+
          |         |         |
          v         v         v
       Findings  Test list  Explanations
                    |
                    v
          +------------------+
          | release-plan.md  |
          | evidence.json    |
          +------------------+