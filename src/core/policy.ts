import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import type { AgentiaContextEvidence } from './agentia-context.js'
import type { GitEvidence } from './git.js'
import {
  defaultWorkflowEvidence,
  type EvidenceProvenance,
  type WorkflowEvidence,
} from './workflow.js'

export interface Policy {
  requireCleanWorkingTree: boolean
  requireValidationEvidence: boolean
  requireWorkflowEvidence: boolean
  requireHumanApproval: boolean
  maxChangedFiles: number
  requireVerifiedWorkflowEvidence?: boolean
  requireVerifiedValidationEvidence?: boolean
}

export interface ValidationEvidence {
  status: 'passed' | 'failed' | 'unknown'
  checks: Array<{
    name: string
    status: 'passed' | 'failed' | 'unknown'
  }>
  provenance?: EvidenceProvenance
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
  requireVerifiedWorkflowEvidence: true,
  requireVerifiedValidationEvidence: true,
  requireHumanApproval: true,
  maxChangedFiles: 50,
}

type EvidenceStatus = 'passed' | 'failed' | 'unknown'

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function normalizeStatus(value: unknown): EvidenceStatus {
  if (value === 'passed' || value === 'failed') {
    return value
  }

  return 'unknown'
}

function normalizeChecks(
  value: unknown,
): Array<{ name: string; status: EvidenceStatus }> {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap(entry => {
    if (!isRecord(entry)) {
      return []
    }

    if (
      typeof entry.name !== 'string' ||
      entry.name.trim().length === 0
    ) {
      return []
    }

    return [
      {
        name: entry.name,
        status: normalizeStatus(entry.status),
      },
    ]
  })
}

/**
 * Evidence loaded from YAML cannot establish its own live provenance.
 * Only an explicit fixture label is preserved; other declarations are
 * treated as user-supplied evidence.
 */
function normalizeFileProvenance(
  value: unknown,
): EvidenceProvenance {
  return value === 'fixture' ? 'fixture' : 'user-supplied'
}

export async function loadPolicy(
  path = '.agentia-preflight.yml',
): Promise<Policy> {
  try {
    const content = await readFile(path, 'utf8')
    const parsed: unknown = parse(content) ?? {}
    const config = isRecord(parsed) ? parsed : {}

    const configuredPolicies = isRecord(config.policies)
      ? config.policies
      : {}

    return {
      ...defaults,
      ...configuredPolicies,
    } as Policy
  } catch {
    return { ...defaults }
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
    const parsed: unknown = parse(content) ?? {}
    const config = isRecord(parsed) ? parsed : {}

    const workflowConfig = isRecord(config.workflow)
      ? config.workflow
      : undefined

    const validationConfig = isRecord(config.validation)
      ? config.validation
      : undefined

    const approvalConfig = isRecord(config.approval)
      ? config.approval
      : undefined

    const workflow: WorkflowEvidence = workflowConfig
      ? {
          status: normalizeStatus(workflowConfig.status),
          name:
            typeof workflowConfig.name === 'string'
              ? workflowConfig.name
              : 'Supplied workflow evidence',
          checks: normalizeChecks(workflowConfig.checks),
          provenance: normalizeFileProvenance(
            workflowConfig.provenance,
          ),
        }
      : defaultWorkflowEvidence

    const validation: ValidationEvidence = validationConfig
      ? {
          status: normalizeStatus(validationConfig.status),
          checks: normalizeChecks(validationConfig.checks),
          provenance: normalizeFileProvenance(
            validationConfig.provenance,
          ),
        }
      : {
          status: 'unknown',
          checks: [],
          provenance: 'unavailable',
        }

    const approvalStatus = approvalConfig?.status

    const approval: ApprovalEvidence = {
      status:
        approvalStatus === 'approved' ||
        approvalStatus === 'pending'
          ? approvalStatus
          : 'unknown',
    }

    return {
      workflow,
      validation,
      approval,
    }
  } catch {
    return {
      workflow: defaultWorkflowEvidence,
      validation: {
        status: 'unknown',
        checks: [],
        provenance: 'unavailable',
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
  agentiaContext?: AgentiaContextEvidence,
): Risk[] {
  const risks: Risk[] = []

  if (agentiaContext?.status === 'unavailable') {
    risks.push({
      id: 'AGENTIA_CONTEXT_UNAVAILABLE',
      severity: 'WARN',
      title: 'Agentia context is unavailable',
      reason:
        'Preflight could not retrieve Agentia workspace and authentication context. The assessment is continuing with the available local evidence.',
    })
  }

  if (agentiaContext?.status === 'available') {
    const workspaceBranch = agentiaContext.workspace.branch

    if (workspaceBranch && workspaceBranch !== git.branch) {
      risks.push({
        id: 'WORKSPACE_BRANCH_MISMATCH',
        severity: 'BLOCK',
        title: 'Git branch does not match the Agentia workspace',
        reason: `The local Git branch is "${git.branch}", but the Agentia workspace reports "${workspaceBranch}". Confirm that the correct branch is being assessed.`,
      })
    }
  }

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
        reason:
          'The provided Agentia workflow evidence reports a failed workflow.',
      })
    }

    if (
      policy.requireVerifiedWorkflowEvidence === true &&
      evidence.workflow.status !== 'unknown' &&
      evidence.workflow.provenance !== 'agentia-host-api'
    ) {
      const provenance =
        evidence.workflow.provenance ?? 'unavailable'

      let reason: string

      if (provenance === 'fixture') {
        reason =
          'The workflow result is demonstration fixture data, not a result retrieved from an Agentia host API.'
      } else if (provenance === 'user-supplied') {
        reason =
          'The workflow result came from a supplied evidence file and was not independently retrieved from an Agentia host API.'
      } else if (provenance === 'local-execution') {
        reason =
          'Local execution evidence does not establish that the Agentia workflow itself completed successfully.'
      } else {
        reason =
          'The workflow evidence source is not verified. Retrieve the workflow result through a supported Agentia host API integration.'
      }

      risks.push({
        id: 'WORKFLOW_EVIDENCE_UNVERIFIED',
        severity: 'BLOCK',
        title: 'Workflow evidence is not verified',
        reason,
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

    // A passed status alone is insufficient: the source must be trusted.
    if (
      policy.requireVerifiedValidationEvidence === true &&
      evidence.validation.status !== 'unknown' &&
      evidence.validation.provenance !== 'local-execution'
    ) {
      const provenance =
        evidence.validation.provenance ?? 'unavailable'

      risks.push({
        id: 'VALIDATION_EVIDENCE_UNVERIFIED',
        severity: 'BLOCK',
        title: 'Validation evidence is not verified',
        reason:
          `Validation evidence has provenance "${provenance}". ` +
          'The configured policy requires validation checks ' +
          'executed locally by Preflight or an accepted integration.',
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