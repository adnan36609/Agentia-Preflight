import { describe, expect, it, vi } from 'vitest'
import type {
  AgentiaPluginHost,
  PluginJob,
  PluginPipeline,
  PluginPromotion,
} from '@copado/agentia-plugin-sdk'
import {
  collectAgentiaJobInspection,
  interpretAgentiaJobStatus,
  type AgentiaJobsHost,
} from './agentia-jobs.js'

const successfulJob: PluginJob = {
  id: 'job-1',
  name: 'Release Promotion 42',
  templateName: 'Deployment',
  status: 'Successful',
  createdDate: '2026-10-21T10:00:00Z',
  steps: [
    {
      name: 'Validate',
      type: 'validation',
      status: 'Successful',
    },
    {
      name: 'Deploy',
      type: 'deployment',
      status: 'In Progress',
    },
  ],
}

const pipeline: PluginPipeline = {
  id: 'pipeline-1',
  name: 'Production Pipeline',
  mainBranch: 'main',
  connections: [
    {
      branch: 'main',
      sourceEnvironment: {
        id: 'env-dev',
        name: 'Development',
      },
      destinationEnvironment: {
        id: 'env-prod',
        name: 'Production',
      },
    },
  ],
}

const promotion: PluginPromotion = {
  id: 'promotion-1',
  name: 'Release Promotion 42',
  status: 'Successful',
  pipelineName: 'Production Pipeline',
  projectName: 'Demo Project',
}

function createHost(
  overrides: Partial<{
    jobs: readonly PluginJob[]
    pipelines: readonly PluginPipeline[]
    promotions: readonly PluginPromotion[]
    jobListError: Error
    pipelineListError: Error
    promotionListError: Error
  }> = {},
): AgentiaJobsHost {
  const jobs = overrides.jobs ?? [successfulJob]
  const pipelines = overrides.pipelines ?? [pipeline]
  const promotions = overrides.promotions ?? [promotion]

  const host = {
    job: {
      list: vi.fn(async () => {
        if (overrides.jobListError) {
          throw overrides.jobListError
        }

        return jobs
      }),
      get: vi.fn(async (id: string) => {
        const found = jobs.find(job => job.id === id)

        if (!found) {
          throw new Error('Job not found')
        }

        return found
      }),
    },
    pipeline: {
      list: vi.fn(async () => {
        if (overrides.pipelineListError) {
          throw overrides.pipelineListError
        }

        return pipelines
      }),
      get: vi.fn(async (id: string) => {
        const found = pipelines.find(item => item.id === id)

        if (!found) {
          throw new Error('Pipeline not found')
        }

        return found
      }),
    },
    promotion: {
      list: vi.fn(async () => {
        if (overrides.promotionListError) {
          throw overrides.promotionListError
        }

        return promotions
      }),
      get: vi.fn(async (id: string) => {
        const found = promotions.find(item => item.id === id)

        if (!found) {
          throw new Error('Promotion not found')
        }

        return found
      }),
    },
  } satisfies AgentiaJobsHost

  return host
}

describe('interpretAgentiaJobStatus', () => {
  it.each([
    ['Successful', 'passed'],
    ['SUCCESSFUL', 'passed'],
    ['success', 'passed'],
    ['Error', 'failed'],
    ['Failed', 'failed'],
    ['ABORTED', 'failed'],
    ['In Progress', 'pending'],
    ['in_progress', 'pending'],
    ['Queued', 'pending'],
    ['Running', 'pending'],
    ['Pending', 'pending'],
    ['Completed', 'unknown'],
    ['Cancelled', 'unknown'],
    ['', 'unknown'],
    [undefined, 'unknown'],
  ] as const)(
    'interprets %s as %s',
    (raw, expected) => {
      expect(interpretAgentiaJobStatus(raw)).toBe(expected)
    },
  )
})

