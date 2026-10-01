import { execa } from 'execa'

export interface GitEvidence {
  branch: string
  base: string
  changedFiles: string[]
  additions: number
  deletions: number
  clean: boolean
}

export async function collectGitEvidence(base = 'main'): Promise<GitEvidence> {
  const branch = (await execa('git', ['branch', '--show-current'])).stdout.trim()

  const status = await execa('git', ['status', '--porcelain'])
  const changedFiles = status.stdout
    .split('\n')
    .map(line => line.slice(3).trim())
    .filter(Boolean)

  const diff = await execa('git', ['diff', '--numstat', `${base}...HEAD`])

  let additions = 0
  let deletions = 0

  for (const line of diff.stdout.split('\n').filter(Boolean)) {
    const [added, deleted] = line.split('\t')
    additions += Number(added) || 0
    deletions += Number(deleted) || 0
  }

  return {
    branch,
    base,
    changedFiles,
    additions,
    deletions,
    clean: changedFiles.length === 0,
  }
}