import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function runReport(fixtureName: string, reporter: string, extraArgs: string[] = []) {
  const fixtureDir = path.join(rootDir, "test", "fixtures", fixtureName);
  return runReportForDir(fixtureDir, reporter, extraArgs);
}

function runReportForDir(targetDir: string, reporter: string, extraArgs: string[] = []) {
  try {
    return execFileSync("node", [cliPath, targetDir, "--reporter", reporter, ...extraArgs], {
      cwd: rootDir,
      encoding: "utf8",
    });
  } catch (error) {
    const typedError = error as { stdout: string };
    return typedError.stdout;
  }
}

function createTempProject(prefix: string) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), prefix));
  const tempProject = path.join(tempRoot, "project");
  mkdirSync(path.join(tempProject, "src"), { recursive: true });

  writeFileSync(
    path.join(tempProject, "package.json"),
    `${JSON.stringify({ name: prefix.replace(/-$/, ""), version: "1.0.0", type: "module" }, null, 2)}\n`,
    "utf8",
  );

  return { tempRoot, tempProject };
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

  it("initializes config from piped answers", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "sadrazam-init-"));
    const tempProject = path.join(tempRoot, "project");

    try {
      execFileSync("node", [cliPath, "init", tempProject], {
        cwd: rootDir,
        encoding: "utf8",
        input: [
          "json",
          "y",
          "y",
          "y",
          "unused-files",
          "react",
          "lodash",
          "y",
          "anthropic",
          "claude-3-5-sonnet",
        ].join("\n"),
      });

      const config = JSON.parse(readFileSync(path.join(tempProject, "sadrazam.json"), "utf8"));

      expect(config).toEqual({
        reporter: "json",
        cache: true,
        production: true,
        strict: true,
        exclude: ["unused-files"],
        allowUnusedDependencies: ["react"],
        ignorePackages: ["lodash"],
        ai: {
          provider: "anthropic",
          model: "claude-3-5-sonnet",
        },
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });


  it("resolves catalog references and reports unused catalog entries", () => {
    const report = runJsonReport("catalog-project");
    const workspace = report.workspaces[0];

    expect(workspace.findings).toEqual([]);
    expect(workspace.externalImports).toEqual(["commander", "react-dom"]);
    expect(report.configurationHints).toEqual([
      "catalog.entryFiles.unused-entry is unused and can be removed.",
      "catalog.packages.unused-packages is unused and can be removed.",
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

  it("includes parser backend counts in workspace summaries", () => {
    const report = runJsonReport("config-project");
    const parser = report.workspaces[0].summary.parser;

    expect(parser.oxcFiles).toBeGreaterThan(0);
    expect(parser.fallbackFiles).toBe(0);
  });

  it("renders a markdown report", () => {
    const report = runReport("config-project", "markdown");

    expect(report).toContain("# Sadrazam Report");
    expect(report).toContain("## config-project (.)");
    expect(report).toContain("No dependency issues found.");
  });

  it("renders a TOON report", () => {
    const report = runReport("config-project", "toon");

    expect(report).toContain("targetDir=");
    expect(report).toContain("mode:");
    expect(report).toContain("workspaces[1]:");
    expect(report).toContain("workspace:");
    expect(report).toContain("name=config-project");
  });

  it("limits displayed JSON finding items without changing summary counts", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-max-show-json-");

    try {
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import "./missing-a";\nimport "./missing-b";\nimport "./missing-c";\n\nexport const value = 1;\n`,
        "utf8",
      );

      const report = runJsonReportForDir(tempProject, ["--max-show-issues", "1"]);
      const workspace = report.workspaces[0];
      const finding = workspace.findings.find((entry: { type: string }) => entry.type === "unresolved-imports");

      expect(workspace.summary.findings).toBe(3);
      expect(finding.items).toEqual(["src/index.ts: ./missing-a"]);
      expect(finding.totalItems).toBe(3);
      expect(finding.omittedItems).toBe(2);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("limits displayed TOON and text finding items", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-max-show-render-");

    try {
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import "./missing-a";\nimport "./missing-b";\n\nexport const value = 1;\n`,
        "utf8",
      );

      const toonReport = runReportForDir(tempProject, "toon", ["--max-show-issues", "1"]);
      const textReport = runReportForDir(tempProject, "text", ["--max-show-issues", "1"]);
      const markdownReport = runReportForDir(tempProject, "markdown", ["--max-show-issues", "1"]);

      expect(toonReport).toContain("totalItems=2");
      expect(toonReport).toContain("omittedItems=1");
      expect(textReport).toContain("... 1 more");
      expect(markdownReport).toContain("- ... 1 more");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("renders a SARIF report", () => {
    const report = JSON.parse(runReport("unused-files-project", "sarif"));

    expect(report.version).toBe("2.1.0");
    expect(report.runs[0].tool.driver.name).toBe("Sadrazam");
    expect(report.runs[0].results).toEqual([
      expect.objectContaining({
        ruleId: "unused-files",
        level: "warning",
        message: { text: "Unused files: src/unused.ts" },
      }),
    ]);
  });

  it("keeps SARIF results untruncated when max show issues is set", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-max-show-sarif-");

    try {
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import "./missing-a";\nimport "./missing-b";\nimport "./missing-c";\n\nexport const value = 1;\n`,
        "utf8",
      );

      const report = JSON.parse(runReportForDir(tempProject, "sarif", ["--max-show-issues", "1"]));
      const unresolvedResults = report.runs[0].results.filter((entry: { ruleId: string }) => entry.ruleId === "unresolved-imports");

      expect(unresolvedResults).toHaveLength(3);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects invalid max show issue values", () => {
    for (const value of ["0", "-1", "abc"]) {
      try {
        execFileSync("node", [cliPath, path.join(rootDir, "test", "fixtures", "config-project"), "--max-show-issues", value], {
          cwd: rootDir,
          encoding: "utf8",
          stdio: "pipe",
        });
        throw new Error("Expected command to fail");
      } catch (error) {
        const typedError = error as { stderr?: string; status?: number };
        expect(typedError.status).toBe(1);
        expect(typedError.stderr).toContain("--max-show-issues expects a positive integer.");
      }
    }
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

  it("removes unused dependencies and devDependencies when fix mode is enabled", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "sadrazam-fix-"));
    const tempProject = path.join(tempRoot, "project");

    cpSync(path.join(rootDir, "test", "fixtures", "config-project"), tempProject, { recursive: true });

    try {
      const packagePath = path.join(tempProject, "package.json");
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };

      packageJson.dependencies.react = "^19.0.0";
      packageJson.devDependencies.eslint = "^9.0.0";

      writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}
`, "utf8");
      writeFileSync(
        path.join(tempProject, "sadrazam.json"),
        `${JSON.stringify({ reporter: "json" }, null, 2)}\n`,
        "utf8",
      );

      const report = runJsonReportForDir(tempProject, ["--fix"]);
      const updatedPackageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      expect(report.mode.fix).toBe(true);
      expect(report.appliedFixes).toEqual([
        {
          packagePath,
          removedDependencies: ["react"],
          removedDevDependencies: ["eslint"],
          addedDevDependencies: [],
          formattedFiles: [],
        },
      ]);
      expect(report.workspaces[0].findings).toEqual([]);
      expect(updatedPackageJson.dependencies).toEqual({ commander: "^14.0.0" });
      expect(updatedPackageJson.devDependencies).toEqual({
        tsx: "^4.21.0",
        typescript: "^5.9.3",
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("formats modified package.json files when format mode is enabled", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "sadrazam-format-"));
    const tempProject = path.join(tempRoot, "project");

    cpSync(path.join(rootDir, "test", "fixtures", "config-project"), tempProject, { recursive: true });

    try {
      const packagePath = path.join(tempProject, "package.json");
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
        scripts: Record<string, string>;
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };

      packageJson.scripts = {
        dev: packageJson.scripts.dev,
        build: packageJson.scripts.build,
      };
      packageJson.dependencies = {
        react: "^19.0.0",
        commander: packageJson.dependencies.commander,
      };
      packageJson.devDependencies = {
        typescript: packageJson.devDependencies.typescript,
        eslint: "^9.0.0",
        tsx: packageJson.devDependencies.tsx,
      };

      writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}
`, "utf8");
      writeFileSync(
        path.join(tempProject, "sadrazam.json"),
        `${JSON.stringify({ reporter: "json" }, null, 2)}
`,
        "utf8",
      );

      const report = runJsonReportForDir(tempProject, ["--fix", "--format"]);
      const formattedPackageJsonText = readFileSync(packagePath, "utf8");

      expect(report.mode.fix).toBe(true);
      expect(report.mode.format).toBe(true);
      expect(report.appliedFixes).toEqual([
        {
          packagePath,
          removedDependencies: ["react"],
          removedDevDependencies: ["eslint"],
          addedDevDependencies: [],
          formattedFiles: [packagePath],
        },
      ]);
      expect(formattedPackageJsonText.indexOf('"build"')).toBeLessThan(formattedPackageJsonText.indexOf('"dev"'));
      expect(formattedPackageJsonText.indexOf('"commander"')).toBeLessThan(formattedPackageJsonText.indexOf('"react"') === -1 ? formattedPackageJsonText.length : formattedPackageJsonText.indexOf('"react"'));
      expect(formattedPackageJsonText.indexOf('"tsx"')).toBeLessThan(formattedPackageJsonText.indexOf('"typescript"'));
      expect(formattedPackageJsonText).not.toContain('"react"');
      expect(formattedPackageJsonText).not.toContain('"eslint"');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("adds missing packages to devDependencies when fix mode is enabled", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "sadrazam-fix-missing-"));
    const tempProject = path.join(tempRoot, "project");

    cpSync(path.join(rootDir, "test", "fixtures", "config-project"), tempProject, { recursive: true });

    try {
      const packagePath = path.join(tempProject, "package.json");
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };

      // Remove commander so it becomes a "missing" package
      delete packageJson.dependencies.commander;
      // Also remove react (unused) so we test both operations together
      writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
      writeFileSync(
        path.join(tempProject, "sadrazam.json"),
        `${JSON.stringify({ reporter: "json" }, null, 2)}\n`,
        "utf8",
      );

      const report = runJsonReportForDir(tempProject, ["--fix"]);
      const updatedPackageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      expect(report.mode.fix).toBe(true);
      expect(report.appliedFixes[0].addedDevDependencies).toEqual(["commander"]);
      // commander added with "*" placeholder version
      expect(updatedPackageJson.devDependencies?.["commander"]).toBe("*");
      // after fix, no missing findings remain
      expect(
        report.workspaces[0].findings.filter((f: { type: string }) => f.type === "missing"),
      ).toEqual([]);
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

  it("resolves tsconfig path aliases and does not report them as missing packages", () => {
    const report = runJsonReport("alias-project");
    const workspace = report.workspaces[0];

    // @/utils/greet, ~/utils/farewell, and fallback path targets should resolve locally
    expect(workspace.findings).toEqual([]);
    expect(workspace.externalImports).toEqual(["commander"]);
    // aliased files should be reachable, not reported as unused
    expect(workspace.unusedFiles).toEqual([]);
  });

  it("resolves TypeScript source files from explicit JavaScript extension imports", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "sadrazam-oxc-resolver-"));
    const tempProject = path.join(tempRoot, "project");

    try {
      mkdirSync(path.join(tempProject, "src"), { recursive: true });
      writeFileSync(
        path.join(tempProject, "package.json"),
        `${JSON.stringify({ name: "oxc-resolver-project", version: "1.0.0", type: "module" }, null, 2)}\n`,
        "utf8",
      );
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import { used } from "./lib.js";\n\nexport const value = used;\n`,
        "utf8",
      );
      writeFileSync(path.join(tempProject, "src", "lib.ts"), `export const used = 1;\n`, "utf8");

      const report = runJsonReportForDir(tempProject);
      const workspace = report.workspaces[0];

      expect(workspace.findings).toEqual([]);
      expect(workspace.unusedFiles).toEqual([]);
      expect(workspace.unusedExports).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("treats package imports resolved to source files as local", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "sadrazam-package-imports-"));
    const tempProject = path.join(tempRoot, "project");

    try {
      mkdirSync(path.join(tempProject, "src"), { recursive: true });
      writeFileSync(
        path.join(tempProject, "package.json"),
        `${JSON.stringify(
          {
            name: "package-imports-project",
            version: "1.0.0",
            type: "module",
            imports: {
              "#utils": "./src/utils.ts",
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import { util } from "#utils";\n\nexport const value = util;\n`,
        "utf8",
      );
      writeFileSync(path.join(tempProject, "src", "utils.ts"), `export const util = 1;\n`, "utf8");

      const report = runJsonReportForDir(tempProject);
      const workspace = report.workspaces[0];

      expect(workspace.findings).toEqual([]);
      expect(workspace.externalImports).toEqual([]);
      expect(workspace.unusedFiles).toEqual([]);
      expect(workspace.unusedExports).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports unresolved relative local imports", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-unresolved-relative-");

    try {
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import "./missing";\n\nexport const value = 1;\n`,
        "utf8",
      );

      const report = runJsonReportForDir(tempProject);
      const workspace = report.workspaces[0];

      expect(workspace.findings).toContainEqual({
        type: "unresolved-imports",
        title: "Unresolved local imports",
        items: ["src/index.ts: ./missing"],
      });
      expect(workspace.unresolvedImports).toEqual(["src/index.ts: ./missing"]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not report valid relative imports as unresolved", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-valid-relative-");

    try {
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import { util } from "./utils";\n\nexport const value = util;\n`,
        "utf8",
      );
      writeFileSync(path.join(tempProject, "src", "utils.ts"), `export const util = 1;\n`, "utf8");

      const report = runJsonReportForDir(tempProject);

      expect(report.workspaces[0].findings).toEqual([]);
      expect(report.workspaces[0].unresolvedImports).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports unresolved package imports without treating them as missing packages", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-unresolved-package-import-");

    try {
      const packagePath = path.join(tempProject, "package.json");
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as Record<string, unknown>;
      packageJson.imports = { "#utils": "./src/utils.ts" };
      writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import { util } from "#utils";\nimport "#missing";\n\nexport const value = util;\n`,
        "utf8",
      );
      writeFileSync(path.join(tempProject, "src", "utils.ts"), `export const util = 1;\n`, "utf8");

      const report = runJsonReportForDir(tempProject);
      const workspace = report.workspaces[0];

      expect(workspace.unresolvedImports).toEqual(["src/index.ts: #missing"]);
      expect(workspace.externalImports).toEqual([]);
      expect(workspace.findings).toEqual([
        {
          type: "unresolved-imports",
          title: "Unresolved local imports",
          items: ["src/index.ts: #missing"],
        },
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not report bare packages as unresolved imports", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-bare-package-");

    try {
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import React from "react";\n\nexport const value = React;\n`,
        "utf8",
      );

      const report = runJsonReportForDir(tempProject);
      const workspace = report.workspaces[0];

      expect(workspace.unresolvedImports).toEqual([]);
      expect(workspace.findings).toContainEqual({
        type: "missing",
        title: "Missing from package.json",
        items: ["react"],
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("suppresses unresolved import findings when excluded", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-exclude-unresolved-");

    try {
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import "./missing";\n\nexport const value = 1;\n`,
        "utf8",
      );

      const report = runJsonReportForDir(tempProject, ["--exclude", "unresolved-imports"]);

      expect(report.workspaces[0].unresolvedImports).toEqual(["src/index.ts: ./missing"]);
      expect(report.workspaces[0].findings).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("explains unresolved import findings with source file context", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-explain-unresolved-");

    try {
      writeFileSync(
        path.join(tempProject, "src", "index.ts"),
        `import "./missing";\n\nexport const value = 1;\n`,
        "utf8",
      );

      const report = runJsonReportForDir(tempProject, ["--explain", "unresolved-imports"]);
      const explain = report.workspaces[0].explain;

      expect(explain.type).toBe("unresolved-imports");
      expect(explain.items).toEqual([
        {
          item: "src/index.ts: ./missing",
          reason: "Specifier looks local but could not be resolved to a scanned source file.",
          importedBy: ["src/index.ts"],
        },
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects unsupported explain finding types", () => {
    try {
      execFileSync("node", [cliPath, path.join(rootDir, "test", "fixtures", "config-project"), "--explain", "nope"], {
        cwd: rootDir,
        encoding: "utf8",
        stdio: "pipe",
      });
      throw new Error("Expected command to fail");
    } catch (error) {
      const typedError = error as { stderr?: string; status?: number };
      expect(typedError.status).toBe(1);
      expect(typedError.stderr).toContain('Unsupported finding type "nope"');
    }
  });

  it("filters built-in modules and maps known script binaries to package names", () => {
    const report = runJsonReport("cjs-project");
    const workspace = report.workspaces[0];

    expect(workspace.findings).toEqual([]);
    expect(workspace.summary.scriptCommandPackages).toEqual(["markdownlint-cli", "standard"]);
    expect(workspace.externalImports).toEqual(["chalk", "commander", "markdownlint-cli", "standard"]);
  });






  it("preprocesses findings with package, file, and export patterns", () => {
    const report = runJsonReport("preprocessor-project");
    const workspace = report.workspaces[0];

    expect(workspace.findings).toEqual([]);
    expect(workspace.unusedFiles).toEqual(["src/generated.ts"]);
    expect(workspace.unusedExports).toEqual(["src/lib.ts: ignoredHelper"]);
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

    expect(workspace.summary.activePlugins).toEqual(["inputs", "typescript", "vite"]);
    expect(workspace.findings).toEqual([]);
    expect(workspace.externalImports).toEqual(["commander", "typescript", "vite"]);
  });

  it("discovers frontend and test tool plugins from scripts, config files, and dependencies", () => {
    const report = runJsonReport("plugin-depth-project");
    const workspace = report.workspaces[0];

    expect(workspace.summary.activePlugins).toEqual([
      "astro",
      "cypress",
      "eslint",
      "jest",
      "next",
      "playwright",
      "prettier",
      "rollup",
      "storybook",
      "sveltekit",
      "tailwind",
      "typescript",
      "vite",
      "vitest",
      "webpack",
    ]);
    expect(workspace.findings).toEqual([]);
    expect(workspace.externalImports).toEqual(expect.arrayContaining([
      "@astrojs/mdx",
      "@next/bundle-analyzer",
      "@playwright/test",
      "@rollup/plugin-node-resolve",
      "@storybook/react-vite",
      "@sveltejs/adapter-auto",
      "@sveltejs/kit",
      "@tailwindcss/forms",
      "@typescript-eslint/parser",
      "@vitejs/plugin-react",
      "@vitest/coverage-istanbul",
      "astro",
      "cypress",
      "eslint",
      "eslint-config-prettier",
      "eslint-plugin-react-hooks",
      "html-webpack-plugin",
      "jest",
      "next",
      "prettier",
      "prettier-plugin-tailwindcss",
      "rollup",
      "storybook",
      "tailwindcss",
      "ts-jest",
      "typescript",
      "typescript-plugin-css-modules",
      "vite",
      "vitest",
      "webpack",
    ]));
  });

  it("includes plugin contribution details in debug JSON output", () => {
    const report = runJsonReport("plugin-depth-project", ["--debug"]);
    const pluginDetails = report.workspaces[0].debug.pluginDetails;
    const vite = pluginDetails.find((detail: { name: string }) => detail.name === "vite");
    const eslint = pluginDetails.find((detail: { name: string }) => detail.name === "eslint");

    expect(vite).toEqual(expect.objectContaining({
      activation: ["dependency", "script"],
      packages: ["vite"],
    }));
    expect(vite.fileEntries).toContain("vite.config.ts");
    expect(eslint).toEqual(expect.objectContaining({
      activation: ["dependency", "script"],
    }));
    expect(eslint.packages).toEqual(expect.arrayContaining([
      "@typescript-eslint/parser",
      "eslint",
      "eslint-config-prettier",
      "eslint-plugin-react-hooks",
    ]));
  });

  it("allows plugin config to disable automatic plugin analysis", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-plugin-disable-");

    try {
      writeFileSync(
        path.join(tempProject, "package.json"),
        `${JSON.stringify({
          name: "sadrazam-plugin-disable",
          version: "1.0.0",
          scripts: {
            dev: "vite --config ./vite.config.ts",
          },
          dependencies: {
            vite: "^7.0.0",
          },
        }, null, 2)}\n`,
      );
      writeFileSync(path.join(tempProject, "vite.config.ts"), "import { defineConfig } from 'vite';\nexport default defineConfig({});\n");
      writeFileSync(path.join(tempProject, "sadrazam.json"), `${JSON.stringify({ plugins: { vite: false } }, null, 2)}\n`);

      const report = runJsonReportForDir(tempProject);
      expect(report.workspaces[0].summary.activePlugins).toEqual([]);
      expect(report.workspaces[0].externalImports).toEqual(["vite"]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("allows plugin config to force plugins and add config and entry overrides", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-plugin-force-");

    try {
      mkdirSync(path.join(tempProject, "custom"), { recursive: true });
      writeFileSync(
        path.join(tempProject, "package.json"),
        `${JSON.stringify({
          name: "sadrazam-plugin-force",
          version: "1.0.0",
          dependencies: {
            "@vitejs/plugin-react": "^5.0.0",
            vite: "^7.0.0",
          },
        }, null, 2)}\n`,
      );
      writeFileSync(
        path.join(tempProject, "custom", "vite.config.ts"),
        "import react from '@vitejs/plugin-react';\nimport { defineConfig } from 'vite';\nexport default defineConfig({ plugins: [react()] });\n",
      );
      writeFileSync(path.join(tempProject, "custom", "entry.ts"), "export const entry = true;\n");
      writeFileSync(
        path.join(tempProject, "sadrazam.json"),
        `${JSON.stringify({
          plugins: {
            vite: {
              config: "custom/vite.config.ts",
              entry: "custom/entry.ts",
            },
          },
        }, null, 2)}\n`,
      );

      const report = runJsonReportForDir(tempProject);
      expect(report.workspaces[0].summary.activePlugins).toEqual(["vite"]);
      expect(report.workspaces[0].findings).toEqual([]);
      expect(report.workspaces[0].externalImports).toEqual(["@vitejs/plugin-react", "vite"]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("detects GitHub Actions workflow and local action usage", () => {
    const report = runJsonReport("github-actions-project", ["--debug"]);
    const workspace = report.workspaces[0];
    const githubActions = workspace.debug.pluginDetails.find((detail: { name: string }) => detail.name === "github-actions");

    expect(workspace.summary.activePlugins).toEqual(["eslint", "github-actions", "playwright"]);
    expect(workspace.externalImports).toEqual([
      "@playwright/test",
      "eslint",
      "tsx",
    ]);
    expect(workspace.findings).toEqual([
      {
        type: "unused-dependencies",
        title: "Unused dependencies",
        items: ["unused-package"],
      },
    ]);
    expect(workspace.summary.scriptEntryFiles).toEqual(expect.arrayContaining([
      "scripts/check.ts",
      "checkout-dir/scripts/from-checkout.js",
      "scripts/multiline.js",
      "workspace/scripts/from-working-dir.js",
      ".github/actions/node-action/pre.js",
      ".github/actions/node-action/main.js",
      ".github/actions/node-action/post.js",
    ]));
    expect(githubActions).toEqual(expect.objectContaining({
      activation: ["config-file"],
      packages: ["@playwright/test", "eslint", "tsx"],
    }));
  });

  it("allows GitHub Actions plugin config to disable automatic analysis", () => {
    const { tempRoot, tempProject } = createTempProject("sadrazam-github-actions-disable-");

    try {
      mkdirSync(path.join(tempProject, ".github", "workflows"), { recursive: true });
      writeFileSync(
        path.join(tempProject, "package.json"),
        `${JSON.stringify({
          name: "sadrazam-github-actions-disable",
          version: "1.0.0",
          dependencies: {
            eslint: "^9.0.0",
          },
        }, null, 2)}\n`,
      );
      writeFileSync(
        path.join(tempProject, ".github", "workflows", "ci.yml"),
        "jobs:\n  test:\n    steps:\n      - run: pnpm eslint\n",
      );
      writeFileSync(
        path.join(tempProject, "sadrazam.json"),
        `${JSON.stringify({ plugins: { "github-actions": false } }, null, 2)}\n`,
      );

      const report = runJsonReportForDir(tempProject);
      expect(report.workspaces[0].summary.activePlugins).not.toContain("github-actions");
      expect(report.workspaces[0].findings).toEqual([
        {
          type: "unused-dependencies",
          title: "Unused dependencies",
          items: ["eslint"],
        },
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
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

  it("reports duplicate export aliases in reachable files", () => {
    const report = runJsonReport("duplicate-exports-project");
    const workspace = report.workspaces[0];

    expect(workspace.findings).toEqual([
      {
        type: "unused-exports",
        title: "Unused exports",
        items: [
          "src/default-handler.ts: handler",
          "src/helpers.ts: isAliasCopy",
        ],
      },
      {
        type: "duplicate-exports",
        title: "Duplicate exports",
        items: [
          "src/default-handler.ts: handler|default",
          "src/helpers.ts: isUntagged|isUntaggedAlias",
        ],
      },
    ]);
    expect(workspace.duplicateExports).toEqual([
      "src/default-handler.ts: handler|default",
      "src/helpers.ts: isUntagged|isUntaggedAlias",
    ]);
  });

  it("filters duplicate export findings with include and exclude", () => {
    const included = runJsonReport("duplicate-exports-project", ["--include", "duplicate-exports"]);
    const excluded = runJsonReport("duplicate-exports-project", ["--exclude", "duplicate-exports"]);

    expect(included.workspaces[0].findings).toEqual([
      {
        type: "duplicate-exports",
        title: "Duplicate exports",
        items: [
          "src/default-handler.ts: handler|default",
          "src/helpers.ts: isUntagged|isUntaggedAlias",
        ],
      },
    ]);
    expect(excluded.workspaces[0].findings.some((finding: { type: string }) => finding.type === "duplicate-exports")).toBe(false);
  });

  it("explains duplicate export findings", () => {
    const report = runJsonReport("duplicate-exports-project", ["--explain", "duplicate-exports"]);

    expect(report.workspaces[0].explain).toEqual({
      type: "duplicate-exports",
      entryFiles: [],
      items: [
        {
          file: "src/default-handler.ts",
          symbols: ["handler", "default"],
        },
        {
          file: "src/helpers.ts",
          symbols: ["isUntagged", "isUntaggedAlias"],
        },
      ],
    });
  });

  it("ignores tagged exports in unused export findings", () => {
    const report = runJsonReport("jsdoc-tags-project");
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

  it("explains unused-files findings with entry files and reason", () => {
    const report = runJsonReport("unused-files-project", ["--explain", "unused-files"]);
    const explain = report.workspaces[0].explain;

    expect(explain.type).toBe("unused-files");
    expect(explain.items).toHaveLength(1);
    expect(explain.items[0].item).toBe("src/unused.ts");
    expect(explain.items[0].reason).toContain("entry point");
  });

  it("explains unused-exports findings with import trace", () => {
    const report = runJsonReport("unused-exports-project", ["--explain", "unused-exports"]);
    const explain = report.workspaces[0].explain;

    expect(explain.type).toBe("unused-exports");
    expect(explain.items).toHaveLength(1);
    expect(explain.items[0].item).toBe("src/lib.ts: unusedHelper");
    expect(explain.items[0].reason).toContain("not imported");
  });

  it("explains unused-dependencies with import locations", () => {
    const report = runJsonReport("config-project", ["--explain", "unused-dependencies"]);
    const explain = report.workspaces[0].explain;

    expect(explain.type).toBe("unused-dependencies");
    // config-project has react as unused dep
    expect(explain.items.some((i: { item: string }) => i.item === "react")).toBe(true);
    const reactEntry = explain.items.find((i: { item: string }) => i.item === "react");
    expect(reactEntry.importedBy).toEqual([]);
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
