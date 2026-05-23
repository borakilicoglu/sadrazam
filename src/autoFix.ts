import { writeFile } from "node:fs/promises";

import { readPackageJson } from "./packageReader.js";
import type { ActiveFinding, ReportWorkspace } from "./reporters.js";

interface MutablePackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

const TOP_LEVEL_KEY_ORDER = [
  "name",
  "version",
  "private",
  "type",
  "description",
  "main",
  "module",
  "types",
  "typings",
  "browser",
  "exports",
  "bin",
  "scripts",
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "keywords",
  "author",
  "repository",
  "homepage",
  "bugs",
  "license",
  "sadrazam",
] as const;

export interface AppliedFixSummary {
  packagePath: string;
  removedDependencies: string[];
  removedDevDependencies: string[];
  addedDevDependencies: string[];
  formattedFiles: string[];
}

export interface AutoFixOptions {
  format?: boolean;
}

export async function applyAutoFixes(
  workspaces: ReportWorkspace[],
  options: AutoFixOptions = {},
): Promise<AppliedFixSummary[]> {
  const summaries = await Promise.all(
    workspaces.map((workspace) => applyWorkspaceFixes(workspace, options)),
  );
  return summaries.filter((summary): summary is AppliedFixSummary => summary !== null);
}

async function applyWorkspaceFixes(
  workspace: ReportWorkspace,
  options: AutoFixOptions,
): Promise<AppliedFixSummary | null> {
  const unusedDependencies = getFindingItems(workspace.findings, "unused-dependencies");
  const unusedDevDependencies = getFindingItems(workspace.findings, "unused-devDependencies");
  const missingPackages = getFindingItems(workspace.findings, "missing");

  if (
    unusedDependencies.length === 0 &&
    unusedDevDependencies.length === 0 &&
    missingPackages.length === 0
  ) {
    return null;
  }

  const packageJson = await readPackageJson(workspace.result.packagePath) as MutablePackageJson;
  const removedDependencies = removePackageEntries(packageJson, "dependencies", unusedDependencies);
  const removedDevDependencies = removePackageEntries(packageJson, "devDependencies", unusedDevDependencies);
  const addedDevDependencies = addPackageEntries(packageJson, "devDependencies", missingPackages);

  if (
    removedDependencies.length === 0 &&
    removedDevDependencies.length === 0 &&
    addedDevDependencies.length === 0
  ) {
    return null;
  }

  const formattedPackageJson = options.format ? formatPackageJson(packageJson) : packageJson;

  await writeFile(
    workspace.result.packagePath,
    `${JSON.stringify(formattedPackageJson, null, 2)}\n`,
    "utf8",
  );

  return {
    packagePath: workspace.result.packagePath,
    removedDependencies,
    removedDevDependencies,
    addedDevDependencies,
    formattedFiles: options.format ? [workspace.result.packagePath] : [],
  };
}

function getFindingItems(findings: ActiveFinding[], type: ActiveFinding["type"]): string[] {
  return findings.find((finding) => finding.type === type)?.items ?? [];
}

function removePackageEntries(
  packageJson: MutablePackageJson,
  section: "dependencies" | "devDependencies",
  packageNames: string[],
): string[] {
  const record = packageJson[section];

  if (!record) {
    return [];
  }

  const removed = packageNames.filter((packageName) => packageName in record);

  for (const packageName of removed) {
    delete record[packageName];
  }

  if (Object.keys(record).length === 0) {
    delete packageJson[section];
  }

  return removed.sort();
}

/**
 * Adds missing packages to the given section with a "*" version placeholder.
 * Skips packages that are already declared anywhere in the package.json.
 * Returns the sorted list of actually added package names.
 */
function addPackageEntries(
  packageJson: MutablePackageJson,
  section: "dependencies" | "devDependencies",
  packageNames: string[],
): string[] {
  if (packageNames.length === 0) {
    return [];
  }

  const alreadyDeclared = new Set<string>([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ]);

  const toAdd = packageNames.filter((name) => !alreadyDeclared.has(name));

  if (toAdd.length === 0) {
    return [];
  }

  if (!packageJson[section]) {
    packageJson[section] = {};
  }

  for (const name of toAdd) {
    packageJson[section]![name] = "*";
  }

  return toAdd.sort();
}

function formatPackageJson(packageJson: MutablePackageJson): MutablePackageJson {
  const normalized: Record<string, unknown> = {};
  const preferredKeys = new Set<string>(TOP_LEVEL_KEY_ORDER);

  for (const key of TOP_LEVEL_KEY_ORDER) {
    if (!(key in packageJson)) {
      continue;
    }

    normalized[key] = formatValue(key, packageJson[key]);
  }

  for (const key of Object.keys(packageJson).sort()) {
    if (preferredKeys.has(key)) {
      continue;
    }

    normalized[key] = formatValue(key, packageJson[key]);
  }

  return normalized as MutablePackageJson;
}

function formatValue(key: string, value: unknown): unknown {
  if (isSortablePackageSection(key) && isStringRecord(value)) {
    return sortStringRecord(value);
  }

  if (key === "scripts" && isStringRecord(value)) {
    return sortStringRecord(value);
  }

  return value;
}

function isSortablePackageSection(key: string): key is "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies" {
  return key === "dependencies"
    || key === "devDependencies"
    || key === "peerDependencies"
    || key === "optionalDependencies";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortStringRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
