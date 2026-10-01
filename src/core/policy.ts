import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import type { GitEvidence } from './git.js'

export interface Policy {
  requireCleanWorkingTree: boolean
  requireValidationEvidence: boolean
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
  validation: ValidationEvidence
  approval: ApprovalEvidence
}> {
  try {
    const content = await readFile(path, 'utf8')
    const config = parse(content) ?? {}

    return {
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

  if (policy.requireValidationEvidence) {
    if (evidence.validation.status === 'unknown') {
      risks.push({
        id: 'VALIDATION_MISSING',
        severity: 'BLOCK',
        title: 'Validation evidence is missing',
        reason: 'No validation evidence was provided.',
      })
    } else if (evidence.validation.status === 'failed') {
      risks.push({
        id: 'VALIDATION_FAILED',
        severity: 'BLOCK',
        title: 'Validation failed',
        reason: 'One or more required validation checks failed.',
      })
    }
  }

  if (policy.requireHumanApproval) {
    if (evidence.approval.status !== 'approved') {
      risks.push({
        id: 'HUMAN_APPROVAL_REQUIRED',
        severity: 'WARN',
        title: 'Human approval required',
        reason: 'The release still requires explicit human approval.',
      })
    }
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