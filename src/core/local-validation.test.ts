import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectLocalValidationEvidence,
  type LocalScriptRunner,
} from './local-validation.js'

describe('collectLocalValidationEvidence', () => {
  let temporaryDirectory: string | undefined

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      })

      temporaryDirectory = undefined
    }
  })

  async function createProject(
    scripts: Record<string, string>,
  ): Promise<string> {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'agentia-preflight-validation-'),
    )

    await writeFile(
      join(temporaryDirectory, 'package.json'),
      JSON.stringify({
        name: 'validation-test-project',
        scripts,
      }),
      'utf8',
    )

    return temporaryDirectory
  }

  it('reports successful execution of both scripts', async () => {
    const cwd = await createProject({
      build: 'tsc -b',
      test: 'vitest run',
    })

    const executed: string[] = []

    const runner: LocalScriptRunner = async script => {
      executed.push(script)
    }

    const result = await collectLocalValidationEvidence({
      cwd,
      runScript: runner,
    })

    expect(executed).toEqual(['build', 'test'])
    expect(result.status).toBe('passed')
    expect(result.provenance).toBe('local-execution')
    expect(result.checks).toEqual([
      { name: 'npm run build', status: 'passed' },
      { name: 'npm run test', status: 'passed' },
    ])
  })

  it('reports a non-zero test exit as a failure', async () => {
    const cwd = await createProject({
      build: 'tsc -b',
      test: 'vitest run',
    })

    const runner: LocalScriptRunner = async script => {
      if (script === 'test') {
        throw Object.assign(
          new Error('Tests failed'),
          { exitCode: 1 },
        )
      }
    }

    const result = await collectLocalValidationEvidence({
      cwd,
      runScript: runner,
    })

    expect(result.status).toBe('failed')
    expect(result.provenance).toBe('local-execution')
    expect(result.checks).toEqual([
      { name: 'npm run build', status: 'passed' },
      { name: 'npm run test', status: 'failed' },
    ])
  })

  it('does not report a missing script as passed', async () => {
    const cwd = await createProject({
      build: 'tsc -b',
    })

    const executed: string[] = []

    const runner: LocalScriptRunner = async script => {
      executed.push(script)
    }

    const result = await collectLocalValidationEvidence({
      cwd,
      runScript: runner,
    })

    expect(executed).toEqual(['build'])
    expect(result.status).toBe('unknown')
    expect(result.provenance).toBe('local-execution')
    expect(result.checks[0].status).toBe('passed')
    expect(result.checks[1].status).toBe('unknown')
    expect(result.checks[1].name).toContain(
      'script not configured',
    )
  })

  it('reports unavailable evidence when package.json is missing', async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'agentia-preflight-validation-'),
    )

    let runnerCalled = false

    const runner: LocalScriptRunner = async () => {
      runnerCalled = true
    }

    const result = await collectLocalValidationEvidence({
      cwd: temporaryDirectory,
      runScript: runner,
    })

    expect(runnerCalled).toBe(false)
    expect(result.status).toBe('unknown')
    expect(result.provenance).toBe('unavailable')
    expect(result.checks.every(
      check => check.status === 'unknown',
    )).toBe(true)
  })
})