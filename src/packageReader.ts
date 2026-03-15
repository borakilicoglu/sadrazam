import { readFile } from "node:fs/promises";
import path from "node:path";

export interface PackageMetadata {
  packagePath: string;
  dependencies: Set<string>;
}

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export async function readPackageMetadata(rootDir: string): Promise<PackageMetadata> {
  const packagePath = await findNearestPackageJson(rootDir);
  const packageJson = JSON.parse(
    await readFile(packagePath, "utf8"),
  ) as PackageJsonShape;

  const dependencies = new Set<string>([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ]);

  return { packagePath, dependencies };
}

async function findNearestPackageJson(startDir: string): Promise<string> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, "package.json");

    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch (error) {
      const typedError = error as NodeJS.ErrnoException;

      if (typedError.code !== "ENOENT") {
        throw error;
      }
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(`No package.json found from ${startDir}`);
    }

    currentDir = parentDir;
  }
}
