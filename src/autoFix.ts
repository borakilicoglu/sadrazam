import { writeFile } from "node:fs/promises";

import { readPackageJson } from "./packageReader.js";
import type { ActiveFinding, ReportWorkspace } from "./reporters.js";

interface MutablePackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface AppliedFixSummary {
  packagePath: string;
  removedDependencies: string[];
  removedDevDependencies: string[];
}

export async function applyAutoFixes(workspaces: ReportWorkspace[]): Promise<AppliedFixSummary[]> {
  const summaries = await Promise.all(workspaces.map((workspace) => applyWorkspaceFixes(workspace)));
  return summaries.filter((summary): summary is AppliedFixSummary => summary !== null);
}

async function applyWorkspaceFixes(workspace: ReportWorkspace): Promise<AppliedFixSummary | null> {
  const unusedDependencies = getFindingItems(workspace.findings, "unused-dependencies");
  const unusedDevDependencies = getFindingItems(workspace.findings, "unused-devDependencies");

  if (unusedDependencies.length === 0 && unusedDevDependencies.length === 0) {
    return null;
  }

  const packageJson = await readPackageJson(workspace.result.packagePath) as MutablePackageJson;
  const removedDependencies = removePackageEntries(packageJson, "dependencies", unusedDependencies);
  const removedDevDependencies = removePackageEntries(packageJson, "devDependencies", unusedDevDependencies);

  if (removedDependencies.length === 0 && removedDevDependencies.length === 0) {
    return null;
  }

  await writeFile(workspace.result.packagePath, `${JSON.stringify(packageJson, null, 2)}
`, "utf8");

  return {
    packagePath: workspace.result.packagePath,
    removedDependencies,
    removedDevDependencies,
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
