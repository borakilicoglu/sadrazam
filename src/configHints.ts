import type { SadrazamConfig } from "./config.js";
import type { ScanResult } from "./scan.js";

interface WorkspaceScanLike {
  result: ScanResult;
}

export function getConfigurationHints(
  config: SadrazamConfig,
  workspaces: WorkspaceScanLike[],
): string[] {
  const hints: string[] = [];
  const unusedDependencies = new Set<string>();
  const unusedDevDependencies = new Set<string>();
  const missingPackages = new Set<string>();
  const misplacedDevDependencies = new Set<string>();
  const observedPackages = new Set<string>();

  for (const { result } of workspaces) {
    for (const item of result.unusedDependencies) {
      unusedDependencies.add(item);
      observedPackages.add(item);
    }

    for (const item of result.unusedDevDependencies) {
      unusedDevDependencies.add(item);
      observedPackages.add(item);
    }

    for (const item of result.missingPackages) {
      missingPackages.add(item);
      observedPackages.add(item);
    }

    for (const item of result.misplacedDevDependencies) {
      misplacedDevDependencies.add(item);
      observedPackages.add(item);
    }

    for (const item of result.externalImports) {
      observedPackages.add(item);
    }
  }

  hints.push(
    ...getUnusedRuleHints(
      "ignorePackages",
      config.ignorePackages,
      observedPackages,
      'ignorePackages entry "{name}" has no effect and can be removed.',
    ),
  );
  hints.push(
    ...getUnusedRuleHints(
      "allowUnusedDependencies",
      config.allowUnusedDependencies,
      unusedDependencies,
      'allowUnusedDependencies entry "{name}" has no effect and can be removed.',
    ),
  );
  hints.push(
    ...getUnusedRuleHints(
      "allowUnusedDevDependencies",
      config.allowUnusedDevDependencies,
      unusedDevDependencies,
      'allowUnusedDevDependencies entry "{name}" has no effect and can be removed.',
    ),
  );
  hints.push(
    ...getUnusedRuleHints(
      "allowMissingPackages",
      config.allowMissingPackages,
      missingPackages,
      'allowMissingPackages entry "{name}" has no effect and can be removed.',
    ),
  );
  hints.push(
    ...getUnusedRuleHints(
      "allowMisplacedDevDependencies",
      config.allowMisplacedDevDependencies,
      misplacedDevDependencies,
      'allowMisplacedDevDependencies entry "{name}" has no effect and can be removed.',
    ),
  );

  return hints.sort();
}

function getUnusedRuleHints(
  _ruleName: string,
  values: string[] | undefined,
  activeItems: Set<string>,
  template: string,
): string[] {
  if (!values || values.length === 0) {
    return [];
  }

  return values
    .filter((value) => !activeItems.has(value))
    .map((value) => template.replace("{name}", value));
}
