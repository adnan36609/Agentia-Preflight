import { Args } from "@oclif/core";
import { AgentiaCommand } from "@copado/agentia-plugin-sdk";

const explanations: Record<string, string> = {
  AGENTIA_CONTEXT_UNAVAILABLE:
    "Preflight could not retrieve Agentia workspace and authentication context. Review the SDK error and confirm that the command is running in a compatible Agentia CLI environment.",

  WORKSPACE_BRANCH_MISMATCH:
    "The local Git branch differs from the branch reported by the Agentia workspace. Confirm that you are assessing the intended change before proceeding.",

  WORKTREE_DIRTY:
    "Preflight detected uncommitted local changes. A release assessment should use a known, reproducible Git state.",

  WORKFLOW_EVIDENCE_MISSING:
    "Preflight could not establish that the Agentia workflow produced the required evidence. Provide the available workflow result before assessing release readiness.",

  WORKFLOW_EVIDENCE_UNVERIFIED:
    "A workflow result was supplied, but Preflight could not establish that it came from a supported Agentia host API integration. Fixture data and locally supplied workflow results must not be treated as independently verified workflow execution evidence.",

  WORKFLOW_FAILED:
    "The provided Agentia workflow evidence reports a failed workflow. Resolve the failing workflow checks before proceeding.",

  WORKFLOW_CHECK_FAILED:
    "An individual Agentia workflow check failed. Resolve the reported failure before proceeding.",

  WORKFLOW_CHECK_UNVERIFIED:
    "An individual Agentia workflow check has no confirmed result. Obtain evidence that the check passed or resolve its failure.",

  VALIDATION_MISSING:
    "Required validation evidence was not provided. Preflight cannot establish that the change passed its required checks.",

  VALIDATION_FAILED:
    "At least one required validation check failed. The release should not proceed until the failing check is resolved.",

  VALIDATION_CHECK_FAILED:
    "An individual validation check failed. Fix the reported issue and rerun the required validation.",

  VALIDATION_CHECK_UNVERIFIED:
    "An individual validation check has no confirmed result. Run the check and provide its result before proceeding.",

  HUMAN_APPROVAL_REQUIRED:
    "The configured policy requires explicit human approval before promotion or release.",

  CHANGESET_TOO_LARGE:
    "The change set exceeds the configured file-count threshold and should receive additional review.",

  VALIDATION_EVIDENCE_UNVERIFIED:
    "Validation results were supplied or simulated rather than established by an accepted execution source. Run the local validation checks or provide evidence from a supported trusted integration.",
};

export default class PreflightExplain extends AgentiaCommand {
  static override description = "Explain a Preflight risk finding";

  static override args = {
    "risk-id": Args.string({
      description: "Risk identifier to explain",
      required: true,
    }),
  };

  public async run(): Promise<{
    riskId: string;
    explanation: string;
  }> {
    const { args } = await this.parse(PreflightExplain);
    const riskId = args["risk-id"].toUpperCase();
    const explanation = explanations[riskId];

    if (!explanation) {
      this.error(`Unknown risk: ${riskId}`);
    }

    this.display(() => {
      this.log(`Risk: ${riskId}`);
      this.log(`Explanation: ${explanation}`);
    });

    return {
      riskId,
      explanation,
    };
  }
}
