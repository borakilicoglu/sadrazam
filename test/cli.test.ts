import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = process.cwd();
const cliPath = path.join(rootDir, "dist", "index.js");

function runJsonReport(fixtureName: string, extraArgs: string[] = []) {
  const fixtureDir = path.join(rootDir, "test", "fixtures", fixtureName);
  let stdout = "";

  try {
    stdout = execFileSync("node", [cliPath, fixtureDir, "--reporter", "json", ...extraArgs], {
      cwd: rootDir,
      encoding: "utf8",
    });
  } catch (error) {
    const typedError = error as { stdout: string };
    stdout = typedError.stdout;
  }

  return JSON.parse(stdout);
}

describe("CLI", () => {
  it("loads sadrazam.json config and applies ignore/allowlist rules", () => {
    const report = runJsonReport("config-project");
    const workspace = report.workspaces[0];

    expect(report.workspaces).toHaveLength(1);
    expect(workspace.summary.findings).toBe(0);
    expect(workspace.findings).toEqual([]);
    expect(workspace.summary.scriptCommandPackages).toEqual(["tsx", "typescript"]);
  });

  it("reports configuration hints for stale ignore and allowlist entries", () => {
    const report = runJsonReport("config-project");

    expect(report.configurationHints).toEqual([
      'allowUnusedDevDependencies entry "typescript" has no effect and can be removed.',
    ]);
  });

  it("includes performance timings when performance mode is enabled", () => {
    const report = runJsonReport("config-project", ["--performance"]);
    const workspace = report.workspaces[0];

    expect(report.mode.performance).toBe(true);
    expect(report.performance.totalMs).toBeGreaterThanOrEqual(0);
    expect(report.performance.workspaceScanMs).toBeGreaterThanOrEqual(0);
    expect(workspace.performance.totalMs).toBeGreaterThanOrEqual(0);
    expect(workspace.performance.readFilesMs).toBeGreaterThanOrEqual(0);
  });

  it("discovers pnpm workspaces and respects local workspace dependencies", () => {
    const report = runJsonReport("monorepo-project");
    const workspaceNames = report.workspaces.map((workspace: { workspace: { name: string } }) => workspace.workspace.name).sort();

    expect(report.workspaces).toHaveLength(2);
    expect(workspaceNames).toEqual(["@acme/shared", "@acme/web"]);
    expect(report.workspaces.every((workspace: { findings: unknown[] }) => workspace.findings.length === 0)).toBe(true);
  });

  it("treats @types/node as used when TypeScript files import Node built-ins", () => {
    const report = runJsonReport("ts-node-types-project");
    const workspace = report.workspaces[0];

    expect(workspace.findings).toEqual([]);
    expect(workspace.externalImports).toEqual(["commander", "typescript"]);
  });

  it("filters built-in modules and maps known script binaries to package names", () => {
    const report = runJsonReport("cjs-project");
    const workspace = report.workspaces[0];

    expect(workspace.findings).toEqual([]);
    expect(workspace.summary.scriptCommandPackages).toEqual(["markdownlint-cli", "standard"]);
    expect(workspace.externalImports).toEqual(["chalk", "commander", "markdownlint-cli", "standard"]);
  });
});
