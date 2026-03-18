import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = process.cwd();
const cliPath = path.join(rootDir, "dist", "index.js");

function runJsonReport(fixtureName: string, extraArgs: string[] = []) {
  const fixtureDir = path.join(rootDir, "test", "fixtures", fixtureName);
  return runJsonReportForDir(fixtureDir, extraArgs);
}

function runJsonReportForDir(targetDir: string, extraArgs: string[] = []) {
  let stdout = "";

  try {
    stdout = execFileSync("node", [cliPath, targetDir, "--reporter", "json", ...extraArgs], {
      cwd: rootDir,
      encoding: "utf8",
    });
  } catch (error) {
    const typedError = error as { stdout: string };
    stdout = typedError.stdout;
  }

  return JSON.parse(stdout);
}

async function waitForOutput(predicate: () => boolean, timeoutMs = 4000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for watch output");
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

  it("includes memory usage when memory mode is enabled", () => {
    const report = runJsonReport("config-project", ["--memory"]);
    const workspace = report.workspaces[0];

    expect(report.mode.memory).toBe(true);
    expect(report.memory.peak.heapUsedMb).toBeGreaterThanOrEqual(0);
    expect(workspace.memory.heapUsedMb).toBeGreaterThanOrEqual(0);
    expect(workspace.memory.rssMb).toBeGreaterThanOrEqual(0);
  });

  it("reuses cached scan results when inputs are unchanged", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "sadrazam-cache-"));
    const tempProject = path.join(tempRoot, "project");

    cpSync(path.join(rootDir, "test", "fixtures", "config-project"), tempProject, { recursive: true });

    try {
      const first = runJsonReportForDir(tempProject, ["--cache", "--performance"]);
      const second = runJsonReportForDir(tempProject, ["--cache", "--performance"]);

      expect(first.mode.cache).toBe(true);
      expect(first.workspaces[0].summary.cached).toBe(false);
      expect(second.workspaces[0].summary.cached).toBe(true);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
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





  it("follows tool-specific config arguments for vite, vitest, and jest", () => {
    const report = runJsonReport("plugin-cli-project");
    const workspace = report.workspaces[0];

    expect(workspace.summary.activePlugins).toEqual(["jest", "vite", "vitest"]);
    expect(workspace.findings).toEqual([]);
    expect(workspace.externalImports).toEqual([
      "@vitejs/plugin-react",
      "jest",
      "ts-jest",
      "vite",
      "vitest",
    ]);
  });

  it("accepts plugin inputs from config for extra entry files and packages", () => {
    const report = runJsonReport("inputs-project");
    const workspace = report.workspaces[0];

    expect(workspace.summary.activePlugins).toEqual(["inputs"]);
    expect(workspace.findings).toEqual([]);
    expect(workspace.externalImports).toEqual(["commander", "typescript", "vite"]);
  });

  it("detects built-in plugin package usage from tool-specific CLI arguments", () => {
    const report = runJsonReport("plugin-project");
    const workspace = report.workspaces[0];

    expect(workspace.summary.activePlugins).toEqual(["eslint", "prettier"]);
    expect(workspace.findings).toEqual([]);
    expect(workspace.externalImports).toEqual([
      "@typescript-eslint/parser",
      "eslint",
      "eslint-plugin-react-hooks",
      "prettier",
      "prettier-plugin-tailwindcss",
    ]);
  });

  it("scans svelte, vue, mdx, and astro files for dependency imports", () => {
    const report = runJsonReport("compiler-project");
    const workspace = report.workspaces[0];

    expect(workspace.findings).toEqual([]);
    expect(workspace.externalImports).toEqual([
      "@mdx-js/react",
      "astro",
      "clsx",
      "svelte",
      "vue",
    ]);
  });


  it("reports unreachable source files as unused files", () => {
    const report = runJsonReport("unused-files-project");
    const workspace = report.workspaces[0];

    expect(workspace.findings).toEqual([
      {
        type: "unused-files",
        title: "Unused files",
        items: ["src/unused.ts"],
      },
    ]);
    expect(report.workspaces[0].unusedFiles).toEqual(["src/unused.ts"]);
  });

  it("reports unused exports in reachable files", () => {
    const report = runJsonReport("unused-exports-project");
    const workspace = report.workspaces[0];

    expect(workspace.findings).toEqual([
      {
        type: "unused-exports",
        title: "Unused exports",
        items: ["src/lib.ts: unusedHelper"],
      },
    ]);
    expect(report.workspaces[0].unusedExports).toEqual(["src/lib.ts: unusedHelper"]);
  });

  it("traces export usage for reachable local modules", () => {
    const report = runJsonReport("unused-exports-project", ["--trace-export", "src/lib.ts:usedHelper"]);

    expect(report.workspaces[0].exportTrace).toEqual({
      export: "src/lib.ts:usedHelper",
      sources: ["src/index.ts"],
    });
  });

  it("reruns in watch mode when project files change", async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "sadrazam-watch-"));
    const tempProject = path.join(tempRoot, "project");

    cpSync(path.join(rootDir, "test", "fixtures", "config-project"), tempProject, { recursive: true });

    const child = spawn("node", [cliPath, tempProject, "--watch"], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    try {
      await waitForOutput(() => output.includes("Watching for changes. Press Ctrl+C to exit."));

      appendFileSync(path.join(tempProject, "src", "index.ts"), "\n");

      await waitForOutput(() => output.includes("Re-running..."));
    } finally {
      child.kill("SIGINT");
      await new Promise((resolve) => child.once("exit", resolve));
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
