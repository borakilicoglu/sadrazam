#!/usr/bin/env node

import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { performance as nodePerformance } from "node:perf_hooks";
import path from "node:path";

import { Command } from "commander";
import fg from "fast-glob";
import pc from "picocolors";

import { generateAiSummary } from "./aiClient.js";
import { applyAutoFixes } from "./autoFix.js";
import { resolveAiConfig, SUPPORTED_AI_PROVIDERS } from "./aiConfig.js";
import { getConfigurationHints } from "./configHints.js";
import { loadSadrazamConfig, type SadrazamConfig } from "./config.js";
import { getActiveFindings, type FindingRules } from "./findings.js";
import { findSourceFiles } from "./fileFinder.js";
import {
  renderReport,
  SUPPORTED_REPORTERS,
  type FindingType,
  type ReportWorkspace,
  type ReporterType,
} from "./reporters.js";
import { scanProject, type ScanMemory } from "./scan.js";
import { discoverWorkspaces } from "./workspaceFinder.js";

const program = new Command();
const WATCH_INTERVAL_MS = 1000;
const WATCH_IGNORE_GLOBS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/.turbo/**",
  "**/.vitepress/cache/**",
];
const EMPTY_MEMORY: ScanMemory = {
  rssMb: 0,
  heapUsedMb: 0,
  heapTotalMb: 0,
  externalMb: 0,
  arrayBuffersMb: 0,
};

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
  .option("--memory", "print memory usage information")
  .option("--cache", "reuse scan results when source inputs have not changed")
  .option("--fix", "auto-fix safe package.json issues")
  .option("--watch", "re-run analysis when project files change")
  .option("--trace <package>", "trace where a package is used")
  .option("--trace-export <target>", "trace where an export is used (relativePath:exportName)")
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
  sadrazam . --trace-export src/lib.ts:usedHelper
  sadrazam . --cache --performance
  sadrazam . --fix
  sadrazam . --memory
  sadrazam . --watch
  sadrazam . --workspace packages/web
  sadrazam . --production --strict
  AI_PROVIDER=openai AI_TOKEN=... sadrazam . --ai
`,
  )
  .action(async (target, options) => {
    const targetDir = path.resolve(target);
    const loadedConfig = await loadSadrazamConfig(targetDir);
    const mergedOptions = mergeCliWithConfig(options, loadedConfig.config);

    if (mergedOptions.watch) {
      await runWatchMode(targetDir, options);
      return;
    }

    process.exitCode = await runScanCommand(targetDir, options);
  });

program.parseAsync(process.argv);

async function runScanCommand(
  targetDir: string,
  rawOptions: Record<string, unknown>,
  runtimeOptions: { watchRun?: boolean } = {},
): Promise<number> {
  try {
    const totalStart = nodePerformance.now();
    const loadedConfig = await loadSadrazamConfig(targetDir);
    const mergedOptions = mergeCliWithConfig(rawOptions, loadedConfig.config);
    const warnings: string[] = [];
    const aiEnabled = Boolean(mergedOptions.ai) && !runtimeOptions.watchRun;

    if (runtimeOptions.watchRun && mergedOptions.ai) {
      warnings.push("AI summary disabled in watch mode.");
    }

    if (runtimeOptions.watchRun && mergedOptions.fix) {
      warnings.push("Auto-fix disabled in watch mode.");
    }

    const aiConfig = resolveAiConfig({
      ai: aiEnabled,
      provider: mergedOptions.provider,
      model: mergedOptions.model,
      configAi: loadedConfig.config.ai,
    });
    const reporter = parseReporter(mergedOptions.reporter);
    const include = parseFindingTypes(mergedOptions.include);
    const exclude = parseFindingTypes(mergedOptions.exclude);
    const workspaceFilters = parseCsvOption(mergedOptions.workspace);
    const rules = buildFindingRules(mergedOptions, include, exclude, loadedConfig.config);

    const discoverStart = nodePerformance.now();
    const { rootDir, workspaces } = await discoverWorkspaces(targetDir, workspaceFilters);
    const discoverWorkspacesMs = nodePerformance.now() - discoverStart;

    let workspaceReports = await collectWorkspaceReports(workspaces, mergedOptions, loadedConfig.config, rules);
    const autoFixEnabled = Boolean(mergedOptions.fix) && !runtimeOptions.watchRun;
    const appliedFixes = autoFixEnabled ? await applyAutoFixes(workspaceReports) : [];

    if (appliedFixes.length > 0) {
      workspaceReports = await collectWorkspaceReports(workspaces, mergedOptions, loadedConfig.config, rules);
    }

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
      memory: Boolean(mergedOptions.memory),
      watch: Boolean(mergedOptions.watch),
      cache: Boolean(mergedOptions.cache || mergedOptions.watch),
      fix: Boolean(mergedOptions.fix),
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
        preprocessors: rules.preprocessors,
      },
      performanceSummary: {
        discoverWorkspacesMs: roundMs(discoverWorkspacesMs),
        workspaceScanMs: roundMs(workspaceScanMs),
        aiSummaryMs: roundMs(aiSummaryMs),
        totalMs: roundMs(nodePerformance.now() - totalStart),
      },
      memorySummary: {
        peak: workspaceReports.reduce(
          (peak, workspace) =>
            workspace.result.memory.heapUsedMb > peak.heapUsedMb ? workspace.result.memory : peak,
          workspaceReports[0]?.result.memory ?? EMPTY_MEMORY,
        ),
      },
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(appliedFixes.length > 0 ? { appliedFixes } : {}),
      ...(mergedOptions.trace ? { trace: String(mergedOptions.trace) } : {}),
      ...(mergedOptions.traceExport ? { traceExport: String(mergedOptions.traceExport) } : {}),
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

    return workspaceReports.some((workspace) => workspace.findings.some((finding) => finding.items.length > 0))
      ? 2
      : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(pc.red(`Error: ${message}`));
    return 1;
  }
}

async function runWatchMode(targetDir: string, rawOptions: Record<string, unknown>): Promise<void> {
  let fingerprint = await createWatchFingerprint(targetDir);
  let running = false;
  let pending = false;
  let timer: NodeJS.Timeout | undefined;

  const rerun = async (reason?: string) => {
    if (running) {
      pending = true;
      return;
    }

    running = true;

    if (reason) {
      console.log(pc.dim(`\nChange detected${reason ? `: ${reason}` : ""}. Re-running...`));
    }

    process.exitCode = await runScanCommand(targetDir, rawOptions, { watchRun: true });
    fingerprint = await createWatchFingerprint(targetDir);
    running = false;

    if (pending) {
      pending = false;
      await rerun();
    }
  };

  await rerun();
  console.log(pc.dim("\nWatching for changes. Press Ctrl+C to exit."));

  timer = setInterval(async () => {
    try {
      const nextFingerprint = await createWatchFingerprint(targetDir);

      if (nextFingerprint !== fingerprint) {
        fingerprint = nextFingerprint;
        await rerun("files changed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.yellow(`Watch polling failed: ${message}`));
    }
  }, WATCH_INTERVAL_MS);

  await new Promise<void>((resolve) => {
    const handleSigint = () => {
      if (timer) {
        clearInterval(timer);
      }
      process.off("SIGINT", handleSigint);
      console.log(pc.dim("\nWatch mode stopped."));
      resolve();
    };

    process.on("SIGINT", handleSigint);
  });
}

async function collectWorkspaceReports(
  workspaces: Awaited<ReturnType<typeof discoverWorkspaces>>["workspaces"],
  options: CliOptions,
  config: SadrazamConfig,
  rules: FindingRules,
): Promise<ReportWorkspace[]> {
  return Promise.all(
    workspaces.map(async (workspace) => {
      const result = await scanProject(workspace.dir, {
        production: Boolean(options.production),
        strict: Boolean(options.strict),
        cache: Boolean(options.cache || options.watch),
        ...(config.inputs ? { pluginInputs: config.inputs } : {}),
      });
      const findings = getActiveFindings(result, rules, Boolean(options.production));

      return {
        workspace,
        result,
        findings,
      };
    }),
  );
}

async function createWatchFingerprint(targetDir: string): Promise<string> {
  const [sourceFiles, metadataFiles] = await Promise.all([
    findSourceFiles(targetDir),
    fg(["**/package.json", "**/sadrazam.json", "**/pnpm-workspace.yaml"], {
      cwd: targetDir,
      absolute: true,
      dot: true,
      ignore: WATCH_IGNORE_GLOBS,
    }),
  ]);

  const filePaths = [...new Set([...sourceFiles, ...metadataFiles])].sort();
  const entries = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const fileStat = await stat(filePath);
        const relativePath = path.relative(targetDir, filePath) || path.basename(filePath);
        return `${relativePath}:${fileStat.size}:${Math.floor(fileStat.mtimeMs)}`;
      } catch {
        return `${filePath}:missing`;
      }
    }),
  );

  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

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
  config: SadrazamConfig,
): FindingRules {
  return {
    include,
    exclude,
    ignorePackages: parseCsvOption(options.ignorePackages),
    allowUnusedDependencies: parseCsvOption(options.allowUnusedDependencies),
    allowUnusedDevDependencies: parseCsvOption(options.allowUnusedDevDependencies),
    allowMissingPackages: parseCsvOption(options.allowMissingPackages),
    allowMisplacedDevDependencies: parseCsvOption(options.allowMisplacedDevDependencies),
    preprocessors: {
      packagePatterns: config.preprocessors?.packagePatterns ?? [],
      filePatterns: config.preprocessors?.filePatterns ?? [],
      exportPatterns: config.preprocessors?.exportPatterns ?? [],
    },
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
  memory: boolean;
  cache: boolean;
  fix: boolean;
  watch: boolean;
  trace: string | undefined;
  traceExport: string | undefined;
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
    memory: rawOptions.memory === true ? true : config.memory ?? false,
    cache: rawOptions.cache === true ? true : config.cache ?? false,
    fix: rawOptions.fix === true,
    watch: rawOptions.watch === true ? true : config.watch ?? false,
    trace: asOptionalString(rawOptions.trace) ?? config.trace,
    traceExport: asOptionalString(rawOptions.traceExport),
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
