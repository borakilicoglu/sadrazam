#!/usr/bin/env node

import { performance as nodePerformance } from "node:perf_hooks";
import path from "node:path";

import pc from "picocolors";
import { Command } from "commander";

import { generateAiSummary } from "./aiClient.js";
import { resolveAiConfig, SUPPORTED_AI_PROVIDERS } from "./aiConfig.js";
import { getConfigurationHints } from "./configHints.js";
import { loadSadrazamConfig, type SadrazamConfig } from "./config.js";
import { getActiveFindings, type FindingRules } from "./findings.js";
import {
  renderReport,
  SUPPORTED_REPORTERS,
  type FindingType,
  type ReporterType,
} from "./reporters.js";
import { scanProject } from "./scan.js";
import { discoverWorkspaces } from "./workspaceFinder.js";

const program = new Command();

const SUPPORTED_FINDING_TYPES: FindingType[] = [
  "missing",
  "unused-dependencies",
  "unused-devDependencies",
  "misplaced-devDependencies",
  "unused-files",
  "unused-exports",
];

program
  .name("sadrazam")
  .description("Analyze dependency usage, detect hygiene issues, and trace why packages are used.")
  .argument("[target]", "directory to scan", ".")
  .option("--ai", "enable AI-assisted analysis")
  .option("--provider <provider>", `AI provider (${SUPPORTED_AI_PROVIDERS.join(", ")})`)
  .option("--model <model>", "AI model name")
  .option("--reporter <type>", `reporter (${SUPPORTED_REPORTERS.join(", ")})`)
  .option("--include <types>", "comma-separated finding types to include")
  .option("--exclude <types>", "comma-separated finding types to exclude")
  .option("--workspace <names>", "comma-separated workspace filters")
  .option("--production", "scan production files only")
  .option("--strict", "flag devDependencies used in production files")
  .option("--debug", "print resolved debug information")
  .option("--performance", "print performance timing information")
  .option("--cache", "reuse scan results when source inputs have not changed")
  .option("--trace <package>", "trace where a package is used")
  .option("--ignore-packages <names>", "comma-separated package names to ignore in findings")
  .option("--allow-unused-dependencies <names>", "comma-separated dependency allowlist")
  .option("--allow-unused-dev-dependencies <names>", "comma-separated devDependency allowlist")
  .option("--allow-missing-packages <names>", "comma-separated missing package allowlist")
  .option("--allow-misplaced-dev-dependencies <names>", "comma-separated misplaced devDependency allowlist")
  .addHelpText(
    "after",
    `
Examples:
  sadrazam .
  sadrazam . --reporter json
  sadrazam . --trace typescript
  sadrazam . --cache --performance
  sadrazam . --workspace packages/web
  sadrazam . --production --strict
  AI_PROVIDER=openai AI_TOKEN=... sadrazam . --ai
`,
  )
  .action(async (target, options) => {
    try {
      const totalStart = nodePerformance.now();
      const targetDir = path.resolve(target);
      const loadedConfig = await loadSadrazamConfig(targetDir);
      const mergedOptions = mergeCliWithConfig(options, loadedConfig.config);
      const aiConfig = resolveAiConfig({
        ai: mergedOptions.ai,
        provider: mergedOptions.provider,
        model: mergedOptions.model,
        configAi: loadedConfig.config.ai,
      });
      const reporter = parseReporter(mergedOptions.reporter);
      const include = parseFindingTypes(mergedOptions.include);
      const exclude = parseFindingTypes(mergedOptions.exclude);
      const workspaceFilters = parseCsvOption(mergedOptions.workspace);
      const rules = buildFindingRules(mergedOptions, include, exclude);

      const discoverStart = nodePerformance.now();
      const { rootDir, workspaces } = await discoverWorkspaces(targetDir, workspaceFilters);
      const discoverWorkspacesMs = nodePerformance.now() - discoverStart;

      const workspaceReports = await Promise.all(
        workspaces.map(async (workspace) => {
          const result = await scanProject(workspace.dir, {
            production: Boolean(mergedOptions.production),
            strict: Boolean(mergedOptions.strict),
            cache: Boolean(mergedOptions.cache),
          });
          const findings = getActiveFindings(result, rules, Boolean(mergedOptions.production));

          return {
            workspace,
            result,
            findings,
          };
        }),
      );
      const warnings: string[] = [];
      let aiSummary: string | undefined;
      let aiSummaryMs = 0;

      if (aiConfig) {
        const aiStart = nodePerformance.now();
        try {
          aiSummary = await generateAiSummary(aiConfig, workspaceReports);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`AI summary unavailable: ${message}`);
        }
        aiSummaryMs = nodePerformance.now() - aiStart;
      }

      const configurationHints = loadedConfig.source === "defaults"
        ? []
        : getConfigurationHints(loadedConfig.config, workspaceReports);
      const workspaceScanMs = workspaceReports.reduce(
        (sum, workspace) => sum + workspace.result.performance.totalMs,
        0,
      );

      const report = renderReport({
        targetDir: rootDir,
        reporter,
        debug: Boolean(mergedOptions.debug),
        performance: Boolean(mergedOptions.performance),
        cache: Boolean(mergedOptions.cache),
        production: Boolean(mergedOptions.production),
        strict: Boolean(mergedOptions.strict),
        include,
        exclude,
        workspaces: workspaceReports,
        configurationHints,
        configSource: loadedConfig.source,
        rulesSummary: {
          ignorePackages: rules.ignorePackages,
          allowUnusedDependencies: rules.allowUnusedDependencies,
          allowUnusedDevDependencies: rules.allowUnusedDevDependencies,
          allowMissingPackages: rules.allowMissingPackages,
          allowMisplacedDevDependencies: rules.allowMisplacedDevDependencies,
        },
        performanceSummary: {
          discoverWorkspacesMs: roundMs(discoverWorkspacesMs),
          workspaceScanMs: roundMs(workspaceScanMs),
          aiSummaryMs: roundMs(aiSummaryMs),
          totalMs: roundMs(nodePerformance.now() - totalStart),
        },
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(mergedOptions.trace ? { trace: String(mergedOptions.trace) } : {}),
        ...(aiSummary ? { aiSummary } : {}),
        ...(aiConfig
          ? {
              ai: {
                provider: aiConfig.provider,
                ...(aiConfig.model ? { model: aiConfig.model } : {}),
              },
            }
          : {}),
      });

      console.log(report);

      if (workspaceReports.some((workspace) => workspace.findings.some((finding) => finding.items.length > 0))) {
        process.exitCode = 2;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(pc.red(`Error: ${message}`));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);

function parseReporter(value: string): ReporterType {
  if (SUPPORTED_REPORTERS.includes(value as ReporterType)) {
    return value as ReporterType;
  }

  throw new Error(
    `Unsupported reporter "${value}". Supported reporters: ${SUPPORTED_REPORTERS.join(", ")}`,
  );
}

function parseFindingTypes(value?: string): FindingType[] {
  const items = parseCsvOption(value);

  for (const item of items) {
    if (!SUPPORTED_FINDING_TYPES.includes(item as FindingType)) {
      throw new Error(
        `Unsupported finding type "${item}". Supported finding types: ${SUPPORTED_FINDING_TYPES.join(", ")}`,
      );
    }
  }

  return items as FindingType[];
}

function parseCsvOption(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildFindingRules(
  options: CliOptions,
  include: FindingType[],
  exclude: FindingType[],
): FindingRules {
  return {
    include,
    exclude,
    ignorePackages: parseCsvOption(options.ignorePackages),
    allowUnusedDependencies: parseCsvOption(options.allowUnusedDependencies),
    allowUnusedDevDependencies: parseCsvOption(options.allowUnusedDevDependencies),
    allowMissingPackages: parseCsvOption(options.allowMissingPackages),
    allowMisplacedDevDependencies: parseCsvOption(options.allowMisplacedDevDependencies),
  };
}

interface CliOptions {
  ai: boolean;
  provider: string | undefined;
  model: string | undefined;
  reporter: string;
  include: string | undefined;
  exclude: string | undefined;
  workspace: string | undefined;
  production: boolean;
  strict: boolean;
  debug: boolean;
  performance: boolean;
  cache: boolean;
  trace: string | undefined;
  ignorePackages: string | undefined;
  allowUnusedDependencies: string | undefined;
  allowUnusedDevDependencies: string | undefined;
  allowMissingPackages: string | undefined;
  allowMisplacedDevDependencies: string | undefined;
}

function mergeCliWithConfig(rawOptions: Record<string, unknown>, config: SadrazamConfig): CliOptions {
  return {
    ai: Boolean(rawOptions.ai),
    provider: asOptionalString(rawOptions.provider) ?? config.ai?.provider,
    model: asOptionalString(rawOptions.model) ?? config.ai?.model,
    reporter: asOptionalString(rawOptions.reporter) ?? config.reporter ?? "text",
    include: asOptionalString(rawOptions.include) ?? config.include?.join(","),
    exclude: asOptionalString(rawOptions.exclude) ?? config.exclude?.join(","),
    workspace: asOptionalString(rawOptions.workspace) ?? config.workspace?.join(","),
    production: rawOptions.production === true ? true : config.production ?? false,
    strict: rawOptions.strict === true ? true : config.strict ?? false,
    debug: rawOptions.debug === true ? true : config.debug ?? false,
    performance: rawOptions.performance === true ? true : config.performance ?? false,
    cache: rawOptions.cache === true ? true : config.cache ?? false,
    trace: asOptionalString(rawOptions.trace) ?? config.trace,
    ignorePackages: asOptionalString(rawOptions.ignorePackages) ?? config.ignorePackages?.join(","),
    allowUnusedDependencies:
      asOptionalString(rawOptions.allowUnusedDependencies) ?? config.allowUnusedDependencies?.join(","),
    allowUnusedDevDependencies:
      asOptionalString(rawOptions.allowUnusedDevDependencies) ?? config.allowUnusedDevDependencies?.join(","),
    allowMissingPackages:
      asOptionalString(rawOptions.allowMissingPackages) ?? config.allowMissingPackages?.join(","),
    allowMisplacedDevDependencies:
      asOptionalString(rawOptions.allowMisplacedDevDependencies)
      ?? config.allowMisplacedDevDependencies?.join(","),
  };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function roundMs(value: number): number {
  return Number(value.toFixed(1));
}
