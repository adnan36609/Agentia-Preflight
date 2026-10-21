import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  evaluatePolicy,
  getRecommendation,
  loadEvidence,
  type ApprovalEvidence,
  type Policy,
  type ValidationEvidence,
} from './policy.js'
import type { GitEvidence } from './git.js'
import type { AgentiaContextEvidence } from './agentia-context.js'
import type {
  EvidenceProvenance,
  WorkflowEvidence,
} from './workflow.js'

const policy: Policy = {
  requireCleanWorkingTree: true,
  requireWorkflowEvidence: true,
  requireVerifiedWorkflowEvidence: true,
  requireValidationEvidence: true,
  requireVerifiedValidationEvidence: true,
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

const validation: ValidationEvidence = {
  status: 'passed',
  checks: [],
  provenance: 'local-execution',
}

const approval: ApprovalEvidence = {
  status: 'approved',
}

function makeEvidence(
  provenance: EvidenceProvenance,
): {
  workflow: WorkflowEvidence
  validation: ValidationEvidence
  approval: ApprovalEvidence
} {
  return {
    workflow: {
      status: 'passed',
      name: 'Test workflow',
      checks: [],
      provenance,
    },
    validation: { ...validation },
    approval: { ...approval },
  }
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

describe('workflow evidence provenance', () => {
  it('blocks demonstration fixture workflow evidence', () => {
    const risks = evaluatePolicy(
      policy,
      git,
      makeEvidence('fixture'),
    )

    expect(
      risks.some(
        risk => risk.id === 'WORKFLOW_EVIDENCE_UNVERIFIED',
      ),
    ).toBe(true)

    expect(getRecommendation(risks)).toBe('BLOCK')
  })

  it('blocks user-supplied workflow evidence', () => {
    const risks = evaluatePolicy(
      policy,
      git,
      makeEvidence('user-supplied'),
    )

    expect(
      risks.some(
        risk => risk.id === 'WORKFLOW_EVIDENCE_UNVERIFIED',
      ),
    ).toBe(true)

    expect(getRecommendation(risks)).toBe('BLOCK')
  })

  it('does not flag workflow provenance when the source is an Agentia host API', () => {
    const risks = evaluatePolicy(
      policy,
      git,
      makeEvidence('agentia-host-api'),
    )

    expect(
      risks.some(
        risk => risk.id === 'WORKFLOW_EVIDENCE_UNVERIFIED',
      ),
    ).toBe(false)

    expect(getRecommendation(risks)).toBe('READY')
  })

  it('does not treat missing workflow evidence as verified', () => {
    const risks = evaluatePolicy(policy, git, {
      workflow: {
        status: 'unknown',
        name: 'Agentia workflow',
        checks: [],
        provenance: 'unavailable',
      },
      validation: { ...validation },
      approval: { ...approval },
    })

    expect(
      risks.some(
        risk => risk.id === 'WORKFLOW_EVIDENCE_MISSING',
      ),
    ).toBe(true)

    expect(
      risks.some(
        risk => risk.id === 'WORKFLOW_EVIDENCE_UNVERIFIED',
      ),
    ).toBe(false)

    expect(getRecommendation(risks)).toBe('BLOCK')
  })
})

describe('validation evidence provenance', () => {
  it('blocks fixture validation evidence', () => {
    const evidence = makeEvidence('agentia-host-api')

    evidence.validation.provenance = 'fixture'

    const risks = evaluatePolicy(policy, git, evidence)

    expect(
      risks.some(
        risk => risk.id === 'VALIDATION_EVIDENCE_UNVERIFIED',
      ),
    ).toBe(true)

    expect(getRecommendation(risks)).toBe('BLOCK')
  })
})

describe('evidence-file provenance', () => {
  let temporaryDirectory: string | undefined

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      })

      temporaryDirectory = undefined
    }
  })

  it('does not trust live provenance declared inside a YAML file', async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'agentia-preflight-test-'),
    )

    const evidencePath = join(
      temporaryDirectory,
      'evidence.yml',
    )

    await writeFile(
      evidencePath,
      [
        'workflow:',
        '  provenance: agentia-host-api',
        '  status: passed',
        '  name: Claimed live workflow',
        '  checks: []',
        'validation:',
        '  provenance: local-execution',
        '  status: passed',
        '  checks: []',
        'approval:',
        '  status: approved',
        '',
      ].join('\n'),
      'utf8',
    )

    const evidence = await loadEvidence(evidencePath)

    expect(evidence.workflow.provenance).toBe('user-supplied')
    expect(evidence.validation.provenance).toBe('user-supplied')
  })

  it('preserves the fixture label for demonstration evidence', async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'agentia-preflight-test-'),
    )

    const evidencePath = join(
      temporaryDirectory,
      'evidence.yml',
    )

    await writeFile(
      evidencePath,
      [
        'workflow:',
        '  provenance: fixture',
        '  status: passed',
        '  name: Demo workflow',
        '  checks: []',
        '',
      ].join('\n'),
      'utf8',
    )

    const evidence = await loadEvidence(evidencePath)

    expect(evidence.workflow.provenance).toBe('fixture')
  })
})