describe('collectAgentiaJobInspection', () => {
  it('collects actual job summaries and labels name correlation as inferred', async () => {
    const host = createHost()

    const result = await collectAgentiaJobInspection({
      host,
      workspaceBranch: 'main',
      activeWorkItem: 'US-0000042',
    })

    expect(result.status).toBe('available')
    expect(result.source).toBe('agentia-host-api')
    expect(result.jobs).toHaveLength(1)

    const job = result.jobs[0]

    expect(job.rawStatus).toBe('Successful')
    expect(job.interpretedStatus).toBe('passed')

    expect(job.correlation.confidence).toBe('inferred')
    expect(job.correlation.promotionMatches).toHaveLength(1)
    expect(job.correlation.pipelineMatch?.name).toBe(
      'Production Pipeline',
    )

    expect(job.correlation.workspaceBranchRelation).toBe(
      'matches-workspace',
    )

    expect(job.correlation.note).toContain('Best-guess')
  })

  it('does not treat unknown job statuses as successful', async () => {
    const unknownJob: PluginJob = {
      ...successfulJob,
      status: 'Completed',
    }

    const host = createHost({
      jobs: [unknownJob],
    })

    const result = await collectAgentiaJobInspection({
      host,
      workspaceBranch: 'main',
    })

    expect(result.jobs[0].interpretedStatus).toBe('unknown')
  })

  it('reports unmatched jobs without inventing a promotion relationship', async () => {
    const host = createHost({
      jobs: [
        {
          id: 'job-unmatched',
          name: 'Unrelated Job',
          status: 'Successful',
        },
      ],
    })

    const result = await collectAgentiaJobInspection({
      host,
      workspaceBranch: 'main',
    })

    const job = result.jobs[0]

    expect(job.correlation.confidence).toBe('unmatched')
    expect(job.correlation.promotionMatches).toHaveLength(0)
    expect(job.correlation.pipelineMatch).toBeNull()
  })

  it('marks multiple promotion matches as ambiguous', async () => {
    const host = createHost({
      promotions: [
        promotion,
        {
          ...promotion,
          id: 'promotion-2',
        },
      ],
    })

    const result = await collectAgentiaJobInspection({
      host,
      workspaceBranch: 'main',
    })

    expect(result.jobs[0].correlation.confidence).toBe(
      'ambiguous',
    )
  })

  it('recognizes a branch mismatch in the matched pipeline configuration', async () => {
    const host = createHost({
      pipelines: [
        {
          ...pipeline,
          mainBranch: 'release',
          connections: [{ branch: 'release' }],
        },
      ],
    })

    const result = await collectAgentiaJobInspection({
      host,
      workspaceBranch: 'main',
    })

    expect(
      result.jobs[0].correlation.workspaceBranchRelation,
    ).toBe('differs-from-workspace')
  })

  it('uses get when a specific job ID is provided', async () => {
    const host = createHost()

    const result = await collectAgentiaJobInspection({
      host,
      jobId: 'job-1',
      workspaceBranch: 'main',
    })

    expect(host.job.get).toHaveBeenCalledWith('job-1')
    expect(host.job.list).not.toHaveBeenCalled()
    expect(result.jobs).toHaveLength(1)
  })

  it('returns partial results when a supporting API fails', async () => {
    const host = createHost({
      pipelineListError: new Error('Pipeline API unavailable'),
    })

    const result = await collectAgentiaJobInspection({
      host,
      workspaceBranch: 'main',
    })

    expect(result.status).toBe('partial')
    expect(result.jobsQuery).toBe('available')
    expect(result.pipelineQuery).toBe('unavailable')
    expect(result.promotionQuery).toBe('available')
    expect(result.issues).toHaveLength(1)
  })

  it('returns unavailable when all API queries fail', async () => {
    const host = createHost({
      jobListError: new Error('Jobs unavailable'),
      pipelineListError: new Error('Pipelines unavailable'),
      promotionListError: new Error('Promotions unavailable'),
    })

    const result = await collectAgentiaJobInspection({
      host,
    })

    expect(result.status).toBe('unavailable')
    expect(result.jobs).toHaveLength(0)
    expect(result.issues).toHaveLength(3)
  })
})