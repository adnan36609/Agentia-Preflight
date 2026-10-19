import type { ValidationEvidence } from './policy.js'
import type { WorkflowEvidence } from './workflow.js'

export interface TestChecklistItem {
  priority: 'P0' | 'P1' | 'P2'
  completed: boolean
  task: string
}

type CheckStatus = 'passed' | 'failed' | 'unknown'

interface NamedCheck {
  name: string
  status: CheckStatus
}

function collectEvidenceTasks(
  label: string,
  status: CheckStatus,
  checks: NamedCheck[],
): TestChecklistItem[] {
  const items: TestChecklistItem[] = []

  if (status === 'unknown') {
    items.push({
      priority: 'P0',
      completed: false,
      task:
        checks.length === 0
          ? `Provide ${label} evidence and run the required checks.`
          : `Confirm the overall ${label} result; its status is unknown.`,
    })
  }

  if (
    status === 'failed' &&
    !checks.some(check => check.status === 'failed')
  ) {
    items.push({
      priority: 'P0',
      completed: false,
      task: `Investigate the reported ${label} failure; no individual failing check was supplied.`,
    })
  }

  if (status === 'passed' && checks.length === 0) {
    items.push({
      priority: 'P1',
      completed: false,
      task: `Review the reported ${label} result; no individual checks were supplied.`,
    })
  }

  for (const check of checks) {
    if (check.status === 'failed') {
      items.push({
        priority: 'P0',
        completed: false,
        task: `Fix failed ${label} check: ${check.name}.`,
      })
    } else if (check.status === 'unknown') {
      items.push({
        priority: 'P0',
        completed: false,
        task: `Run or provide evidence for ${label} check: ${check.name}.`,
      })
    } else {
      items.push({
        priority: 'P2',
        completed: true,
        task: `${label} check passed: ${check.name}.`,
      })
    }
  }

  return items
}

export function buildTestChecklist(
  workflow: WorkflowEvidence,
  validation: ValidationEvidence,
): TestChecklistItem[] {
  const items = [
    ...collectEvidenceTasks(
      'Agentia workflow',
      workflow.status,
      workflow.checks,
    ),
    ...collectEvidenceTasks(
      'validation',
      validation.status,
      validation.checks,
    ),
  ]

  const priorityOrder = { P0: 0, P1: 1, P2: 2 }

  items.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  )

  if (items.length === 0) {
    items.push({
      priority: 'P2',
      completed: true,
      task: 'All reported workflow and validation checks passed.',
    })
  }

  return items
}

export function formatChecklistItem(item: TestChecklistItem): string {
  const checkbox = item.completed ? 'x' : ' '

  return `- [${checkbox}] **${item.priority} — ${item.completed ? 'Verified' : 'Action required'}:** ${item.task}`
}