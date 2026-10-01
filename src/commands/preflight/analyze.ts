import { Args, Command, Flags } from '@oclif/core'
import { collectGitEvidence } from '../../core/git.js'
import {
  evaluatePolicy,
  getRecommendation,
  loadPolicy,
} from '../../core/policy.js'

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
    const risks = evaluatePolicy(policy, git)
    const recommendation = getRecommendation(risks)

    this.log('Agentia Preflight')
    this.log('-----------------')
    this.log(`Recommendation: ${recommendation}`)
    this.log(`Branch: ${git.branch}`)
    this.log(`Base: ${git.base}`)
    this.log(`Working tree: ${git.clean ? 'CLEAN' : 'CHANGED'}`)
    this.log(`Changed files: ${git.changedFiles.length}`)
    this.log(`Additions: ${git.additions}`)
    this.log(`Deletions: ${git.deletions}`)

    this.log('\nRisks')

    if (risks.length === 0) {
      this.log('No policy risks detected.')
      return
    }

    for (const risk of risks) {
      this.log(`[${risk.severity}] ${risk.id}: ${risk.title}`)
      this.log(`  ${risk.reason}`)
    }
  }
}