import { Args, Command, Flags } from '@oclif/core'
import { buildTestChecklist } from '../../core/checklist.js'
import { collectGitEvidence } from '../../core/git.js'
import {
  evaluatePolicy,
  getRecommendation,
  loadEvidence,
  loadPolicy,
} from '../../core/policy.js'
import { writeReceipt } from '../../core/receipt.js'
import { buildSummary } from '../../core/summary.js'

export default class PreflightAnalyze extends Command {
  static override description = 'Assess release readiness for an Agentia workflow'

  static override args = {
    base: Args.string({
      description: 'Base branch to compare against',
      required: false,
    }),
  }

  static override flags = {
    base: Flags.string({
      char: 'b',
      description: 'Base branch to compare against',
      default: 'main',
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(PreflightAnalyze)

    const git = await collectGitEvidence(flags.base)
    const policy = await loadPolicy()
    const evidence = await loadEvidence()

    const risks = evaluatePolicy(policy, git, evidence)
    const recommendation = getRecommendation(risks)
    const summary = buildSummary(recommendation, risks)
    const testChecklist = buildTestChecklist(
      evidence.workflow,
      evidence.validation,
    )

    await writeReceipt({
      generatedAt: new Date().toISOString(),
      recommendation,
      git,
      workflow: evidence.workflow,
      validation: evidence.validation,
      approval: evidence.approval,
      testChecklist,
      risks,
      policy,
    })

    this.log('Agentia Preflight')
    this.log('-----------------')
    this.log(`Recommendation: ${recommendation}`)
    this.log(`Branch: ${git.branch}`)
    this.log(`Base: ${git.base}`)
    this.log(`Working tree: ${git.clean ? 'CLEAN' : 'CHANGED'}`)
    this.log(`Changed files: ${git.changedFiles.length}`)
    this.log(`Additions: ${git.additions}`)
    this.log(`Deletions: ${git.deletions}`)

    this.log('\nAgentia Workflow')
    this.log(`Name: ${evidence.workflow.name}`)
    this.log(`Status: ${evidence.workflow.status}`)

    if (evidence.workflow.checks.length === 0) {
      this.log('Checks: none')
    } else {
      for (const check of evidence.workflow.checks) {
        this.log(`- ${check.name}: ${check.status}`)
      }
    }

    this.log('\nValidation')
    this.log(`Status: ${evidence.validation.status}`)

    for (const check of evidence.validation.checks) {
      this.log(`- ${check.name}: ${check.status}`)
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
    this.log('- release-plan.md')
    this.log('- evidence.json')
  }
}