import { describe, expect, it } from "vitest";
import {
  evaluatePolicy,
  getRecommendation,
  type ApprovalEvidence,
  type Policy,
  type ValidationEvidence,
} from "./policy.js";
import type { GitEvidence } from "./git.js";
import type { WorkflowEvidence } from "./workflow.js";

const policy: Policy = {
  requireCleanWorkingTree: true,
  requireWorkflowEvidence: true,
  requireValidationEvidence: true,
  requireHumanApproval: true,
  maxChangedFiles: 5,
};

const cleanGit: GitEvidence = {
  branch: "feature/release",
  base: "main",
  changedFiles: ["src/app.ts"],
  additions: 10,
  deletions: 2,
  clean: true,
};

const passedWorkflow: WorkflowEvidence = {
  status: "passed",
  name: "Agentia CI/CD validation",
  checks: [
    {
      name: "Workflow validation",
      status: "passed",
    },
    {
      name: "Quality gate",
      status: "passed",
    },
  ],
};

const passedValidation: ValidationEvidence = {
  status: "passed",
  checks: [
    {
      name: "TypeScript build",
      status: "passed",
    },
    {
      name: "Unit tests",
      status: "passed",
    },
  ],
};

const approved: ApprovalEvidence = {
  status: "approved",
};

describe("evaluatePolicy", () => {
  it("blocks a dirty working tree", () => {
    const git = {
      ...cleanGit,
      clean: false,
    };

    const risks = evaluatePolicy(policy, git, {
      workflow: passedWorkflow,
      validation: passedValidation,
      approval: approved,
    });

    expect(risks.some((risk) => risk.id === "WORKTREE_DIRTY")).toBe(true);
    expect(getRecommendation(risks)).toBe("BLOCK");
  });

  it("blocks when workflow evidence is missing", () => {
    const workflow: WorkflowEvidence = {
      status: "unknown",
      name: "Agentia CI/CD validation",
      checks: [],
    };

    const risks = evaluatePolicy(policy, cleanGit, {
      workflow,
      validation: passedValidation,
      approval: approved,
    });

    expect(risks.some((risk) => risk.id === "WORKFLOW_EVIDENCE_MISSING")).toBe(
      true,
    );

    expect(getRecommendation(risks)).toBe("BLOCK");
  });

  it("blocks when workflow has failed", () => {
    const workflow: WorkflowEvidence = {
      status: "failed",
      name: "Agentia CI/CD validation",
      checks: [
        {
          name: "Quality gate",
          status: "failed",
        },
      ],
    };

    const risks = evaluatePolicy(policy, cleanGit, {
      workflow,
      validation: passedValidation,
      approval: approved,
    });

    expect(risks.some((risk) => risk.id === "WORKFLOW_FAILED")).toBe(true);
    expect(getRecommendation(risks)).toBe("BLOCK");
  });

  it("blocks when validation evidence is missing", () => {
    const validation: ValidationEvidence = {
      status: "unknown",
      checks: [],
    };

    const risks = evaluatePolicy(policy, cleanGit, {
      workflow: passedWorkflow,
      validation,
      approval: approved,
    });

    expect(risks.some((risk) => risk.id === "VALIDATION_MISSING")).toBe(true);
    expect(getRecommendation(risks)).toBe("BLOCK");
  });

  it("blocks when validation has failed", () => {
    const validation: ValidationEvidence = {
      status: "failed",
      checks: [
        {
          name: "Unit tests",
          status: "failed",
        },
      ],
    };

    const risks = evaluatePolicy(policy, cleanGit, {
      workflow: passedWorkflow,
      validation,
      approval: approved,
    });

    expect(risks.some((risk) => risk.id === "VALIDATION_FAILED")).toBe(true);
    expect(getRecommendation(risks)).toBe("BLOCK");
  });

  it("warns when human approval is still pending", () => {
    const approval: ApprovalEvidence = {
      status: "pending",
    };

    const risks = evaluatePolicy(policy, cleanGit, {
      workflow: passedWorkflow,
      validation: passedValidation,
      approval,
    });

    expect(risks.some((risk) => risk.id === "HUMAN_APPROVAL_REQUIRED")).toBe(
      true,
    );

    expect(getRecommendation(risks)).toBe("WARN");
  });

  it("warns when the change set exceeds the configured limit", () => {
    const git = {
      ...cleanGit,
      changedFiles: [
        "src/a.ts",
        "src/b.ts",
        "src/c.ts",
        "src/d.ts",
        "src/e.ts",
        "src/f.ts",
      ],
    };

    const risks = evaluatePolicy(policy, git, {
      workflow: passedWorkflow,
      validation: passedValidation,
      approval: approved,
    });

    expect(risks.some((risk) => risk.id === "CHANGESET_TOO_LARGE")).toBe(true);
    expect(getRecommendation(risks)).toBe("WARN");
  });

  it("returns READY when all configured requirements are satisfied", () => {
    const risks = evaluatePolicy(policy, cleanGit, {
      workflow: passedWorkflow,
      validation: passedValidation,
      approval: approved,
    });

    expect(risks).toHaveLength(0);
    expect(getRecommendation(risks)).toBe("READY");
  });

  it("blocks when an individual workflow check failed despite an overall passed status", () => {
    const inconsistentWorkflow: WorkflowEvidence = {
      status: "passed",
      name: "Agentia CI/CD validation",
      checks: [
        {
          name: "Quality gate",
          status: "failed",
        },
      ],
    };

    const risks = evaluatePolicy(policy, cleanGit, {
      workflow: inconsistentWorkflow,
      validation: passedValidation,
      approval: approved,
    });

    expect(risks.some((risk) => risk.id === "WORKFLOW_CHECK_FAILED")).toBe(
      true,
    );

    expect(getRecommendation(risks)).toBe("BLOCK");
  });

  it("blocks when an individual validation check is unverified despite an overall passed status", () => {
    const inconsistentValidation: ValidationEvidence = {
      status: "passed",
      checks: [
        {
          name: "Unit tests",
          status: "unknown",
        },
      ],
    };

    const risks = evaluatePolicy(policy, cleanGit, {
      workflow: passedWorkflow,
      validation: inconsistentValidation,
      approval: approved,
    });

    expect(
      risks.some((risk) => risk.id === "VALIDATION_CHECK_UNVERIFIED"),
    ).toBe(true);

    expect(getRecommendation(risks)).toBe("BLOCK");
  });
});
