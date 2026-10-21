import {
  getAgentiaHost,
  type AgentiaPluginHost,
  type HostMethodPath,
  type PluginJob,
  type PluginPipeline,
  type PluginPromotion,
} from '@copado/agentia-plugin-sdk'

export type AgentiaJobStatus =
  | 'passed'
  | 'failed'
  | 'pending'
  | 'unknown'

export type QueryStatus = 'available' | 'unavailable'

export type InspectionStatus =
  | 'available'
  | 'partial'
  | 'unavailable'

export type CorrelationConfidence =
  | 'inferred'
  | 'unmatched'
  | 'ambiguous'

export type WorkspaceBranchRelation =
  | 'matches-workspace'
  | 'differs-from-workspace'
  | 'not-reported'

export type AgentiaJobsHost = Pick<
  AgentiaPluginHost,
  'job' | 'pipeline' | 'promotion'
>

export interface AgentiaJobStepSummary {
  name: string
  type: string | null
  rawStatus: string | null
  interpretedStatus: AgentiaJobStatus
}

export interface AgentiaPromotionMatch {
  id: string
  name: string
  status: string | null
  pipelineName: string | null
  projectName: string | null
}

export interface AgentiaPipelineMatch {
  id: string
  name: string
  mainBranch: string | null
}

export interface AgentiaJobCorrelation {
  confidence: CorrelationConfidence
  basis: string[]
  promotionMatches: AgentiaPromotionMatch[]
  pipelineMatch: AgentiaPipelineMatch | null
  workspaceBranchRelation: WorkspaceBranchRelation
  note: string
}

export interface AgentiaJobSummary {
  id: string
  name: string
  templateName: string | null
  rawStatus: string | null
  interpretedStatus: AgentiaJobStatus
  createdDate: string | null
  lastModifiedDate: string | null
  steps: AgentiaJobStepSummary[]
  correlation: AgentiaJobCorrelation
}

export interface AgentiaJobInspection {
  status: InspectionStatus
  source: 'agentia-host-api'
  inspectedAt: string
  workspaceBranch: string | null
  activeWorkItem: string | null
  jobsQuery: QueryStatus
  pipelineQuery: QueryStatus
  promotionQuery: QueryStatus
  jobs: AgentiaJobSummary[]
  issues: string[]
  note: string
}

export interface CollectAgentiaJobsOptions {
  jobId?: string
  workspaceBranch?: string | null
  activeWorkItem?: string | null
  host?: AgentiaJobsHost
}

const PAGE_SIZE = 100

const BASE_REQUIRED_METHODS: HostMethodPath[] = [
  'job.list',
  'pipeline.list',
  'promotion.list',
]

/**
 * Strict mapping: only explicitly recognized statuses become success
 * or failure. Unrecognized strings are never treated as successful.
 */
export function interpretAgentiaJobStatus(
  rawStatus: string | null | undefined,
): AgentiaJobStatus {
  if (!rawStatus || rawStatus.trim().length === 0) {
    return 'unknown'
  }

  const status = rawStatus
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

  if (status === 'successful' || status === 'success') {
    return 'passed'
  }

  if (
    status === 'error' ||
    status === 'failed' ||
    status === 'aborted'
  ) {
    return 'failed'
  }

  if (
    status === 'in progress' ||
    status === 'pending' ||
    status === 'queued' ||
    status === 'running' ||
    status === 'started' ||
    status === 'processing' ||
    status === 'waiting' ||
    status === 'scheduled' ||
    status === 'enqueued'
  ) {
    return 'pending'
  }

  return 'unknown'
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The Agentia host request failed.'
}

function createUnavailableInspection(
  options: CollectAgentiaJobsOptions,
  error: unknown,
): AgentiaJobInspection {
  return {
    status: 'unavailable',
    source: 'agentia-host-api',
    inspectedAt: new Date().toISOString(),
    workspaceBranch: options.workspaceBranch ?? null,
    activeWorkItem: options.activeWorkItem ?? null,
    jobsQuery: 'unavailable',
    pipelineQuery: 'unavailable',
    promotionQuery: 'unavailable',
    jobs: [],
    issues: [getErrorMessage(error)],
    note:
      'No job results were collected. This inspection does not ' +
      'satisfy the verified-workflow evidence requirement.',
  }
}

function toPromotionMatch(
  promotion: PluginPromotion,
): AgentiaPromotionMatch {
  return {
    id: promotion.id,
    name: promotion.name ?? '(unnamed promotion)',
    status: promotion.status ?? null,
    pipelineName: promotion.pipelineName ?? null,
    projectName: promotion.projectName ?? null,
  }
}

