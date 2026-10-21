import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execa } from 'execa'
import type { ValidationEvidence } from './policy.js'

export type LocalScriptName = 'build' | 'test'

export type LocalScriptRunner = (
  script: LocalScriptName,
  cwd: string,
) => Promise<void>

interface LocalValidationOptions {
  cwd?: string
  runScript?: LocalScriptRunner
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function getExitCode(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined
  }

  return typeof error.exitCode === 'number'
    ? error.exitCode
    : undefined
}

async function executeNpmScript(
  script: LocalScriptName,
  cwd: string,
): Promise<void> {
  await execa('npm', ['run', script], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function unavailableEvidence(
  reason: string,
): ValidationEvidence {
  return {
    status: 'unknown',
    provenance: 'unavailable',
    checks: [
      {
        name: `npm run build (${reason})`,
        status: 'unknown',
      },
      {
        name: `npm run test (${reason})`,
        status: 'unknown',
      },
    ],
  }
}

/**
 * Executes the project's configured build and test scripts.
 *
 * Only these named scripts are invoked. Their configured commands
 * are defined by the project in package.json.
 *
 * The caller must explicitly request local validation.
 */
export async function collectLocalValidationEvidence(
  options: LocalValidationOptions = {},
): Promise<ValidationEvidence> {
  const cwd = options.cwd ?? process.cwd()
  const runScript = options.runScript ?? executeNpmScript

  let manifest: unknown

  try {
    const content = await readFile(
      join(cwd, 'package.json'),
      'utf8',
    )

    manifest = JSON.parse(content)
  } catch {
    return unavailableEvidence('package.json unavailable')
  }

  if (!isRecord(manifest) || !isRecord(manifest.scripts)) {
    return unavailableEvidence(
      'package.json scripts unavailable',
    )
  }

  const scripts = manifest.scripts
  const requiredScripts: LocalScriptName[] = [
    'build',
    'test',
  ]

  const checks: ValidationEvidence['checks'] = []
  let executedCount = 0

  for (const script of requiredScripts) {
    const command = `npm run ${script}`
    const configuredScript = scripts[script]

    if (
      typeof configuredScript !== 'string' ||
      configuredScript.trim().length === 0
    ) {
      checks.push({
        name: `${command} (script not configured)`,
        status: 'unknown',
      })

      continue
    }

    try {
      await runScript(script, cwd)

      executedCount += 1

      checks.push({
        name: command,
        status: 'passed',
      })
    } catch (error) {
      const exitCode = getExitCode(error)

      if (exitCode !== undefined) {
        executedCount += 1

        checks.push({
          name: command,
          status: 'failed',
        })
      } else {
        checks.push({
          name: `${command} (could not execute)`,
          status: 'unknown',
        })
      }
    }
  }

  const status = checks.some(check => check.status === 'failed')
    ? 'failed'
    : checks.some(check => check.status === 'unknown')
      ? 'unknown'
      : 'passed'

  return {
    status,
    provenance:
      executedCount > 0
        ? 'local-execution'
        : 'unavailable',
    checks,
  }
}