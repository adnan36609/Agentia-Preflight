import { writeFile } from 'node:fs/promises'
import { Flags } from '@oclif/core'
import { AgentiaCommand } from '@copado/agentia-plugin-sdk'
import {
  collectAgentiaContext,
  formatCredentialStatus,
} from '../../core/agentia-context.js'
import {
  collectAgentiaJobInspection,
  type AgentiaJobInspection,
} from '../../core/agentia-jobs.js'
import { buildTestChecklist } from '../../core/checklist.js'
import { collectGitEvidence } from '../../core/git.js'
import { collectLocalValidationEvidence } from '../../core/local-validation.js'
import {
  evaluatePolicy,
  getRecommendation,
  loadEvidence,
  loadPolicy,
} from '../../core/policy.js'
import { writeReceipt } from '../../core/receipt.js'
import { buildSummary } from '../../core/summary.js'

export default class PreflightAnalyze extends AgentiaCommand {
  static override description =
    'Assess release readiness for an Agentia workflow'

  static override flags = {
    base: Flags.string({
      char: 'b',
      description: 'Base branch to compare against',
    }),

    'run-validation': Flags.boolean({
      description:
        'Execute local build and test scripts and use their actual results',
      default: false,
    }),

    'inspect-jobs': Flags.boolean({
      description:
        'Read Agentia job, pipeline and promotion summaries; correlations remain inferred',
      default: false,
    }),

    'job-id': Flags.string({
      description:
        'Inspect one Agentia job by ID; implies --inspect-jobs',
    }),
  }

  public async run(): Promise<unknown> {
    const { flags } = await this.parse(PreflightAnalyze)

    const agentiaContext = await collectAgentiaContext()

    const workspaceBase =
      agentiaContext.status === 'available'
        ? agentiaContext.workspace.baseBranch
        : null

    const base = flags.base ?? workspaceBase ?? 'main'

    const git = await collectGitEvidence(base)
    const policy = await loadPolicy()
    const evidence = await loadEvidence()

    const validation = flags['run-validation']
      ? await collectLocalValidationEvidence()
      : evidence.validation

    const shouldInspectJobs =
      flags['inspect-jobs'] || Boolean(flags['job-id'])

    let jobInspection: AgentiaJobInspection | undefined

    if (shouldInspectJobs) {
      jobInspection = await collectAgentiaJobInspection({
        jobId: flags['job-id'],
        workspaceBranch:
          agentiaContext.status === 'available'
            ? agentiaContext.workspace.branch
            : null,
        activeWorkItem:
          agentiaContext.status === 'available'
            ? agentiaContext.workspace.workItemName
            : null,
      })

      await writeFile(
        'agentia-job-inspection.json',
        JSON.stringify(jobInspection, null, 2) + '\n',
        'utf8',
      )
    }

    /*
     * Intentional safeguard:
     * jobInspection is observational evidence and does not replace
     * evidence.workflow. Name-based correlations are not confirmed
     * release relationships and cannot satisfy the current policy.
     */
    const risks = evaluatePolicy(
      policy,
      git,
      {
        workflow: evidence.workflow,
        validation,
        approval: evidence.approval,
      },
      agentiaContext,
    )

    const recommendation = getRecommendation(risks)
    const summary = buildSummary(recommendation, risks)

    const testChecklist = buildTestChecklist(
      evidence.workflow,
      validation,
    )

    const artifacts = [
      'release-plan.md',
      'evidence.json',
      ...(jobInspection ? ['agentia-job-inspection.json'] : []),
    ]

    const result = {
      recommendation,
      summary,
      agentiaContext,
      git,
      workflow: evidence.workflow,
      validation,
      approval: evidence.approval,
      testChecklist,
      jobInspection,
      risks,
      artifacts,
    }

    await writeReceipt({
      generatedAt: new Date().toISOString(),
      recommendation,
      agentiaContext,
      git,
      workflow: evidence.workflow,
      validation,
      approval: evidence.approval,
      testChecklist,
      risks,
      policy,
    })

    this.display(() => {
      this.log('Agentia Preflight')
      this.log('-----------------')
      this.log(`Recommendation: ${recommendation}`)
      this.log(`Branch: ${git.branch}`)
      this.log(`Base: ${git.base}`)
      this.log(
        `Working tree: ${git.clean ? 'CLEAN' : 'CHANGED'}`,
      )
      this.log(`Changed files: ${git.changedFiles.length}`)
      this.log(`Additions: ${git.additions}`)
      this.log(`Deletions: ${git.deletions}`)

      this.log('\nAgentia Context')

      if (agentiaContext.status === 'available') {
        this.log(`Context source: ${agentiaContext.source}`)
        this.log(`CLI version: ${agentiaContext.cliVersion}`)
        this.log(
          `Host API version: ${agentiaContext.hostApiVersion}`,
        )
        this.log(
          `CICD authentication: ${formatCredentialStatus(agentiaContext.authentication.cicd)}`,
        )
        this.log(
          `CRT authentication: ${formatCredentialStatus(agentiaContext.authentication.crt)}`,
        )
        this.log(
          `AI authentication: ${formatCredentialStatus(agentiaContext.authentication.ai)}`,
        )
        this.log(
          `Workspace branch: ${agentiaContext.workspace.branch ?? 'not reported'}`,
        )
        this.log(
          `Workspace base: ${agentiaContext.workspace.baseBranch ?? 'not reported'}`,
        )
        this.log(
          `Active work item: ${agentiaContext.workspace.workItemName ?? 'none reported'}`,
        )
        this.log(
          `Work item title: ${agentiaContext.workspace.workItemTitle ?? 'not reported'}`,
        )
        this.log(
          `Project: ${agentiaContext.workspace.project ?? 'not reported'}`,
        )
        this.log(
          `Environment: ${agentiaContext.workspace.environment ?? 'not reported'}`,
        )
      } else {
        this.log('Context status: UNAVAILABLE')
        this.log(`Reason: ${agentiaContext.error}`)
      }

      this.log('\nAgentia Workflow')
      this.log(`Name: ${evidence.workflow.name}`)
      this.log(`Status: ${evidence.workflow.status}`)
      this.log(
        `Evidence provenance: ${evidence.workflow.provenance ?? 'unavailable'}`,
      )

      if (evidence.workflow.checks.length === 0) {
        this.log('Checks: none')
      } else {
        for (const check of evidence.workflow.checks) {
          this.log(`- ${check.name}: ${check.status}`)
        }
      }

      if (jobInspection) {
        this.displayJobInspection(jobInspection)
      }

      this.log('\nValidation')
      this.log(`Status: ${validation.status}`)
      this.log(
        `Evidence provenance: ${validation.provenance ?? 'unavailable'}`,
      )

      if (validation.checks.length === 0) {
        this.log('Checks: none')
      } else {
        for (const check of validation.checks) {
          this.log(`- ${check.name}: ${check.status}`)
        }
      }

      this.log('\nPrioritized Test Checklist')

      for (const item of testChecklist) {
        this.log(
          `[${item.completed ? 'x' : ' '}] ${item.priority} - ${item.task}`,
        )
      }

      this.log(`\nApproval: ${evidence.approval.status}`)

      this.log(`\n${summary}`)
      this.log('\nRisks')

      if (risks.length === 0) {
        this.log('No policy risks detected.')
      } else {
        for (const risk of risks) {
          this.log(`[${risk.severity}] ${risk.id}: ${risk.title}`)
          this.log(`  ${risk.reason}`)
        }
      }

      this.log('\nArtifacts')

      for (const artifact of artifacts) {
        this.log(`- ${artifact}`)
      }
    })

    return result
  }

