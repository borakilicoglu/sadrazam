import pc from "picocolors";
import path from "node:path";

import type { ScanMemory, ScanResult } from "./scan.js";
import type { WorkspaceTarget } from "./workspaceFinder.js";

export const SUPPORTED_REPORTERS = ["text", "json", "toon", "markdown", "sarif"] as const;

export type ReporterType = (typeof SUPPORTED_REPORTERS)[number];
export type FindingType =
  | "missing"
  | "unresolved-imports"
  | "unused-dependencies"
  | "unused-devDependencies"
  | "misplaced-devDependencies"
  | "unused-files"
  | "unused-exports"
  | "duplicate-exports"
  | "namespace-members";

export interface ActiveFinding {
  type: FindingType;
  title: string;
  items: string[];
  totalItems?: number;
  omittedItems?: number;
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
  format: boolean;
  production: boolean;
  strict: boolean;
  include: FindingType[];
  exclude: FindingType[];
  maxShowIssues?: number;
  workspaces: ReportWorkspace[];
  trace?: string;
  traceExport?: string;
  explain?: string;
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
    addedDevDependencies: string[];
    formattedFiles: string[];
  }>;
}

export function renderReport(input: RenderReportInput): string {
  const payload = buildStructuredReport(input);

  if (input.reporter === "json") {
    return JSON.stringify(payload, null, 2);
  }

  if (input.reporter === "toon") {
    return encodeToToon(payload as unknown as ToonValue);
  }

  if (input.reporter === "sarif") {
    return JSON.stringify(renderSarifReport(input), null, 2);
  }

  if (input.reporter === "markdown") {
    return renderMarkdownReport(input);
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
      if (fix.addedDevDependencies.length > 0) {
        lines.push(`Added devDependencies: ${fix.addedDevDependencies.join(", ")} (version "*" — run npm install to resolve)`);
      }
      if (fix.formattedFiles.length > 0) {
        lines.push(`Formatted files: ${fix.formattedFiles.join(", ")}`);
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
    const displayFindings = limitFindings(findings, input.maxShowIssues);

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
    if (input.debug) {
      lines.push(`Parser: OXC ${result.parseStats.oxcFiles}, fallback ${result.parseStats.fallbackFiles}`);
      if (result.pluginDetails.length > 0) {
        lines.push("Plugin details:");
        for (const detail of result.pluginDetails) {
          lines.push(`- ${detail.name} (${detail.activation.join(", ") || "unknown"})`);
          lines.push(`  packages: ${detail.packages.join(", ") || "-"}`);
          lines.push(`  files: ${detail.fileEntries.map((filePath) => pathRelative(result.rootDir, filePath)).join(", ") || "-"}`);
        }
      }
    }

    if (findingCount === 0) {
      lines.push(pc.green("No dependency issues found."));
    }

    for (const finding of displayFindings) {
      lines.push("");
      lines.push(colorizeFindingTitle(finding.type, finding.title));

      for (const item of finding.items) {
        lines.push(`- ${item}`);
      }

      if ((finding.omittedItems ?? 0) > 0) {
        lines.push(`... ${finding.omittedItems} more`);
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

    if (input.explain) {
      lines.push("");
      lines.push(pc.bold(`Explain: ${input.explain}`));
      lines.push(...renderExplainLines(input.explain, result, workspace.relativeDir));
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
    lines.push(pc.dim(`Format: ${input.format ? "enabled" : "disabled"}`));
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

function buildStructuredReport(input: RenderReportInput) {
  return {
    targetDir: input.targetDir,
    mode: {
      debug: input.debug,
      performance: input.performance,
      memory: input.memory,
      watch: input.watch,
      cache: input.cache,
      fix: input.fix,
      format: input.format,
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
        parser: {
          oxcFiles: result.parseStats.oxcFiles,
          fallbackFiles: result.parseStats.fallbackFiles,
        },
      },
      debug: input.debug
        ? {
            pluginDetails: result.pluginDetails.map((detail) => ({
              name: detail.name,
              activation: detail.activation,
              packages: detail.packages,
              fileEntries: detail.fileEntries.map((filePath) => pathRelative(result.rootDir, filePath)),
            })),
          }
        : null,
      findings: limitFindings(findings, input.maxShowIssues),
      externalImports: result.externalImports,
      unresolvedImports: result.unresolvedImports,
      unusedFiles: result.unusedFiles,
      unusedExports: result.unusedExports,
      duplicateExports: result.duplicateExports,
      unusedNamespaceMembers: result.unusedNamespaceMembers,
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
      explain: input.explain
        ? buildExplainPayload(input.explain, result, workspace.relativeDir)
        : null,
    })),
  };
}

function pathRelative(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath) || path.basename(filePath);
}

type ToonValue = null | boolean | number | string | ToonValue[] | ToonObject;

interface ToonObject {
  [key: string]: ToonValue;
}

function encodeToToon(value: ToonValue): string {
  return renderToToonDocument(value).join("\n");
}

function renderToToonDocument(value: ToonValue): string[] {
  if (Array.isArray(value) || !isPlainObject(value)) {
    return renderToToonValue(value, 0, "value");
  }

  const lines: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    lines.push(...renderToToonValue(child, 0, key));
  }

  return lines;
}

function renderToToonValue(value: ToonValue, depth: number, label?: string): string[] {
  const indent = "  ".repeat(depth);
  const keyPrefix = label ? `${escapeToonKey(label)}` : "";

  if (value === null) {
    return [`${indent}${keyPrefix}=null`];
  }

  if (typeof value === "boolean") {
    return [`${indent}${keyPrefix}=${value}`];
  }

  if (typeof value === "number") {
    return [`${indent}${keyPrefix}=${Number.isFinite(value) ? value : "null"}`];
  }

  if (typeof value === "string") {
    return [`${indent}${keyPrefix}=${escapeToonScalar(value)}`];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${indent}${keyPrefix}[0]:`];
    }

    if (isUniformObjectArray(value)) {
      const firstEntry = value[0] as ToonObject;
      const fields = Object.keys(firstEntry);
      const rows = value.map((entry) =>
        fields.map((field) => formatToonInlineScalar(((entry as ToonObject)[field] ?? null) as null | boolean | number | string)).join(","),
      );

      return [`${indent}${keyPrefix}[${value.length}]{${fields.join(",")}}:`, ...rows.map((row) => `${indent}  ${row}`)];
    }

    const lines = [`${indent}${keyPrefix}[${value.length}]:`];
    for (const item of value) {
      if (isInlineScalar(item)) {
        lines.push(`${indent}  ${formatToonInlineScalar(item)}`);
        continue;
      }

      lines.push(`${indent}  -`);
      lines.push(...renderToToonNested(item, depth + 2));
    }
    return lines;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return [`${indent}${keyPrefix}:`];
  }

  const lines = [`${indent}${keyPrefix}:`];
  for (const [childKey, childValue] of entries) {
    lines.push(...renderToToonValue(childValue, depth + 1, childKey));
  }
  return lines;
}

function renderToToonNested(value: ToonValue, depth: number): string[] {
  if (isPlainObject(value)) {
    const lines: string[] = [];
    for (const [key, child] of Object.entries(value)) {
      lines.push(...renderToToonValue(child, depth, key));
    }
    return lines;
  }

  return renderToToonValue(value, depth, "value");
}

function isUniformObjectArray(value: ToonValue[]): boolean {
  if (value.length === 0 || !value.every((entry) => isPlainObject(entry))) {
    return false;
  }

  const keys = Object.keys(value[0] as ToonObject);

  return value.every((entry) => {
    const typedEntry = entry as ToonObject;
    const entryKeys = Object.keys(typedEntry);
    return entryKeys.length === keys.length
      && entryKeys.every((key, index) => key === keys[index] && isInlineScalar(typedEntry[key] ?? null));
  });
}

function isPlainObject(value: ToonValue): value is ToonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInlineScalar(value: ToonValue): value is null | boolean | number | string {
  return value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string";
}

function formatToonInlineScalar(value: null | boolean | number | string): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return escapeToonScalar(value);
  }

  return String(value);
}

function escapeToonKey(value: string): string {
  return /^[A-Za-z0-9_.\-\/]+$/.test(value) ? value : JSON.stringify(value);
}

function escapeToonScalar(value: string): string {
  return value === "" || /[\s,:=\[\]\{\}"\\]/.test(value) ? JSON.stringify(value) : value;
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
    input.format ? "format" : null,
    input.debug ? "debug" : null,
  ].filter(Boolean);

  return enabled.join(", ") || "default";
}

function colorizeFindingTitle(type: FindingType, title: string): string {
  if (type === "missing" || type === "unresolved-imports") {
    return pc.red(title);
  }

  if (type === "misplaced-devDependencies") {
    return pc.red(title);
  }

  if (type === "unused-files" || type === "unused-exports" || type === "duplicate-exports") {
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

function renderMarkdownReport(input: RenderReportInput): string {
  const lines: string[] = [];

  lines.push('# Sadrazam Report');
  lines.push('');
  lines.push(`- Target: ${input.targetDir}`);
  lines.push(`- Workspaces: ${input.workspaces.length}`);
  lines.push(`- Mode: ${describeMode(input)}`);

  if (input.configurationHints && input.configurationHints.length > 0) {
    lines.push('');
    lines.push('## Configuration Hints');
    lines.push('');
    for (const hint of input.configurationHints) {
      lines.push(`- ${hint}`);
    }
  }

  for (const { workspace, result, findings } of input.workspaces) {
    const findingCount = findings.reduce((sum, finding) => sum + finding.items.length, 0);
    const displayFindings = limitFindings(findings, input.maxShowIssues);

    lines.push('');
    lines.push(`## ${workspace.name} (${workspace.relativeDir})`);
    lines.push('');
    lines.push(`- Package: ${result.packagePath}`);
    lines.push(`- Files scanned: ${result.files.length}`);
    lines.push(`- External packages used: ${result.externalImports.length}`);
    lines.push(`- Findings: ${findingCount}`);
    if (input.cache) {
      lines.push(`- Cache: ${result.cached ? 'hit' : 'miss'}`);
    }
    if (result.activePlugins.length > 0) {
      lines.push(`- Plugins: ${result.activePlugins.join(', ')}`);
    }
    if (result.scriptCommandPackages.length > 0) {
      lines.push(`- Script packages: ${result.scriptCommandPackages.join(', ')}`);
    }

    if (findingCount === 0) {
      lines.push('');
      lines.push('No dependency issues found.');
      continue;
    }

    for (const finding of displayFindings) {
      lines.push('');
      lines.push(`### ${finding.title}`);
      lines.push('');
      for (const item of finding.items) {
        lines.push(`- ${item}`);
      }
      if ((finding.omittedItems ?? 0) > 0) {
        lines.push(`- ... ${finding.omittedItems} more`);
      }
    }
  }

  return lines.join('\n');
}

function renderSarifReport(input: RenderReportInput) {
  const rules = [
    { id: 'missing', name: 'Missing package declarations', shortDescription: { text: 'Package is used but not declared in package.json.' } },
    { id: 'unresolved-imports', name: 'Unresolved local imports', shortDescription: { text: 'A local-style import specifier could not be resolved.' } },
    { id: 'unused-dependencies', name: 'Unused dependencies', shortDescription: { text: 'A dependency is declared but not used.' } },
    { id: 'unused-devDependencies', name: 'Unused devDependencies', shortDescription: { text: 'A devDependency is declared but not used.' } },
    { id: 'misplaced-devDependencies', name: 'Misplaced devDependencies', shortDescription: { text: 'A devDependency is used in production code.' } },
    { id: 'unused-files', name: 'Unused files', shortDescription: { text: 'A source file is unreachable from known entries.' } },
    { id: 'unused-exports', name: 'Unused exports', shortDescription: { text: 'An export in a reachable module is not used.' } },
    { id: 'duplicate-exports', name: 'Duplicate exports', shortDescription: { text: 'A reachable module exports aliases for the same local symbol.' } },
    { id: 'namespace-members', name: 'Unused namespace members', shortDescription: { text: 'A TypeScript namespace export member is not used.' } },
  ];

  const results = input.workspaces.flatMap(({ workspace, result, findings }) =>
    findings.flatMap((finding) =>
      finding.items.map((item) => ({
        ruleId: finding.type,
        level: finding.type === 'missing' || finding.type === 'unresolved-imports' || finding.type === 'misplaced-devDependencies' ? 'error' : 'warning',
        message: { text: `${finding.title}: ${item}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: workspace.relativeDir === '.' ? result.packagePath : workspace.relativeDir,
              },
            },
          },
        ],
      })),
    ),
  );

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Sadrazam',
            informationUri: 'https://github.com/borakilicoglu/sadrazam',
            rules,
          },
        },
        results,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// --explain helpers
// ---------------------------------------------------------------------------

interface ExplainPayload {
  type: string;
  entryFiles: string[];
  items: Array<Record<string, unknown>>;
}

function buildExplainPayload(
  findingType: string,
  result: ScanResult,
  relativeDir: string,
): ExplainPayload {
  const entryFiles = result.scriptEntryFiles;

  if (findingType === "unused-files") {
    return {
      type: findingType,
      entryFiles,
      items: result.unusedFiles.map((file) => ({
        item: file,
        reason: "Not reachable from any entry point via local imports.",
      })),
    };
  }

  if (findingType === "unused-exports") {
    return {
      type: findingType,
      entryFiles,
      items: result.unusedExports.map((entry) => {
        const [file, exportName] = entry.split(": ");
        const traceKey = `${file}: ${exportName}`;
        const importedBy = result.exportTraces[traceKey] ?? [];
        return {
          item: entry,
          reason: importedBy.length === 0
            ? "Export is not imported by any reachable file."
            : "Export exists in traces but was filtered.",
          importedBy,
        };
      }),
    };
  }

  if (findingType === "duplicate-exports") {
    return {
      type: findingType,
      entryFiles,
      items: result.duplicateExports.map((entry) => {
        const [file = entry, symbols = ""] = entry.split(": ");
        return {
          file,
          symbols: symbols.split("|").filter(Boolean),
        };
      }),
    };
  }

  if (findingType === "namespace-members") {
    return {
      type: findingType,
      entryFiles,
      items: result.unusedNamespaceMembers.map((entry) => ({
        item: entry,
        reason: "Namespace member is not referenced by any reachable local import.",
      })),
    };
  }

  if (
    findingType === "unused-dependencies" ||
    findingType === "unused-devDependencies"
  ) {
    const packages = findingType === "unused-dependencies"
      ? result.unusedDependencies
      : result.unusedDevDependencies;

    return {
      type: findingType,
      entryFiles,
      items: packages.map((pkg) => ({
        item: pkg,
        reason: "Package is declared but not imported in any scanned file or script.",
        importedBy: result.packageTraces[pkg] ?? [],
      })),
    };
  }

  if (findingType === "missing") {
    return {
      type: findingType,
      entryFiles,
      items: result.missingPackages.map((pkg) => ({
        item: pkg,
        reason: "Package is imported but not declared in package.json.",
        importedBy: result.packageTraces[pkg] ?? [],
      })),
    };
  }

  if (findingType === "unresolved-imports") {
    return {
      type: findingType,
      entryFiles,
      items: result.unresolvedImports.map((entry) => {
        const [sourceFile] = entry.split(": ");
        return {
          item: entry,
          reason: "Specifier looks local but could not be resolved to a scanned source file.",
          importedBy: sourceFile ? [sourceFile] : [],
        };
      }),
    };
  }

  if (findingType === "misplaced-devDependencies") {
    return {
      type: findingType,
      entryFiles,
      items: result.misplacedDevDependencies.map((pkg) => ({
        item: pkg,
        reason: "Package is a devDependency but imported in production files.",
        importedBy: (result.packageTraces[pkg] ?? []).filter((f) =>
          result.files.find((file) => file.relativePath === f)?.isProduction,
        ),
      })),
    };
  }

  return { type: findingType, entryFiles, items: [] };
}

function renderExplainLines(
  findingType: string,
  result: ScanResult,
  relativeDir: string,
): string[] {
  const payload = buildExplainPayload(findingType, result, relativeDir);
  const lines: string[] = [];

  if (payload.entryFiles.length > 0) {
    lines.push(pc.dim(`Entry files: ${payload.entryFiles.join(", ")}`));
  } else {
    lines.push(pc.dim("Entry files: none detected"));
  }

  if (payload.items.length === 0) {
    lines.push(pc.green(`No ${findingType} findings to explain.`));
    return lines;
  }

  for (const entry of payload.items) {
    lines.push("");
    const item = typeof entry.item === "string" ? entry.item : JSON.stringify(entry);
    const reason = typeof entry.reason === "string" ? entry.reason : "Finding details are available in structured output.";
    const importedBy = Array.isArray(entry.importedBy)
      ? entry.importedBy.filter((value): value is string => typeof value === "string")
      : [];

    lines.push(pc.yellow(`  ${item}`));
    lines.push(pc.dim(`  Reason: ${reason}`));

    if (importedBy.length > 0) {
      lines.push(pc.dim(`  Imported by: ${importedBy.join(", ")}`));
    } else if (
      findingType === "unused-dependencies" ||
      findingType === "unused-devDependencies" ||
      findingType === "missing"
    ) {
      lines.push(pc.dim("  Imported by: (none found in scanned files)"));
    }
  }

  return lines;
}

function limitFindings(findings: ActiveFinding[], maxShowIssues?: number): ActiveFinding[] {
  if (!maxShowIssues) {
    return findings;
  }

  return findings.map((finding) => {
    if (finding.items.length <= maxShowIssues) {
      return finding;
    }

    return {
      ...finding,
      items: finding.items.slice(0, maxShowIssues),
      totalItems: finding.items.length,
      omittedItems: finding.items.length - maxShowIssues,
    };
  });
}
