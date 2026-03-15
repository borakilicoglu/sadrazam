import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

import { findSourceFiles } from "./fileFinder.js";
import { parseImports } from "./importParser.js";
import { readPackageMetadata } from "./packageReader.js";

export interface FileScanResult {
  filePath: string;
  imports: string[];
}

export interface ScanResult {
  rootDir: string;
  packagePath: string;
  files: FileScanResult[];
  externalImports: string[];
  missingPackages: string[];
}

export async function scanProject(rootDir: string): Promise<ScanResult> {
  const absoluteRoot = path.resolve(rootDir);
  const [files, packageMetadata] = await Promise.all([
    findSourceFiles(absoluteRoot),
    readPackageMetadata(absoluteRoot),
  ]);

  const fileResults = await Promise.all(
    files.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      const imports = parseImports(source).map((entry) => entry.specifier);

      return {
        filePath,
        imports,
      };
    }),
  );

  const externalImports = collectExternalImports(fileResults);
  const missingPackages = externalImports.filter(
    (name) => !isBuiltinPackage(name) && !packageMetadata.dependencies.has(name),
  );

  return {
    rootDir: absoluteRoot,
    packagePath: packageMetadata.packagePath,
    files: fileResults,
    externalImports,
    missingPackages,
  };
}

function collectExternalImports(files: FileScanResult[]): string[] {
  const packages = new Set<string>();

  for (const file of files) {
    for (const specifier of file.imports) {
      if (isExternalSpecifier(specifier)) {
        packages.add(getPackageName(specifier));
      }
    }
  }

  return [...packages].sort();
}

function isExternalSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !path.isAbsolute(specifier);
}

function getPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }

  const [name] = specifier.split("/");
  return name ?? specifier;
}

function isBuiltinPackage(packageName: string): boolean {
  return builtinModules.includes(packageName) || builtinModules.includes(packageName.replace(/^node:/, ""));
}
