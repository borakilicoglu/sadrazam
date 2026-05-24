import { parseSync, type ParseResult, type Span } from "oxc-parser";

import type { FileSymbols, LocalReference } from "./symbolParser.js";

export function parseFileSymbolsWithOxc(
  source: string,
  ignoredExportNames: string[] = [],
  filename = "source.tsx",
): FileSymbols | null {
  let result: ParseResult;

  try {
    result = parseSync(filename, source, { sourceType: "unambiguous" });
  } catch {
    return null;
  }

  if (result.errors.some((error) => error.severity === "Error")) {
    return null;
  }

  const allSpecifiers = new Set<string>();
  const references: LocalReference[] = [];
  const exportedNames = new Set<string>();

  for (const staticImport of result.module.staticImports) {
    const specifier = staticImport.moduleRequest.value.trim();

    if (!specifier) {
      continue;
    }

    allSpecifiers.add(specifier);

    if (staticImport.entries.length === 0) {
      continue;
    }

    references.push({
      specifier,
      importedNames: parseOxcImportNames(staticImport.entries),
      usesAllExports: staticImport.entries.some((entry) => entry.importName.kind === "NamespaceObject"),
    });
  }

  for (const dynamicImport of result.module.dynamicImports) {
    const specifier = readModuleRequest(source, dynamicImport.moduleRequest);

    if (specifier) {
      allSpecifiers.add(specifier);
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  }

  for (const staticExport of result.module.staticExports) {
    for (const entry of staticExport.entries) {
      if (entry.moduleRequest) {
        const specifier = entry.moduleRequest.value.trim();

        if (!specifier) {
          continue;
        }

        allSpecifiers.add(specifier);
        references.push({
          specifier,
          importedNames: parseOxcExportImportNames(entry.importName),
          usesAllExports: entry.importName.kind === "All"
            || entry.importName.kind === "AllButDefault",
        });
        continue;
      }

      const exportName = parseOxcExportName(entry.exportName);

      if (exportName) {
        exportedNames.add(exportName);
      }
    }
  }

  collectCommonJsReferences(result.program, allSpecifiers, references);

  return {
    allSpecifiers: [...allSpecifiers].sort(),
    localReferences: dedupeReferences(references),
    exportedNames: [...exportedNames].sort(),
    ignoredExportNames,
  };
}

function parseOxcImportNames(entries: ParseResult["module"]["staticImports"][number]["entries"]): string[] {
  const names = new Set<string>();

  for (const entry of entries) {
    if (entry.importName.kind === "Default") {
      names.add("default");
    } else if (entry.importName.kind === "Name" && entry.importName.name) {
      names.add(entry.importName.name);
    }
  }

  return [...names].sort();
}

function parseOxcExportImportNames(importName: ParseResult["module"]["staticExports"][number]["entries"][number]["importName"]): string[] {
  return importName.kind === "Name" && importName.name ? [importName.name] : [];
}

function parseOxcExportName(exportName: ParseResult["module"]["staticExports"][number]["entries"][number]["exportName"]): string | null {
  if (exportName.kind === "Default") {
    return "default";
  }

  return exportName.kind === "Name" ? exportName.name : null;
}

function collectCommonJsReferences(
  program: unknown,
  allSpecifiers: Set<string>,
  references: LocalReference[],
): void {
  visitNode(program, (node) => {
    const importEqualsSpecifier = getImportEqualsSpecifier(node);

    if (importEqualsSpecifier) {
      allSpecifiers.add(importEqualsSpecifier);
      references.push({ specifier: importEqualsSpecifier, importedNames: [], usesAllExports: true });
      return;
    }

    if (node.type !== "CallExpression") {
      return;
    }

    const specifier = getRequireCallSpecifier(node);

    if (specifier) {
      allSpecifiers.add(specifier);
      references.push({ specifier, importedNames: [], usesAllExports: true });
    }
  });
}

function getImportEqualsSpecifier(node: Record<string, unknown>): string | null {
  if (node.type !== "TSImportEqualsDeclaration") {
    return null;
  }

  const moduleReference = node.moduleReference;

  if (!isRecord(moduleReference) || moduleReference.type !== "TSExternalModuleReference") {
    return null;
  }

  return getStringLiteralValue(moduleReference.expression);
}

function getRequireCallSpecifier(node: Record<string, unknown>): string | null {
  const args = Array.isArray(node.arguments) ? node.arguments : [];
  const specifier = getStringLiteralValue(args[0]);

  if (!specifier) {
    return null;
  }

  const callee = node.callee;

  if (isIdentifier(callee, "require")) {
    return specifier;
  }

  if (!isRecord(callee) || callee.type !== "MemberExpression" || callee.computed !== false) {
    return null;
  }

  return isIdentifier(callee.object, "require") && isIdentifier(callee.property, "resolve")
    ? specifier
    : null;
}

function readModuleRequest(source: string, span: Span): string | null {
  return unquoteStringLiteral(source.slice(span.start, span.end).trim());
}

function getStringLiteralValue(node: unknown): string | null {
  return isRecord(node) && node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : null;
}

function unquoteStringLiteral(value: string): string | null {
  if (value.length < 2) {
    return null;
  }

  const quote = value[0];
  const endQuote = value[value.length - 1];

  if ((quote !== "\"" && quote !== "'" && quote !== "`") || quote !== endQuote) {
    return null;
  }

  return value.slice(1, -1);
}

function visitNode(node: unknown, visitor: (node: Record<string, unknown>) => void): void {
  if (!isRecord(node)) {
    return;
  }

  visitor(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === "type" || key === "start" || key === "end") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visitNode(item, visitor);
      }
      continue;
    }

    visitNode(value, visitor);
  }
}

function dedupeReferences(references: LocalReference[]): LocalReference[] {
  const seen = new Set<string>();

  return references.filter((reference) => {
    const key = `${reference.specifier}:${reference.usesAllExports}:${reference.importedNames.join(",")}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isIdentifier(node: unknown, name: string): boolean {
  return isRecord(node) && node.type === "Identifier" && node.name === name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
