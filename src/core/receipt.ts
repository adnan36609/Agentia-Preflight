import { writeFile } from 'node:fs/promises'
import {
  formatCredentialStatus,
  type AgentiaContextEvidence,
} from './agentia-context.js'
import type { GitEvidence } from './git.js'
import type {
  ApprovalEvidence,
  Policy,
  Risk,
  ValidationEvidence,
} from './policy.js'
import type { TestChecklistItem } from './checklist.js'
import { formatChecklistItem } from './checklist.js'
import type { WorkflowEvidence } from './workflow.js'

export interface PreflightReceipt {
  generatedAt: string
  recommendation: 'READY' | 'WARN' | 'BLOCK'
  agentiaContext: AgentiaContextEvidence
  git: GitEvidence
  workflow: WorkflowEvidence
  validation: ValidationEvidence
  approval: ApprovalEvidence
  testChecklist: TestChecklistItem[]
  risks: Risk[]
  policy: Policy
}

export async function writeReceipt(
  receipt: PreflightReceipt,
): Promise<void> {
  await writeFile(
    'evidence.json',
    JSON.stringify(receipt, null, 2) + '\n',
    'utf8',
  )

  const lines = [
    '# Agentia Preflight Release Plan',
    '',
    `**Recommendation:** ${receipt.recommendation}`,
    `**Generated:** ${receipt.generatedAt}`,
    '',
    '## Agentia Context',
    '',
    `- Context status: ${receipt.agentiaContext.status}`,
  ]

  if (receipt.agentiaContext.status === 'available') {
    const context = receipt.agentiaContext

    lines.push(
      `- Source: ${context.source}`,
      `- CLI version: ${context.cliVersion}`,
      `- Host API version: ${context.hostApiVersion}`,
      `- CICD authentication: ${formatCredentialStatus(context.authentication.cicd)}`,
      `- CRT authentication: ${formatCredentialStatus(context.authentication.crt)}`,
      `- AI authentication: ${formatCredentialStatus(context.authentication.ai)}`,
      `- Workspace branch: ${context.workspace.branch ?? 'not reported'}`,
      `- Workspace base: ${context.workspace.baseBranch ?? 'not reported'}`,
      `- Active work item: ${context.workspace.workItemName ?? 'none reported'}`,
      `- Work item title: ${context.workspace.workItemTitle ?? 'not reported'}`,
      `- Project: ${context.workspace.project ?? 'not reported'}`,
      `- Environment: ${context.workspace.environment ?? 'not reported'}`,
    )
  } else {
    lines.push(`- Reason: ${receipt.agentiaContext.error}`)
  }

  lines.push(
    '',
    '## Change Evidence',
    '',
    `- Branch: ${receipt.git.branch}`,
    `- Base: ${receipt.git.base}`,
    `- Working tree: ${receipt.git.clean ? 'CLEAN' : 'CHANGED'}`,
    `- Changed files: ${receipt.git.changedFiles.length}`,
    `- Additions: ${receipt.git.additions}`,
    `- Deletions: ${receipt.git.deletions}`,
    '',
    '## Agentia Workflow Evidence',
    '',
    `- Workflow: ${receipt.workflow.name}`,
    `- Status: ${receipt.workflow.status}`,
    `- Evidence provenance: ${receipt.workflow.provenance ?? 'unavailable'}`,
    ...receipt.workflow.checks.map(
      check => `- ${check.name}: ${check.status}`,
    ),
    '',
    '## Validation',
    '',
    `- Status: ${receipt.validation.status}`,
    `- Evidence provenance: ${receipt.validation.provenance ?? 'unavailable'}`,
    ...receipt.validation.checks.map(
      check => `- ${check.name}: ${check.status}`,
    ),
    '',
    '## Prioritized Test Checklist',
    '',
    ...receipt.testChecklist.map(formatChecklistItem),
    '',
    '## Approval',
    '',
    `- Status: ${receipt.approval.status}`,
    '',
    '## Findings',
    '',
  )

  if (receipt.risks.length === 0) {
    lines.push('No policy risks detected.')
  } else {
    for (const risk of receipt.risks) {
      lines.push(`- **[${risk.severity}] ${risk.id}** — ${risk.title}`)
      lines.push(`  - ${risk.reason}`)
    }
  }

  lines.push(
    '',
    '## Next Step',
    '',
    receipt.recommendation === 'BLOCK'
      ? 'Resolve blocking findings before proceeding.'
      : receipt.recommendation === 'WARN'
        ? 'Review warnings and obtain required approval before proceeding.'
        : 'Proceed to human approval using the normal Agentia workflow.',
  )

  await writeFile(
    'release-plan.md',
    lines.join('\n') + '\n',
    'utf8',
  )
}