import { Args, Command } from "@oclif/core";

const explanations: Record<string, string> = {
  WORKTREE_DIRTY:
    "Preflight detected uncommitted local changes. A release assessment should use a known, reproducible Git state.",

  WORKFLOW_EVIDENCE_MISSING:
    "Preflight could not establish that the Agentia workflow produced the required evidence. Provide the available workflow result before assessing release readiness.",

  WORKFLOW_FAILED:
    "The provided Agentia workflow evidence reports a failed workflow. Resolve the failing workflow checks before proceeding.",

  VALIDATION_MISSING:
    "Required validation evidence was not provided. Preflight cannot establish that the change passed its required checks.",

  VALIDATION_FAILED:
    "At least one required validation check failed. The release should not proceed until the failing check is resolved.",

  HUMAN_APPROVAL_REQUIRED:
    "The configured policy requires explicit human approval before promotion or release.",

  CHANGESET_TOO_LARGE:
    "The change set exceeds the configured file-count threshold and should receive additional review.",

  WORKFLOW_CHECK_FAILED:
    "An individual Agentia workflow check failed. Resolve the reported failure before proceeding.",

  WORKFLOW_CHECK_UNVERIFIED:
    "An individual Agentia workflow check has no confirmed result. Obtain evidence that the check passed or resolve its failure.",

  VALIDATION_CHECK_FAILED:
    "An individual validation check failed. Fix the reported issue and rerun the required validation.",

  VALIDATION_CHECK_UNVERIFIED:
    "An individual validation check has no confirmed result. Run the check and provide its result before proceeding.",
};

export default class PreflightExplain extends Command {
  static override description = "Explain a Preflight risk finding";

  static override args = {
    "risk-id": Args.string({
      description: "Risk identifier to explain",
      required: true,
    }),
  };

  public async run(): Promise<void> {
    const { args } = await this.parse(PreflightExplain);
    const riskId = args["risk-id"].toUpperCase();

    const explanation = explanations[riskId];

    if (!explanation) {
      this.error(`Unknown risk: ${riskId}`);
    }

    this.log(`Risk: ${riskId}`);
    this.log(`Explanation: ${explanation}`);
  }
}
