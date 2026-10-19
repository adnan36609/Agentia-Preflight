import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import type { GitEvidence } from './git.js'
import {
  defaultWorkflowEvidence,
  type WorkflowEvidence,
} from './workflow.js'

export interface Policy {
  requireCleanWorkingTree: boolean
  requireValidationEvidence: boolean
  requireWorkflowEvidence: boolean
  requireHumanApproval: boolean
  maxChangedFiles: number
}

export interface ValidationEvidence {
  status: 'passed' | 'failed' | 'unknown'
  checks: Array<{
    name: string
    status: 'passed' | 'failed' | 'unknown'
  }>
}

export interface ApprovalEvidence {
  status: 'approved' | 'pending' | 'unknown'
}

export interface Risk {
  id: string
  severity: 'BLOCK' | 'WARN'
  title: string
  reason: string
}

const defaults: Policy = {
  requireCleanWorkingTree: true,
  requireValidationEvidence: true,
  requireWorkflowEvidence: true,
  requireHumanApproval: true,
  maxChangedFiles: 50,
}

export async function loadPolicy(
  path = '.agentia-preflight.yml',
): Promise<Policy> {
  try {
    const content = await readFile(path, 'utf8')
    const config = parse(content) ?? {}

    return {
      ...defaults,
      ...(config.policies ?? {}),
    }
  } catch {
    return defaults
  }
}

export async function loadEvidence(
  path = '.agentia-preflight-evidence.yml',
): Promise<{
  workflow: WorkflowEvidence
  validation: ValidationEvidence
  approval: ApprovalEvidence
}> {
  try {
    const content = await readFile(path, 'utf8')
    const config = parse(content) ?? {}

    return {
      workflow: config.workflow ?? defaultWorkflowEvidence,

      validation: config.validation ?? {
        status: 'unknown',
        checks: [],
      },

      approval: config.approval ?? {
        status: 'unknown',
      },
    }
  } catch {
    return {
      workflow: defaultWorkflowEvidence,

      validation: {
        status: 'unknown',
        checks: [],
      },

      approval: {
        status: 'unknown',
      },
    }
  }
}

export function evaluatePolicy(
  policy: Policy,
  git: GitEvidence,
  evidence: {
    workflow: WorkflowEvidence
    validation: ValidationEvidence
    approval: ApprovalEvidence
  },
): Risk[] {
  const risks: Risk[] = []

  if (policy.requireCleanWorkingTree && !git.clean) {
    risks.push({
      id: 'WORKTREE_DIRTY',
      severity: 'BLOCK',
      title: 'Working tree is not clean',
      reason: 'Uncommitted local changes are present.',
    })
  }

  if (git.changedFiles.length > policy.maxChangedFiles) {
    risks.push({
      id: 'CHANGESET_TOO_LARGE',
      severity: 'WARN',
      title: 'Change set is large',
      reason: `${git.changedFiles.length} files changed; policy allows ${policy.maxChangedFiles}.`,
    })
  }

  if (policy.requireWorkflowEvidence) {
    if (evidence.workflow.status === 'unknown') {
      risks.push({
        id: 'WORKFLOW_EVIDENCE_MISSING',
        severity: 'BLOCK',
        title: 'Agentia workflow evidence is missing',
        reason: 'No confirmed overall Agentia workflow result was provided.',
      })
    } else if (evidence.workflow.status === 'failed') {
      risks.push({
        id: 'WORKFLOW_FAILED',
        severity: 'BLOCK',
        title: 'Agentia workflow failed',
        reason: 'The provided Agentia workflow evidence reports a failed workflow.',
      })
    }

    for (const check of evidence.workflow.checks) {
      if (check.status === 'failed') {
        risks.push({
          id: 'WORKFLOW_CHECK_FAILED',
          severity: 'BLOCK',
          title: 'An Agentia workflow check failed',
          reason: `The workflow check "${check.name}" is marked as failed.`,
        })
      } else if (check.status === 'unknown') {
        risks.push({
          id: 'WORKFLOW_CHECK_UNVERIFIED',
          severity: 'BLOCK',
          title: 'An Agentia workflow check is unverified',
          reason: `The workflow check "${check.name}" has no confirmed result.`,
        })
      }
    }
  }

  if (policy.requireValidationEvidence) {
    if (evidence.validation.status === 'unknown') {
      risks.push({
        id: 'VALIDATION_MISSING',
        severity: 'BLOCK',
        title: 'Validation evidence is missing',
        reason: 'No confirmed overall validation result was provided.',
      })
    } else if (evidence.validation.status === 'failed') {
      risks.push({
        id: 'VALIDATION_FAILED',
        severity: 'BLOCK',
        title: 'Validation failed',
        reason: 'One or more required validation checks failed.',
      })
    }

    for (const check of evidence.validation.checks) {
      if (check.status === 'failed') {
        risks.push({
          id: 'VALIDATION_CHECK_FAILED',
          severity: 'BLOCK',
          title: 'A validation check failed',
          reason: `The validation check "${check.name}" is marked as failed.`,
        })
      } else if (check.status === 'unknown') {
        risks.push({
          id: 'VALIDATION_CHECK_UNVERIFIED',
          severity: 'BLOCK',
          title: 'A validation check is unverified',
          reason: `The validation check "${check.name}" has no confirmed result.`,
        })
      }
    }
  }

  if (
    policy.requireHumanApproval &&
    evidence.approval.status !== 'approved'
  ) {
    risks.push({
      id: 'HUMAN_APPROVAL_REQUIRED',
      severity: 'WARN',
      title: 'Human approval required',
      reason: 'The release still requires explicit human approval.',
    })
  }

  return risks
}

export function getRecommendation(
  risks: Risk[],
): 'READY' | 'WARN' | 'BLOCK' {
  if (risks.some(risk => risk.severity === 'BLOCK')) {
    return 'BLOCK'
  }

  if (risks.length > 0) {
    return 'WARN'
  }

  return 'READY'
}