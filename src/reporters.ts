import pc from "picocolors";

import type { ScanMemory, ScanResult } from "./scan.js";
import type { WorkspaceTarget } from "./workspaceFinder.js";

export const SUPPORTED_REPORTERS = ["text", "json"] as const;

export type ReporterType = (typeof SUPPORTED_REPORTERS)[number];
export type FindingType =
  | "missing"
  | "unused-dependencies"
  | "unused-devDependencies"
  | "misplaced-devDependencies"
  | "unused-files"
  | "unused-exports";

export interface ActiveFinding {
  type: FindingType;
  title: string;
  items: string[];
}

export interface ReportWorkspace {
  workspace: WorkspaceTarget;
  result: ScanResult;
  findings: ActiveFinding[];
}

export interface RenderReportInput {
  targetDir: string;
  reporter: ReporterType;
  debug: boolean;
  performance: boolean;
  memory: boolean;
  watch: boolean;
  cache: boolean;
  fix: boolean;
  production: boolean;
  strict: boolean;
  include: FindingType[];
  exclude: FindingType[];
  workspaces: ReportWorkspace[];
  trace?: string;
  traceExport?: string;
  aiSummary?: string;
  warnings?: string[];
  configurationHints?: string[];
  configSource?: string;
  rulesSummary?: {
    ignorePackages: string[];
    allowUnusedDependencies: string[];
    allowUnusedDevDependencies: string[];
    allowMissingPackages: string[];
    allowMisplacedDevDependencies: string[];
    preprocessors: {
      packagePatterns: string[];
      filePatterns: string[];
      exportPatterns: string[];
    };
  };
  performanceSummary?: {
    discoverWorkspacesMs: number;
    workspaceScanMs: number;
    aiSummaryMs: number;
    totalMs: number;
  };
  memorySummary?: {
    peak: ScanMemory;
  };
  ai?: {
    provider: string;
    model?: string;
  };
  appliedFixes?: Array<{
    packagePath: string;
    removedDependencies: string[];
    removedDevDependencies: string[];
  }>;
}