  private displayJobInspection(
    inspection: AgentiaJobInspection,
  ): void {
    this.log('\nAgentia Job Inspection')
    this.log(`Inspection status: ${inspection.status}`)
    this.log(`Evidence source: ${inspection.source}`)
    this.log(`Inspected at: ${inspection.inspectedAt}`)
    this.log(
      `Workspace branch: ${inspection.workspaceBranch ?? 'not reported'}`,
    )
    this.log(
      `Active work item: ${inspection.activeWorkItem ?? 'not reported'}`,
    )
    this.log(`Job query: ${inspection.jobsQuery}`)
    this.log(`Pipeline query: ${inspection.pipelineQuery}`)
    this.log(`Promotion query: ${inspection.promotionQuery}`)
    this.log(`Jobs returned: ${inspection.jobs.length}`)

    for (const issue of inspection.issues) {
      this.log(`Inspection issue: ${issue}`)
    }

    if (inspection.jobs.length === 0) {
      this.log('No job records were returned.')
    }

    for (const job of inspection.jobs) {
      this.log('')
      this.log(`Job: ${job.name}`)
      this.log(`Job ID: ${job.id}`)
      this.log(`Raw status: ${job.rawStatus ?? 'not reported'}`)
      this.log(
        `Interpreted status: ${job.interpretedStatus}`,
      )
      this.log(
        `Created: ${job.createdDate ?? 'not reported'}`,
      )

      this.log(
        `Promotion correlation: ${job.correlation.confidence}`,
      )

      for (const promotion of job.correlation.promotionMatches) {
        this.log(`- Promotion: ${promotion.name}`)
        this.log(
          `  Status: ${promotion.status ?? 'not reported'}`,
        )
        this.log(
          `  Pipeline: ${promotion.pipelineName ?? 'not reported'}`,
        )
      }

      if (job.correlation.pipelineMatch) {
        this.log(
          `Matched pipeline: ${job.correlation.pipelineMatch.name}`,
        )
      }

      this.log(
        `Workspace branch relationship: ${job.correlation.workspaceBranchRelation}`,
      )

      for (const basis of job.correlation.basis) {
        this.log(`Correlation basis: ${basis}`)
      }

      if (job.steps.length === 0) {
        this.log('Steps: none reported')
      } else {
        this.log('Steps:')

        for (const step of job.steps) {
          this.log(
            `- ${step.name}: ${step.interpretedStatus} ` +
            `(reported: ${step.rawStatus ?? 'not reported'})`,
          )
        }
      }

      this.log(`Correlation note: ${job.correlation.note}`)
    }

    this.log(
      'Important: job inspection is separate from the verified-workflow policy decision.',
    )
    this.log(
      'Name-based correlations are inferred and do not establish that a job validated the current release.',
    )
  }
}