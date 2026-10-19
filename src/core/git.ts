import { execa } from 'execa'

export interface GitEvidence {
  branch: string
  base: string
  changedFiles: string[]
  additions: number
  deletions: number
  clean: boolean
}

export async function collectGitEvidence(
  base = 'main',
): Promise<GitEvidence> {
  const branch = (
    await execa('git', ['branch', '--show-current'])
  ).stdout.trim()

  const status = await execa('git', ['status', '--porcelain'])

  // Compare the working tree against the base branch, including
  // committed, staged, and unstaged changes to tracked files.
  const diff = await execa('git', ['diff', '--numstat', base])
  const changedTrackedFiles = await execa(
    'git',
    ['diff', '--name-only', base],
  )

  // Include untracked files in the changed-file inventory.
  const untracked = await execa(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
  )

  const changedFiles = [
    ...new Set(
      [
        ...changedTrackedFiles.stdout.split('\n'),
        ...untracked.stdout.split('\n'),
      ].filter(Boolean),
    ),
  ].sort()

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
    clean: status.stdout.length === 0,
  }
}