import { describe, expect, it } from 'vitest'
import {
  buildTestChecklist,
  formatChecklistItem,
} from './checklist.js'
import type { ValidationEvidence } from './policy.js'
import type { WorkflowEvidence } from './workflow.js'

const passedWorkflow: WorkflowEvidence = {
  status: 'passed',
  name: 'Agentia CI/CD validation',
  provenance: 'agentia-host-api',
  checks: [
    { name: 'Workflow validation', status: 'passed' },
    { name: 'Quality gate', status: 'passed' },
  ],
}

const passedValidation: ValidationEvidence = {
  status: 'passed',
  provenance: 'local-execution',
  checks: [
    { name: 'TypeScript build', status: 'passed' },
    { name: 'Unit tests', status: 'passed' },
  ],
}

const fixtureWorkflow: WorkflowEvidence = {
  status: 'passed',
  name: 'Demo workflow fixture',
  provenance: 'fixture',
  checks: [
    { name: 'Workflow validation', status: 'passed' },
    { name: 'Quality gate', status: 'passed' },
  ],
}

const fixtureValidation: ValidationEvidence = {
  status: 'passed',
  provenance: 'fixture',
  checks: [
    { name: 'TypeScript build', status: 'passed' },
    { name: 'Unit tests', status: 'passed' },
  ],
}

describe('buildTestChecklist', () => {
  it('prioritizes failed checks before passed checks', () => {
    const validation: ValidationEvidence = {
      status: 'failed',
      provenance: 'local-execution',
      checks: [
        { name: 'Unit tests', status: 'failed' },
        { name: 'TypeScript build', status: 'passed' },
      ],
    }

    const checklist = buildTestChecklist(
      passedWorkflow,
      validation,
    )

    expect(checklist[0].priority).toBe('P0')
    expect(checklist[0].completed).toBe(false)
    expect(checklist[0].task).toContain('Unit tests')
    expect(
      checklist.some(
        item => item.priority === 'P2' && item.completed,
      ),
    ).toBe(true)
  })

  it('requests workflow evidence when it is missing', () => {
    const workflow: WorkflowEvidence = {
      status: 'unknown',
      name: 'Agentia workflow',
      provenance: 'unavailable',
      checks: [],
    }

    const checklist = buildTestChecklist(
      workflow,
      passedValidation,
    )

    expect(checklist[0].priority).toBe('P0')
    expect(checklist[0].task).toContain(
      'Provide Agentia workflow evidence',
    )
  })

  it('flags an unknown overall status even if individual checks passed', () => {
    const workflow: WorkflowEvidence = {
      status: 'unknown',
      name: 'Agentia workflow',
      provenance: 'agentia-host-api',
      checks: [
        { name: 'Quality gate', status: 'passed' },
      ],
    }

    const checklist = buildTestChecklist(
      workflow,
      passedValidation,
    )

    expect(
      checklist.some(
        item =>
          item.priority === 'P0' &&
          item.task.includes('overall Agentia workflow result'),
      ),
    ).toBe(true)
  })

  it('requests review when only an overall passed status is recorded', () => {
    const workflow: WorkflowEvidence = {
      status: 'passed',
      name: 'Agentia workflow',
      provenance: 'user-supplied',
      checks: [],
    }

    const checklist = buildTestChecklist(
      workflow,
      passedValidation,
    )

    expect(
      checklist.some(
        item => item.priority === 'P1' && !item.completed,
      ),
    ).toBe(true)
  })

  it('marks checks completed when their provenance is appropriate', () => {
    const checklist = buildTestChecklist(
      passedWorkflow,
      passedValidation,
    )

    expect(checklist).toHaveLength(4)
    expect(checklist.every(item => item.completed)).toBe(true)
    expect(checklist.every(item => item.priority === 'P2')).toBe(true)
  })

  it('does not mark fixture workflow checks completed', () => {
    const checklist = buildTestChecklist(
      fixtureWorkflow,
      passedValidation,
    )

    const workflowItems = checklist.filter(
      item => item.task.includes('Agentia workflow check'),
    )

    expect(workflowItems).toHaveLength(2)
    expect(workflowItems.every(item => !item.completed)).toBe(true)
    expect(
      workflowItems.every(item => item.priority === 'P1'),
    ).toBe(true)
    expect(
      workflowItems.every(
        item => item.task.includes('provenance: fixture'),
      ),
    ).toBe(true)
  })

  it('does not mark fixture validation checks completed', () => {
    const checklist = buildTestChecklist(
      passedWorkflow,
      fixtureValidation,
    )

    const validationItems = checklist.filter(
      item => item.task.includes('validation check'),
    )

    expect(validationItems).toHaveLength(2)
    expect(validationItems.every(item => !item.completed)).toBe(true)
    expect(
      validationItems.every(item => item.priority === 'P1'),
    ).toBe(true)
    expect(
      validationItems.every(
        item => item.task.includes('provenance: fixture'),
      ),
    ).toBe(true)
  })

  it('does not treat missing provenance as verified', () => {
    const workflow: WorkflowEvidence = {
      status: 'passed',
      name: 'Workflow without provenance',
      checks: [
        { name: 'Quality gate', status: 'passed' },
      ],
    }

    const validation: ValidationEvidence = {
      status: 'passed',
      checks: [
        { name: 'Unit tests', status: 'passed' },
      ],
    }

    const checklist = buildTestChecklist(
      workflow,
      validation,
    )

    expect(checklist).toHaveLength(2)
    expect(checklist.every(item => !item.completed)).toBe(true)
    expect(
      checklist.every(item => item.task.includes('unavailable')),
    ).toBe(true)
  })

  it('formats verified checklist items correctly', () => {
    expect(
      formatChecklistItem({
        priority: 'P2',
        completed: true,
        task: 'Unit tests verified as passed.',
      }),
    ).toBe(
      '- [x] **P2 - Verified:** Unit tests verified as passed.',
    )
  })

  it('formats items requiring action correctly', () => {
    expect(
      formatChecklistItem({
        priority: 'P1',
        completed: false,
        task: 'Verify the reported unit test result.',
      }),
    ).toBe(
      '- [ ] **P1 - Action required:** Verify the reported unit test result.',
    )
  })
})