export function renderReport(input: RenderReportInput): string {
  if (input.reporter === "json") {
    return JSON.stringify(
      {
        targetDir: input.targetDir,
        mode: {
          debug: input.debug,
          performance: input.performance,
          memory: input.memory,
          watch: input.watch,
          cache: input.cache,
          fix: input.fix,
          production: input.production,
          strict: input.strict,
          include: input.include,
          exclude: input.exclude,
        },
        ai: input.ai ?? null,
        aiSummary: input.aiSummary ?? null,
        warnings: input.warnings ?? [],
        appliedFixes: input.appliedFixes ?? [],
        configurationHints: input.configurationHints ?? [],
        configSource: input.configSource ?? null,
        rulesSummary: input.rulesSummary ?? null,
        performance: input.performance ? input.performanceSummary ?? null : null,
        memory: input.memory ? input.memorySummary ?? null : null,
        workspaces: input.workspaces.map(({ workspace, result, findings }) => ({
          workspace,
          summary: {
            filesScanned: result.files.length,
            externalPackagesUsed: result.externalImports.length,
            findings: findings.reduce((sum, finding) => sum + finding.items.length, 0),
            activePlugins: result.activePlugins,
            scriptCommandPackages: result.scriptCommandPackages,
            scriptEntryFiles: result.scriptEntryFiles,
            cached: result.cached,
          },
          findings,
          externalImports: result.externalImports,
          unusedFiles: result.unusedFiles,
          unusedExports: result.unusedExports,
          performance: input.performance ? result.performance : null,
          memory: input.memory ? result.memory : null,
          traces: input.trace
            ? {
                package: input.trace,
                sources: result.packageTraces[input.trace] ?? [],
              }
            : null,
          exportTrace: input.traceExport
            ? {
                export: input.traceExport,
                sources: result.exportTraces[input.traceExport] ?? [],
              }
            : null,
        })),
      },
      null,
      2,
    );
  }

  const lines: string[] = [];

  lines.push(pc.bold(pc.cyan("Sadrazam Report")));
  lines.push(`Target: ${input.targetDir}`);
  lines.push(`Workspaces: ${input.workspaces.length}`);
  lines.push(`Mode: ${describeMode(input)}`);

  if (input.warnings && input.warnings.length > 0) {
    lines.push("");
    lines.push(pc.yellow("Warnings"));

    for (const warning of input.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (input.appliedFixes && input.appliedFixes.length > 0) {
    lines.push("");
    lines.push(pc.green("Auto-fix"));

    for (const fix of input.appliedFixes) {
      lines.push(`Package: ${fix.packagePath}`);
      if (fix.removedDependencies.length > 0) {
        lines.push(`Removed dependencies: ${fix.removedDependencies.join(", ")}`);
      }
      if (fix.removedDevDependencies.length > 0) {
        lines.push(`Removed devDependencies: ${fix.removedDevDependencies.join(", ")}`);
      }
    }
  }

  if (input.configurationHints && input.configurationHints.length > 0) {
    lines.push("");
    lines.push(pc.yellow("Configuration hints"));

    for (const hint of input.configurationHints) {
      lines.push(`- ${hint}`);
    }
  }

  if (input.performance && input.performanceSummary) {
    lines.push("");
    lines.push(pc.blue("Performance"));
    lines.push(`Discover workspaces: ${formatMs(input.performanceSummary.discoverWorkspacesMs)}`);
    lines.push(`Workspace scans: ${formatMs(input.performanceSummary.workspaceScanMs)}`);
    if (input.ai) {
      lines.push(`AI summary: ${formatMs(input.performanceSummary.aiSummaryMs)}`);
    }
    lines.push(`Total: ${formatMs(input.performanceSummary.totalMs)}`);
  }

  if (input.memory && input.memorySummary) {
    lines.push("");
    lines.push(pc.blue("Memory"));
    lines.push(`Peak heap used: ${formatMb(input.memorySummary.peak.heapUsedMb)}`);
    lines.push(`Peak RSS: ${formatMb(input.memorySummary.peak.rssMb)}`);
  }

  if (input.ai) {
    lines.push("");
    lines.push(pc.magenta("AI mode"));
    lines.push(`Provider: ${input.ai.provider}`);
    lines.push(`Model: ${input.ai.model ?? "default"}`);
    lines.push("Status: configured");
    lines.push(`Summary: ${input.aiSummary ? "generated" : "not available"}`);
  }

  if (input.aiSummary) {
    lines.push("");
    lines.push(pc.magenta("AI summary"));
    lines.push(input.aiSummary);
  }

  for (const { workspace, result, findings } of input.workspaces) {
    const findingCount = findings.reduce((sum, finding) => sum + finding.items.length, 0);

    lines.push("");
    lines.push(pc.bold(`${workspace.name} (${workspace.relativeDir})`));
    lines.push(`Package: ${result.packagePath}`);
    lines.push(`Files scanned: ${result.files.length}`);
    lines.push(`External packages used: ${result.externalImports.length}`);
    lines.push(`Findings: ${findingCount}`);
    if (input.cache) {
      lines.push(`Cache: ${result.cached ? "hit" : "miss"}`);
    }
    if (result.activePlugins.length > 0) {
      lines.push(`Plugins: ${result.activePlugins.join(", ")}`);
    }
    if (result.scriptCommandPackages.length > 0) {
      lines.push(`Script packages: ${result.scriptCommandPackages.join(", ")}`);
    }
    if (input.performance) {
      lines.push(`Scan time: ${formatMs(result.performance.totalMs)}`);
    }
    if (input.memory) {
      lines.push(`Heap used: ${formatMb(result.memory.heapUsedMb)}`);
    }

    if (findingCount === 0) {
      lines.push(pc.green("No dependency issues found."));
    }

    for (const finding of findings) {
      lines.push("");
      lines.push(colorizeFindingTitle(finding.type, finding.title));

      for (const item of finding.items) {
        lines.push(`- ${item}`);
      }
    }

    if (result.externalImports.length > 0) {
      lines.push("");
      lines.push(pc.dim(`External imports: ${result.externalImports.join(", ")}`));
    }

    if (input.trace) {
      lines.push("");
      lines.push(pc.bold(`Trace: ${input.trace}`));

      const traceEntries = result.packageTraces[input.trace] ?? [];

      if (traceEntries.length === 0) {
        lines.push(pc.dim("No trace entries found."));
      } else {
        for (const entry of traceEntries) {
          lines.push(`- ${entry}`);
        }
      }
    }

    if (input.traceExport) {
      lines.push("");
      lines.push(pc.bold(`Export trace: ${input.traceExport}`));

      const traceEntries = result.exportTraces[input.traceExport] ?? [];

      if (traceEntries.length === 0) {
        lines.push(pc.dim("No export trace entries found."));
      } else {
        for (const entry of traceEntries) {
          lines.push(`- ${entry}`);
        }
      }
    }
  }

  if (input.debug) {
    lines.push("");
    lines.push(pc.dim("Debug"));
    lines.push(pc.dim(`Config source: ${input.configSource ?? "defaults"}`));
    lines.push(pc.dim(`Reporter: ${input.reporter}`));
    lines.push(pc.dim(`Include: ${input.include.join(", ") || "-"}`));
    lines.push(pc.dim(`Exclude: ${input.exclude.join(", ") || "-"}`));
    lines.push(pc.dim(`Trace: ${input.trace ?? "-"}`));
    lines.push(pc.dim(`Trace export: ${input.traceExport ?? "-"}`));
    lines.push(pc.dim(`Watch: ${input.watch ? "enabled" : "disabled"}`));
    lines.push(pc.dim(`Cache: ${input.cache ? "enabled" : "disabled"}`));
    lines.push(pc.dim(`Fix: ${input.fix ? "enabled" : "disabled"}`));
    lines.push(pc.dim(`Performance: ${input.performance ? "enabled" : "disabled"}`));
    lines.push(pc.dim(`Memory: ${input.memory ? "enabled" : "disabled"}`));
    if (input.rulesSummary) {
      lines.push(pc.dim(`Ignore packages: ${input.rulesSummary.ignorePackages.join(", ") || "-"}`));
      lines.push(
        pc.dim(
          `Allow unused dependencies: ${input.rulesSummary.allowUnusedDependencies.join(", ") || "-"}`,
        ),
      );
      lines.push(
        pc.dim(
          `Allow unused devDependencies: ${input.rulesSummary.allowUnusedDevDependencies.join(", ") || "-"}`,
        ),
      );
      lines.push(
        pc.dim(
          `Allow missing packages: ${input.rulesSummary.allowMissingPackages.join(", ") || "-"}`,
        ),
      );
      lines.push(
        pc.dim(
          `Allow misplaced devDependencies: ${input.rulesSummary.allowMisplacedDevDependencies.join(", ") || "-"}`,
        ),
      );
      lines.push(
        pc.dim(
          `Preprocessor package patterns: ${input.rulesSummary.preprocessors.packagePatterns.join(", ") || "-"}`
        ),
      );
      lines.push(
        pc.dim(
          `Preprocessor file patterns: ${input.rulesSummary.preprocessors.filePatterns.join(", ") || "-"}`
        ),
      );
      lines.push(
        pc.dim(
          `Preprocessor export patterns: ${input.rulesSummary.preprocessors.exportPatterns.join(", ") || "-"}`
        ),
      );
    }
  }

  return lines.join("\n");
}

function describeMode(input: RenderReportInput): string {
  const enabled = [
    input.production ? "production" : null,
    input.strict ? "strict" : null,
    input.cache ? "cache" : null,
    input.performance ? "performance" : null,
    input.memory ? "memory" : null,
    input.watch ? "watch" : null,
    input.fix ? "fix" : null,
    input.debug ? "debug" : null,
  ].filter(Boolean);

  return enabled.join(", ") || "default";
}

function colorizeFindingTitle(type: FindingType, title: string): string {
  if (type === "missing") {
    return pc.red(title);
  }

  if (type === "misplaced-devDependencies") {
    return pc.red(title);
  }

  if (type === "unused-files" || type === "unused-exports") {
    return pc.yellow(title);
  }

  return pc.yellow(title);
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}

function formatMb(value: number): string {
  return `${value.toFixed(1)} MB`;
}
