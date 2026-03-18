import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const cliPath = path.join(rootDir, "dist", "index.js");

const scenarios = [
  {
    name: "config-project",
    cwd: path.join(rootDir, "test", "fixtures", "config-project"),
    args: ["--reporter", "json"],
    validate(report) {
      assert.equal(report.workspaces.length, 1);
      assert.equal(report.workspaces[0].summary.findings, 0);
    },
  },
  {
    name: "ts-node-types-project",
    cwd: path.join(rootDir, "test", "fixtures", "ts-node-types-project"),
    args: ["--reporter", "json"],
    validate(report) {
      const workspace = report.workspaces[0];
      assert.equal(workspace.summary.findings, 0);
      assert.deepEqual(workspace.externalImports, ["commander", "typescript"]);
    },
  },
  {
    name: "cjs-project",
    cwd: path.join(rootDir, "test", "fixtures", "cjs-project"),
    args: ["--reporter", "json"],
    validate(report) {
      const workspace = report.workspaces[0];
      assert.equal(workspace.summary.findings, 0);
      assert.deepEqual(workspace.summary.scriptCommandPackages, ["markdownlint-cli", "standard"]);
      assert.deepEqual(workspace.externalImports, ["chalk", "commander", "markdownlint-cli", "standard"]);
    },
  },
  {
    name: "monorepo-project",
    cwd: path.join(rootDir, "test", "fixtures", "monorepo-project"),
    args: ["--reporter", "json"],
    validate(report) {
      assert.equal(report.workspaces.length, 2);
      const workspaceNames = report.workspaces.map((workspace) => workspace.workspace.name).sort();
      assert.deepEqual(workspaceNames, ["@acme/shared", "@acme/web"]);
      assert.ok(report.workspaces.every((workspace) => workspace.findings.length === 0));
    },
  },
  {
    name: "plugin-cli-project",
    cwd: path.join(rootDir, "test", "fixtures", "plugin-cli-project"),
    args: ["--reporter", "json"],
    validate(report) {
      const workspace = report.workspaces[0];
      assert.equal(workspace.summary.findings, 0);
      assert.deepEqual(workspace.summary.activePlugins, ["jest", "vite", "vitest"]);
      assert.deepEqual(workspace.externalImports, [
        "@vitejs/plugin-react",
        "jest",
        "ts-jest",
        "vite",
        "vitest",
      ]);
    },
  },
  {
    name: "inputs-project",
    cwd: path.join(rootDir, "test", "fixtures", "inputs-project"),
    args: ["--reporter", "json"],
    validate(report) {
      const workspace = report.workspaces[0];
      assert.equal(workspace.summary.findings, 0);
      assert.deepEqual(workspace.summary.activePlugins, ["inputs"]);
      assert.deepEqual(workspace.externalImports, ["commander", "typescript", "vite"]);
    },
  },
  {
    name: "plugin-project",
    cwd: path.join(rootDir, "test", "fixtures", "plugin-project"),
    args: ["--reporter", "json"],
    validate(report) {
      const workspace = report.workspaces[0];
      assert.equal(workspace.summary.findings, 0);
      assert.deepEqual(workspace.summary.activePlugins, ["eslint", "prettier"]);
      assert.deepEqual(workspace.externalImports, [
        "@typescript-eslint/parser",
        "eslint",
        "eslint-plugin-react-hooks",
        "prettier",
        "prettier-plugin-tailwindcss",
      ]);
    },
  },
  {
    name: "compiler-project",
    cwd: path.join(rootDir, "test", "fixtures", "compiler-project"),
    args: ["--reporter", "json"],
    validate(report) {
      const workspace = report.workspaces[0];
      assert.equal(workspace.summary.findings, 0);
      assert.deepEqual(workspace.externalImports, [
        "@mdx-js/react",
        "astro",
        "clsx",
        "svelte",
        "vue",
      ]);
    },
  },
  {
    name: "unused-files-project",
    cwd: path.join(rootDir, "test", "fixtures", "unused-files-project"),
    args: ["--reporter", "json"],
    validate(report) {
      const workspace = report.workspaces[0];
      assert.equal(workspace.summary.findings, 1);
      assert.deepEqual(workspace.unusedFiles, ["src/unused.ts"]);
    },
  },
  {
    name: "unused-exports-project",
    cwd: path.join(rootDir, "test", "fixtures", "unused-exports-project"),
    args: ["--reporter", "json"],
    validate(report) {
      const workspace = report.workspaces[0];
      assert.equal(workspace.summary.findings, 1);
      assert.deepEqual(workspace.unusedExports, ["src/lib.ts: unusedHelper"]);
    },
  },
];

for (const scenario of scenarios) {
  const report = runScenario(scenario.cwd, scenario.args);
  scenario.validate(report);
  console.log(`ok ${scenario.name}`);
}

function runScenario(cwd, args) {
  let stdout = "";

  try {
    stdout = execFileSync("node", [cliPath, ".", ...args], {
      cwd,
      encoding: "utf8",
    });
  } catch (error) {
    stdout = error.stdout;
  }

  return JSON.parse(stdout);
}
