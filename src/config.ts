import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { FindingType, ReporterType } from "./reporters.js";
import { findNearestPackageJson, readPackageJson } from "./packageReader.js";

export interface SadrazamConfig {
  reporter?: ReporterType;
  include?: FindingType[];
  exclude?: FindingType[];
  workspace?: string[];
  production?: boolean;
  strict?: boolean;
  debug?: boolean;
  performance?: boolean;
  trace?: string;
  ignorePackages?: string[];
  allowUnusedDependencies?: string[];
  allowUnusedDevDependencies?: string[];
  allowMissingPackages?: string[];
  allowMisplacedDevDependencies?: string[];
  ai?: {
    provider?: string;
    model?: string;
  };
}

export interface LoadedSadrazamConfig {
  config: SadrazamConfig;
  source: string;
}

interface PackageJsonWithSadrazam {
  sadrazam?: SadrazamConfig;
}

const CONFIG_FILENAMES = ["sadrazam.json"];

export async function loadSadrazamConfig(startDir: string): Promise<LoadedSadrazamConfig> {
  const packagePath = await findNearestPackageJson(startDir);
  const packageDir = path.dirname(packagePath);

  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.join(packageDir, filename);

    if (await fileExists(configPath)) {
      return {
        config: JSON.parse(await readFile(configPath, "utf8")) as SadrazamConfig,
        source: configPath,
      };
    }
  }

  const packageJson = (await readPackageJson(packagePath)) as PackageJsonWithSadrazam;
  return {
    config: packageJson.sadrazam ?? {},
    source: packageJson.sadrazam ? `${packagePath}#sadrazam` : "defaults",
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
