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
  checks: [
    { name: 'Workflow validation', status: 'passed' },
    { name: 'Quality gate', status: 'passed' },
  ],
}

const passedValidation: ValidationEvidence = {
  status: 'passed',
  checks: [
    { name: 'TypeScript build', status: 'passed' },
    { name: 'Unit tests', status: 'passed' },
  ],
}

describe('buildTestChecklist', () => {
  it('prioritizes failed checks before passed checks', () => {
    const validation: ValidationEvidence = {
      status: 'failed',
      checks: [
        { name: 'Unit tests', status: 'failed' },
        { name: 'TypeScript build', status: 'passed' },
      ],
    }

    const checklist = buildTestChecklist(passedWorkflow, validation)

    expect(checklist[0].priority).toBe('P0')
    expect(checklist[0].completed).toBe(false)
    expect(checklist[0].task).toContain('Unit tests')
    expect(checklist.some(item => item.priority === 'P2')).toBe(true)
  })

  it('requests workflow evidence when it is missing', () => {
    const workflow: WorkflowEvidence = {
      status: 'unknown',
      name: 'Agentia workflow',
      checks: [],
    }

    const checklist = buildTestChecklist(workflow, passedValidation)

    expect(checklist[0].priority).toBe('P0')
    expect(checklist[0].task).toContain('Provide Agentia workflow evidence')
  })

  it('flags an unknown overall status even if individual checks passed', () => {
    const workflow: WorkflowEvidence = {
      status: 'unknown',
      name: 'Agentia workflow',
      checks: [{ name: 'Quality gate', status: 'passed' }],
    }

    const checklist = buildTestChecklist(workflow, passedValidation)

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
      checks: [],
    }

    const checklist = buildTestChecklist(workflow, passedValidation)

    expect(
      checklist.some(
        item => item.priority === 'P1' && !item.completed,
      ),
    ).toBe(true)
  })

  it('marks passed workflow and validation checks as verified', () => {
    const checklist = buildTestChecklist(passedWorkflow, passedValidation)

    expect(checklist.every(item => item.completed)).toBe(true)
    expect(checklist.every(item => item.priority === 'P2')).toBe(true)
  })

  it('formats checklist items for the release plan', () => {
    expect(
      formatChecklistItem({
        priority: 'P0',
        completed: false,
        task: 'Run unit tests.',
      }),
    ).toBe('- [ ] **P0 — Action required:** Run unit tests.')
  })
})