function branchRelation(
  pipeline: PluginPipeline | undefined,
  workspaceBranch: string | null,
): WorkspaceBranchRelation {
  if (!pipeline || !workspaceBranch) {
    return 'not-reported'
  }

  const configuredBranches = [
    pipeline.mainBranch,
    ...(pipeline.connections ?? []).map(
      connection => connection.branch,
    ),
  ].filter(
    (branch): branch is string =>
      typeof branch === 'string' && branch.trim().length > 0,
  )

  if (configuredBranches.length === 0) {
    return 'not-reported'
  }

  const expectedBranch = normalizeName(workspaceBranch)

  return configuredBranches.some(
    branch => normalizeName(branch) === expectedBranch,
  )
    ? 'matches-workspace'
    : 'differs-from-workspace'
}

function correlateJob(
  job: PluginJob,
  promotions: readonly PluginPromotion[],
  pipelines: readonly PluginPipeline[],
  workspaceBranch: string | null,
): AgentiaJobCorrelation {
  const basis: string[] = []

  const jobNames = [
    {
      value: job.name,
      label: 'job name',
    },
    {
      value: job.templateName,
      label: 'job template name',
    },
  ].filter(
    entry => normalizeName(entry.value).length > 0,
  )

  /*
   * Copado confirmed that name matching is currently a best guess.
   * Only compare the available names; do not invent a direct link
   * between a job and a promotion.
   */
  const promotionMatches = promotions.filter(promotion => {
    const promotionName = normalizeName(promotion.name)

    if (!promotionName) {
      return false
    }

    return jobNames.some(
      entry => normalizeName(entry.value) === promotionName,
    )
  })

  for (const promotion of promotionMatches) {
    const matchingJobName = jobNames.find(
      entry =>
        normalizeName(entry.value) ===
        normalizeName(promotion.name),
    )

    if (matchingJobName) {
      basis.push(
        `${matchingJobName.label} matches promotion name "${promotion.name}"`,
      )
    }
  }

  let pipelineMatch: PluginPipeline | undefined

  if (promotionMatches.length === 1) {
    const promotion = promotionMatches[0]

    const matchingPipelines = pipelines.filter(
      pipeline =>
        normalizeName(pipeline.name) !== '' &&
        normalizeName(pipeline.name) ===
          normalizeName(promotion.pipelineName),
    )

    if (matchingPipelines.length === 1) {
      pipelineMatch = matchingPipelines[0]

      basis.push(
        `promotion pipeline name matches pipeline "${pipelineMatch.name}"`,
      )
    } else if (matchingPipelines.length > 1) {
      basis.push(
        'multiple pipelines share the promotion pipeline name',
      )
    } else if (promotion.pipelineName) {
      basis.push(
        `no listed pipeline matched "${promotion.pipelineName}"`,
      )
    }
  }

  const confidence: CorrelationConfidence =
    promotionMatches.length === 0
      ? 'unmatched'
      : promotionMatches.length === 1
        ? 'inferred'
        : 'ambiguous'

  const relation = branchRelation(
    pipelineMatch,
    workspaceBranch,
  )

  if (relation === 'matches-workspace') {
    basis.push(
      'pipeline branch configuration includes the current workspace branch',
    )
  } else if (relation === 'differs-from-workspace') {
    basis.push(
      'pipeline branch configuration does not include the current workspace branch',
    )
  }

  const pipelineSummary: AgentiaPipelineMatch | null =
    pipelineMatch
      ? {
          id: pipelineMatch.id,
          name: pipelineMatch.name ?? '(unnamed pipeline)',
          mainBranch: pipelineMatch.mainBranch ?? null,
        }
      : null

  let note: string

  if (confidence === 'inferred') {
    note =
      'Best-guess name correlation only. The SDK does not expose ' +
      'a direct job-to-promotion relationship, so this must not be ' +
      'treated as confirmed release correlation.'
  } else if (confidence === 'ambiguous') {
    note =
      'Several promotions matched the available job names. ' +
      'The intended promotion could not be identified reliably.'
  } else {
    note =
      'No promotion matched the available job names. The job ' +
      'cannot currently be associated with a target promotion.'
  }

  return {
    confidence,
    basis,
    promotionMatches: promotionMatches.map(toPromotionMatch),
    pipelineMatch: pipelineSummary,
    workspaceBranchRelation: relation,
    note,
  }
}

