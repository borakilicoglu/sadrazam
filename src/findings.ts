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
  ];

  return candidates.filter((candidate) => {
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
