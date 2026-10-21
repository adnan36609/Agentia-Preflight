import {
  getAgentiaHost,
  type PluginAuthStatus,
} from '@copado/agentia-plugin-sdk'

export interface AgentiaWorkspaceSnapshot {
  branch: string | null
  baseBranch: string | null
  workItemId: string | null
  workItemName: string | null
  workItemTitle: string | null
  project: string | null
  environment: string | null
}

export interface AvailableAgentiaContext {
  status: 'available'
  source: 'agentia-plugin-sdk'
  cliVersion: string
  hostApiVersion: number
  authentication: PluginAuthStatus
  workspace: AgentiaWorkspaceSnapshot
}

export interface UnavailableAgentiaContext {
  status: 'unavailable'
  source: 'agentia-plugin-sdk'
  error: string
}

export type AgentiaContextEvidence =
  | AvailableAgentiaContext
  | UnavailableAgentiaContext

export async function collectAgentiaContext(): Promise<AgentiaContextEvidence> {
  try {
    const host = getAgentiaHost({
      requires: ['auth.status', 'workspace.current'],
    })

    const [authentication, workspace] = await Promise.all([
      host.auth.status(),
      host.workspace.current(),
    ])

    return {
      status: 'available',
      source: 'agentia-plugin-sdk',
      cliVersion: host.cliVersion,
      hostApiVersion: host.apiVersion,
      authentication,
      workspace: {
        branch: workspace.branch ?? null,
        baseBranch: workspace.baseBranch ?? null,
        workItemId: workspace.workItemId ?? null,
        workItemName: workspace.workItemName ?? null,
        workItemTitle: workspace.workItemTitle ?? null,
        project: workspace.defaults.project ?? null,
        environment: workspace.defaults.environment ?? null,
      },
    }
  } catch (error) {
    return {
      status: 'unavailable',
      source: 'agentia-plugin-sdk',
      error:
        error instanceof Error
          ? error.message
          : 'Unable to retrieve Agentia context.',
    }
  }
}

export function formatCredentialStatus(status: {
  configured: boolean
  ready?: boolean
  source?: 'global' | 'local'
}): string {
  const configured = status.configured
    ? 'configured'
    : 'not configured'

  const readiness =
    status.ready === undefined
      ? 'readiness not reported'
      : status.ready
        ? 'ready'
        : 'not ready'

  const source = status.source
    ? `; source: ${status.source}`
    : ''

  return `${configured}; ${readiness}${source}`
}