import type { ActiveFinding, FindingType } from "./reporters.js";
import type { ScanResult } from "./scan.js";

export interface FindingRules {
  include: FindingType[];
  exclude: FindingType[];
  allowUnusedDependencies: string[];
  allowUnusedDevDependencies: string[];
  allowMissingPackages: string[];
  allowMisplacedDevDependencies: string[];
  ignorePackages: string[];
  preprocessors: {
    packagePatterns: string[];
    filePatterns: string[];
    exportPatterns: string[];
  };
}

export function getActiveFindings(
  result: ScanResult,
  rules: FindingRules,
  production: boolean,
): ActiveFinding[] {
  const candidates: ActiveFinding[] = [
    {
      type: "missing",
      title: "Missing from package.json",
      items: filterPackages(result.missingPackages, [
        ...rules.allowMissingPackages,
        ...rules.ignorePackages,
      ]),
    },
    {
      type: "unresolved-imports",
      title: "Unresolved local imports",
      items: result.unresolvedImports,
    },
    {
      type: "unused-dependencies",
      title: "Unused dependencies",
      items: filterPackages(result.unusedDependencies, [
        ...rules.allowUnusedDependencies,
        ...rules.ignorePackages,
      ]),
    },
    {
      type: "unused-devDependencies",
      title: "Unused devDependencies",
      items: production
        ? []
        : filterPackages(result.unusedDevDependencies, [
            ...rules.allowUnusedDevDependencies,
            ...rules.ignorePackages,
          ]),
    },
    {
      type: "misplaced-devDependencies",
      title: "Dev dependencies used in production files",
      items: filterPackages(result.misplacedDevDependencies, [
        ...rules.allowMisplacedDevDependencies,
        ...rules.ignorePackages,
      ]),
    },
    {
      type: "unused-files",
      title: "Unused files",
      items: result.unusedFiles,
    },
    {
      type: "unused-exports",
      title: "Unused exports",
      items: result.unusedExports,
    },
    {
      type: "duplicate-exports",
      title: "Duplicate exports",
      items: result.duplicateExports,
    },
  ];

  const preprocessedCandidates = candidates.map((candidate) => ({
    ...candidate,
    items: applyPreprocessors(candidate.type, candidate.items, rules.preprocessors),
  }));

  return preprocessedCandidates.filter((candidate) => {
    if (rules.include.length > 0 && !rules.include.includes(candidate.type)) {
      return false;
    }

    if (rules.exclude.includes(candidate.type)) {
      return false;
    }

    return candidate.items.length > 0;
  });
}

function filterPackages(items: string[], blocked: string[]): string[] {
  const blockedSet = new Set(blocked);
  return items.filter((item) => !blockedSet.has(item));
}

function applyPreprocessors(
  type: FindingType,
  items: string[],
  preprocessors: FindingRules["preprocessors"],
): string[] {
  if (items.length === 0) {
    return items;
  }

  const patterns = getPatternsForFinding(type, preprocessors);

  if (patterns.length === 0) {
    return items;
  }

  return items.filter((item) => !patterns.some((pattern) => matchesPattern(item, pattern)));
}

function getPatternsForFinding(
  type: FindingType,
  preprocessors: FindingRules["preprocessors"],
): string[] {
  if (type === "unused-files") {
    return preprocessors.filePatterns;
  }

  if (type === "unused-exports" || type === "duplicate-exports") {
    return preprocessors.exportPatterns;
  }

  if (type === "unresolved-imports") {
    return [];
  }

  return preprocessors.packagePatterns;
}

function matchesPattern(value: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[|\{}()[\]^$+?.]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`).test(value);
}