function toJobSummary(
  job: PluginJob,
  promotions: readonly PluginPromotion[],
  pipelines: readonly PluginPipeline[],
  workspaceBranch: string | null,
): AgentiaJobSummary {
  const steps = (job.steps ?? []).map((step, index) => ({
    name: step.name ?? `Step ${index + 1}`,
    type: step.type ?? null,
    rawStatus: step.status ?? null,
    interpretedStatus: interpretAgentiaJobStatus(step.status),
  }))

  return {
    id: job.id,
    name: job.name ?? '(unnamed job)',
    templateName: job.templateName ?? null,
    rawStatus: job.status ?? null,
    interpretedStatus: interpretAgentiaJobStatus(job.status),
    createdDate: job.createdDate ?? null,
    lastModifiedDate: job.lastModifiedDate ?? null,
    steps,
    correlation: correlateJob(
      job,
      promotions,
      pipelines,
      workspaceBranch,
    ),
  }
}

/**
 * Reads Agentia job, pipeline and promotion summaries through the
 * official host API. It does not fetch logs or call Copado endpoints
 * directly.
 *
 * The returned job statuses are observed API data. Name-based
 * relationships remain inferred and are not used as verified
 * workflow evidence by the current release policy.
 */
export async function collectAgentiaJobInspection(
  options: CollectAgentiaJobsOptions = {},
): Promise<AgentiaJobInspection> {
  let host: AgentiaJobsHost

  try {
    if (options.host) {
      host = options.host
    } else {
      const requiredMethods: HostMethodPath[] = [
        ...BASE_REQUIRED_METHODS,
      ]

      if (options.jobId) {
        requiredMethods.push('job.get')
      }

      host = getAgentiaHost({
        requires: requiredMethods,
      })
    }
  } catch (error) {
    return createUnavailableInspection(options, error)
  }

  const jobRequest: Promise<readonly PluginJob[]> =
    options.jobId
      ? host.job
          .get(options.jobId)
          .then(job => [job] as readonly PluginJob[])
      : host.job.list({ pageSize: PAGE_SIZE })

  const [jobsResult, pipelinesResult, promotionsResult] =
    await Promise.allSettled([
      jobRequest,
      host.pipeline.list({ pageSize: PAGE_SIZE }),
      host.promotion.list({ pageSize: PAGE_SIZE }),
    ])

  const jobsAvailable = jobsResult.status === 'fulfilled'
  const pipelinesAvailable = pipelinesResult.status === 'fulfilled'
  const promotionsAvailable = promotionsResult.status === 'fulfilled'

  const jobs =
    jobsResult.status === 'fulfilled'
      ? jobsResult.value
      : []

  const pipelines =
    pipelinesResult.status === 'fulfilled'
      ? pipelinesResult.value
      : []

  const promotions =
    promotionsResult.status === 'fulfilled'
      ? promotionsResult.value
      : []

  const availableCount = [
    jobsAvailable,
    pipelinesAvailable,
    promotionsAvailable,
  ].filter(Boolean).length

  const issues: string[] = []

  if (!jobsAvailable) {
    issues.push(
      `Job query failed: ${getErrorMessage(jobsResult.reason)}`,
    )
  }

  if (!pipelinesAvailable) {
    issues.push(
      `Pipeline query failed: ${getErrorMessage(pipelinesResult.reason)}`,
    )
  }

  if (!promotionsAvailable) {
    issues.push(
      `Promotion query failed: ${getErrorMessage(promotionsResult.reason)}`,
    )
  }

  const inspectionStatus: InspectionStatus =
    availableCount === 3
      ? 'available'
      : availableCount > 0
        ? 'partial'
        : 'unavailable'

  return {
    status: inspectionStatus,
    source: 'agentia-host-api',
    inspectedAt: new Date().toISOString(),
    workspaceBranch: options.workspaceBranch ?? null,
    activeWorkItem: options.activeWorkItem ?? null,
    jobsQuery: jobsAvailable ? 'available' : 'unavailable',
    pipelineQuery: pipelinesAvailable
      ? 'available'
      : 'unavailable',
    promotionQuery: promotionsAvailable
      ? 'available'
      : 'unavailable',
    jobs: jobs.map(job =>
      toJobSummary(
        job,
        promotions,
        pipelines,
        options.workspaceBranch ?? null,
      ),
    ),
    issues,
    note:
      'Observed job statuses come from the Agentia host API. ' +
      'Job-to-promotion relationships are inferred from names ' +
      'and pipeline configuration. This inspection is separate ' +
      'from the verified-workflow policy decision.',
  }
}