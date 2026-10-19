import type { Risk } from './policy.js'

export function buildSummary(
  recommendation: 'READY' | 'WARN' | 'BLOCK',
  risks: Risk[],
): string {
  if (recommendation === 'READY') {
    return 'Release readiness checks passed. The change is ready for human approval.'
  }

  if (recommendation === 'WARN') {
    return `Release readiness checks completed with ${risks.length} warning(s). Review the findings before proceeding.`
  }

  return `Release readiness is blocked by ${risks.filter(risk => risk.severity === 'BLOCK').length} blocking finding(s). Resolve them before proceeding.`
}