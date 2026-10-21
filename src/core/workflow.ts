export type EvidenceProvenance =
  | 'agentia-host-api'
  | 'local-execution'
  | 'user-supplied'
  | 'fixture'
  | 'unavailable'

export interface WorkflowCheck {
  name: string
  status: 'passed' | 'failed' | 'unknown'
}

export interface WorkflowEvidence {
  status: 'passed' | 'failed' | 'unknown'
  name: string
  checks: WorkflowCheck[]
  provenance?: EvidenceProvenance
}

export const defaultWorkflowEvidence: WorkflowEvidence = {
  status: 'unknown',
  name: 'Agentia workflow',
  checks: [],
  provenance: 'unavailable',
}