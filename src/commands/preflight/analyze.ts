import { Args, Command, Flags } from '@oclif/core'
import { collectGitEvidence } from '../../core/git.js'

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

    const evidence = await collectGitEvidence(flags.base)

    this.log('Agentia Preflight')
    this.log('-----------------')
    this.log(`Branch: ${evidence.branch}`)
    this.log(`Base: ${evidence.base}`)
    this.log(`Working tree: ${evidence.clean ? 'CLEAN' : 'CHANGED'}`)
    this.log(`Changed files: ${evidence.changedFiles.length}`)
    this.log(`Additions: ${evidence.additions}`)
    this.log(`Deletions: ${evidence.deletions}`)
  }
}