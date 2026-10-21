import { describe, expect, it } from 'vitest'
import {
  evaluatePolicy,
  getRecommendation,
  type Policy,
} from './policy.js'
import type { GitEvidence } from './git.js'
import type { AgentiaContextEvidence } from './agentia-context.js'
import type { WorkflowEvidence } from './workflow.js'
import type {
  ApprovalEvidence,
  ValidationEvidence,
} from './policy.js'

const policy: Policy = {
  requireCleanWorkingTree: true,
  requireWorkflowEvidence: true,
  requireValidationEvidence: true,
  requireHumanApproval: true,
  maxChangedFiles: 50,
}

const git: GitEvidence = {
  branch: 'feature/preflight',
  base: 'main',
  changedFiles: [],
  additions: 0,
  deletions: 0,
  clean: true,
}

const evidence: {
  workflow: WorkflowEvidence
  validation: ValidationEvidence
  approval: ApprovalEvidence
} = {
  workflow: {
    status: 'passed',
    name: 'Demo workflow fixture',
    checks: [],
  },
  validation: {
    status: 'passed',
    checks: [],
  },
  approval: {
    status: 'approved',
  },
}

const matchingContext: AgentiaContextEvidence = {
  status: 'available',
  source: 'agentia-plugin-sdk',
  cliVersion: '1.0.0',
  hostApiVersion: 1,
  authentication: {
    ai: { configured: false, ready: false },
    cicd: { configured: false },
    crt: { configured: false, ready: false },
  },
  workspace: {
    branch: 'feature/preflight',
    baseBranch: 'main',
    workItemId: null,
    workItemName: null,
    workItemTitle: null,
    project: null,
    environment: null,
  },
}

describe('Agentia context policy checks', () => {
  it('blocks when the local and Agentia workspace branches differ', () => {
    const context: AgentiaContextEvidence = {
      ...matchingContext,
      workspace: {
        ...matchingContext.workspace,
        branch: 'release/production',
      },
    }

    const risks = evaluatePolicy(policy, git, evidence, context)

    expect(risks.some(risk => risk.id === 'WORKSPACE_BRANCH_MISMATCH')).toBe(
      true,
    )
    expect(getRecommendation(risks)).toBe('BLOCK')
  })

  it('continues with a warning when Agentia context is unavailable', () => {
    const context: AgentiaContextEvidence = {
      status: 'unavailable',
      source: 'agentia-plugin-sdk',
      error: 'Context unavailable in this test.',
    }

    const risks = evaluatePolicy(policy, git, evidence, context)

    expect(
      risks.some(risk => risk.id === 'AGENTIA_CONTEXT_UNAVAILABLE'),
    ).toBe(true)
    expect(getRecommendation(risks)).toBe('WARN')
  })

  it('does not report a branch mismatch when branches match', () => {
    const risks = evaluatePolicy(policy, git, evidence, matchingContext)

    expect(
      risks.some(risk => risk.id === 'WORKSPACE_BRANCH_MISMATCH'),
    ).toBe(false)
    expect(getRecommendation(risks)).toBe('READY')
  })
})