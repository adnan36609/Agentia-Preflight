import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import type { GitEvidence } from './git.js'

export interface Policy {
  requireCleanWorkingTree: boolean
  requireValidationEvidence: boolean
  requireHumanApproval: boolean
  maxChangedFiles: number
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

export async function loadPolicy(path = '.agentia-preflight.yml'): Promise<Policy> {
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

export function evaluatePolicy(
  policy: Policy,
  git: GitEvidence,
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
    risks.push({
      id: 'VALIDATION_MISSING',
      severity: 'BLOCK',
      title: 'Validation evidence is missing',
      reason: 'No validation evidence has been provided yet.',
    })
  }

  if (policy.requireHumanApproval) {
    risks.push({
      id: 'HUMAN_APPROVAL_REQUIRED',
      severity: 'WARN',
      title: 'Human approval required',
      reason: 'The release requires explicit human approval before promotion.',
    })
  }

  return risks
}

export function getRecommendation(risks: Risk[]): 'READY' | 'WARN' | 'BLOCK' {
  if (risks.some(risk => risk.severity === 'BLOCK')) {
    return 'BLOCK'
  }

  if (risks.length > 0) {
    return 'WARN'
  }

  return 'READY'
}