export interface WorkflowCheck {
  name: string
  status: 'passed' | 'failed' | 'unknown'
}

export interface WorkflowEvidence {
  status: 'passed' | 'failed' | 'unknown'
  name: string
  checks: WorkflowCheck[]
}

export const defaultWorkflowEvidence: WorkflowEvidence = {
  status: 'unknown',
  name: 'Agentia workflow',
  checks: [],
}