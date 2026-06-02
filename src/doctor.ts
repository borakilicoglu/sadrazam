import path from "node:path";

import pc from "picocolors";

import { resolveCatalogInputs } from "./catalog.js";
import { getConfigurationHints } from "./configHints.js";
import { loadSadrazamConfig, type SadrazamConfig } from "./config.js";
import { getActiveFindings, type FindingRules } from "./findings.js";
import { SUPPORTED_PLUGIN_NAMES } from "./plugins.js";
import {
  SUPPORTED_FINDING_TYPES,
  SUPPORTED_REPORTERS,
  type FindingType,
  type ReportWorkspace,
} from "./reporters.js";
import { scanProject } from "./scan.js";
import { discoverWorkspaces } from "./workspaceFinder.js";

const STRING_ARRAY_KEYS = [
  "include",
  "exclude",
  "workspace",
  "ignorePackages",
  "allowUnusedDependencies",
  "allowUnusedDevDependencies",
  "allowMissingPackages",
  "allowMisplacedDevDependencies",
] as const;

export async function runDoctor(targetDir: string): Promise<number> {
  try {
    const absoluteDir = path.resolve(targetDir);
    const loadedConfig = await loadSadrazamConfig(absoluteDir);
    const errors = validateConfig(loadedConfig.config);

    console.log(pc.bold("sadrazam doctor"));
    console.log(`Config source: ${loadedConfig.source}`);

    if (loadedConfig.source === "defaults") {
      console.log(pc.green("OK: no config file found; using defaults."));
      return 0;
    }

    if (errors.length > 0) {
      printList("Errors", errors, pc.red);
      return 1;
    }

    const { workspaces } = await discoverWorkspaces(absoluteDir, loadedConfig.config.workspace ?? []);
    const workspaceReports = await collectDoctorWorkspaceReports(workspaces, loadedConfig.config);
    const hints = getConfigurationHints(loadedConfig.config, workspaceReports);

    if (hints.length > 0) {
      printList("Hints", hints, pc.yellow);
      return 1;
    }

    console.log(pc.green("OK: config is valid."));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(pc.red(`Error: ${message}`));
    return 1;
  }
}

function validateConfig(config: SadrazamConfig): string[] {
  const errors: string[] = [];

  if (config.reporter !== undefined && !SUPPORTED_REPORTERS.includes(config.reporter)) {
    errors.push(
      `reporter "${String(config.reporter)}" is not supported. Supported reporters: ${SUPPORTED_REPORTERS.join(", ")}.`,
    );
  }

  for (const key of STRING_ARRAY_KEYS) {
    validateStringArray(config, key, errors);
  }

  validateFindingTypes("include", config.include, errors);
  validateFindingTypes("exclude", config.exclude, errors);

  if (config.maxShowIssues !== undefined && !isPositiveInteger(config.maxShowIssues)) {
    errors.push("maxShowIssues must be a positive integer.");
  }

  if (config.inputs !== undefined) {
    if (!isRecord(config.inputs)) {
      errors.push("inputs must be an object.");
    } else {
      validateNestedStringArray(config.inputs, "inputs.entryFiles", "entryFiles", errors);
      validateNestedStringArray(config.inputs, "inputs.packageNames", "packageNames", errors);
    }
  }

  if (config.plugins !== undefined) {
    validatePlugins(config.plugins, errors);
  }

  return errors.sort();
}

async function collectDoctorWorkspaceReports(
  workspaces: Awaited<ReturnType<typeof discoverWorkspaces>>["workspaces"],
  config: SadrazamConfig,
): Promise<ReportWorkspace[]> {
  const rules: FindingRules = {
    include: config.include ?? [],
    exclude: config.exclude ?? [],
    ignorePackages: [],
    allowUnusedDependencies: [],
    allowUnusedDevDependencies: [],
    allowMissingPackages: [],
    allowMisplacedDevDependencies: [],
    preprocessors: {
      packagePatterns: config.preprocessors?.packagePatterns ?? [],
      filePatterns: config.preprocessors?.filePatterns ?? [],
      exportPatterns: config.preprocessors?.exportPatterns ?? [],
    },
  };

  return Promise.all(
    workspaces.map(async (workspace) => {
      const result = await scanProject(workspace.dir, {
        production: Boolean(config.production),
        strict: Boolean(config.strict),
        ...(config.inputs ? { pluginInputs: resolveCatalogInputs(config) } : {}),
        ...(config.plugins ? { plugins: config.plugins } : {}),
        ...(config.jsdocTags?.ignoreExports
          ? { jsdocIgnoreExportTags: config.jsdocTags.ignoreExports }
          : {}),
      });

      return {
        workspace,
        result,
        findings: getActiveFindings(result, rules, Boolean(config.production)),
      };
    }),
  );
}

function validateFindingTypes(
  key: "include" | "exclude",
  values: FindingType[] | undefined,
  errors: string[],
): void {
  for (const value of values ?? []) {
    if (!SUPPORTED_FINDING_TYPES.includes(value)) {
      errors.push(
        `${key} contains unsupported finding type "${String(value)}". Supported finding types: ${SUPPORTED_FINDING_TYPES.join(", ")}.`,
      );
    }
  }
}

function validatePlugins(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("plugins must be an object.");
    return;
  }

  const supported = new Set(SUPPORTED_PLUGIN_NAMES);

  for (const [pluginName, pluginConfig] of Object.entries(value)) {
    if (!supported.has(pluginName)) {
      errors.push(
        `plugins.${pluginName} is not a supported plugin. Supported plugins: ${SUPPORTED_PLUGIN_NAMES.join(", ")}.`,
      );
    }

    if (
      typeof pluginConfig !== "boolean" &&
      !isValidPluginConfigObject(pluginConfig)
    ) {
      errors.push(`plugins.${pluginName} must be a boolean or an object with config and/or entry.`);
    }
  }
}

function isValidPluginConfigObject(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const allowedKeys = new Set(["config", "entry"]);

  for (const [key, entry] of Object.entries(value)) {
    if (!allowedKeys.has(key)) {
      return false;
    }

    if (!isStringOrStringArray(entry)) {
      return false;
    }
  }

  return true;
}

function validateStringArray(
  config: SadrazamConfig,
  key: (typeof STRING_ARRAY_KEYS)[number],
  errors: string[],
): void {
  const value = config[key];

  if (value !== undefined && !isStringArray(value)) {
    errors.push(`${key} must be an array of strings.`);
  }
}

function validateNestedStringArray(
  parent: Record<string, unknown>,
  label: string,
  key: string,
  errors: string[],
): void {
  const value = parent[key];

  if (value !== undefined && !isStringArray(value)) {
    errors.push(`${label} must be an array of strings.`);
  }
}

function printList(title: string, items: string[], color: (value: string) => string): void {
  console.log(color(`${title}:`));
  for (const item of items) {
    console.log(color(`- ${item}`));
  }
}

function isStringOrStringArray(value: unknown): boolean {
  return typeof value === "string" || isStringArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
