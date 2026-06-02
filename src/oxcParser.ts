import { parseSync, type ParseResult, type Span } from "oxc-parser";

import type { FileSymbols, LocalReference, NamespaceMember } from "./symbolParser.js";

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
  const duplicateAliases = new Map<string, Set<string>>();
  const namespaceMembers: NamespaceMember[] = [];
  const memberUsesByObject = collectMemberUsesByObject(result.program);

  for (const staticImport of result.module.staticImports) {
    const specifier = staticImport.moduleRequest.value.trim();

    if (!specifier) {
      continue;
    }

    allSpecifiers.add(specifier);

    if (staticImport.entries.length === 0) {
      continue;
    }

    const namespaceMemberUses = parseOxcNamespaceMemberUses(staticImport.entries, memberUsesByObject);
    references.push({
      specifier,
      importedNames: parseOxcImportNames(staticImport.entries),
      usesAllExports: staticImport.entries.some((entry) => entry.importName.kind === "NamespaceObject"),
      ...(namespaceMemberUses ? { namespaceMemberUses } : {}),
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
  collectOxcExportDeclarations(source, result.program, exportedNames, duplicateAliases, namespaceMembers);

  return {
    allSpecifiers: [...allSpecifiers].sort(),
    localReferences: dedupeReferences(references),
    exportedNames: [...exportedNames].sort(),
    duplicateExportAliases: [...duplicateAliases.entries()]
      .map(([canonical, aliases]) => ({ canonical, aliases: [...aliases].sort() }))
      .sort((left, right) => left.canonical.localeCompare(right.canonical)),
    namespaceMembers: namespaceMembers.sort((left, right) =>
      `${left.namespaceName}.${left.memberName}`.localeCompare(`${right.namespaceName}.${right.memberName}`),
    ),
    ignoredExportNames,
  };
}

function collectOxcExportDeclarations(
  source: string,
  program: unknown,
  exportedNames: Set<string>,
  duplicateAliases: Map<string, Set<string>>,
  namespaceMembers: NamespaceMember[],
): void {
  const candidates: Array<{ alias: string; canonical: string; start: number }> = [];
  const namespaceBodyRanges = collectNamespaceBodyRanges(program);

  visitNode(program, (node) => {
    if (node.type !== "ExportNamedDeclaration" && node.type !== "ExportDefaultDeclaration") {
      return;
    }

    if (isInsideRange(getNodeStart(node), namespaceBodyRanges)) {
      return;
    }

    if (node.type === "ExportNamedDeclaration") {
      const declaration = node.declaration;

      if (!isRecord(declaration)) {
        return;
      }

      if (declaration.type === "VariableDeclaration") {
        const declarations = Array.isArray(declaration.declarations) ? declaration.declarations : [];

        for (const declarator of declarations) {
          if (!isRecord(declarator) || !isIdentifierRecord(declarator.id)) {
            continue;
          }

          const alias = declarator.id.name;
          exportedNames.add(alias);

          if (isIdentifierRecord(declarator.init)) {
            candidates.push({ alias, canonical: declarator.init.name, start: getNodeStart(node) });
          }
        }
        return;
      }

      const id = declaration.id;
      if (
        isIdentifierRecord(id)
        && (
          declaration.type === "FunctionDeclaration"
          || declaration.type === "ClassDeclaration"
          || declaration.type === "TSTypeAliasDeclaration"
          || declaration.type === "TSInterfaceDeclaration"
          || declaration.type === "TSEnumDeclaration"
          || declaration.type === "TSModuleDeclaration"
        )
      ) {
        exportedNames.add(id.name);

        if (declaration.type === "TSModuleDeclaration") {
          collectOxcNamespaceMembers(declaration, id.name, namespaceMembers);
        }
      }
      return;
    }

    const declaration = node.declaration;
    if (isIdentifierRecord(declaration)) {
      exportedNames.add("default");
      candidates.push({ alias: "default", canonical: declaration.name, start: getNodeStart(node) });
    }
  });

  for (const { alias, canonical, start } of candidates) {
    if (alias !== canonical && exportedNames.has(canonical) && !hasAliasJsDocBefore(source, start)) {
      const aliases = duplicateAliases.get(canonical) ?? new Set<string>();
      aliases.add(alias);
      duplicateAliases.set(canonical, aliases);
    }
  }
}

function collectOxcNamespaceMembers(
  declaration: Record<string, unknown>,
  namespaceName: string,
  namespaceMembers: NamespaceMember[],
): void {
  const body = declaration.body;

  if (!isRecord(body)) {
    return;
  }

  const statements = Array.isArray(body.body) ? body.body : [];

  for (const statement of statements) {
    if (!isRecord(statement)) {
      continue;
    }

    if (statement.type === "ExportNamedDeclaration") {
      collectNamedNamespaceMembers(statement, namespaceName, namespaceMembers);
      continue;
    }

    if (statement.type === "ExportDefaultDeclaration") {
      namespaceMembers.push({ namespaceName, memberName: "default" });
    }
  }
}

function collectNamedNamespaceMembers(
  node: Record<string, unknown>,
  namespaceName: string,
  namespaceMembers: NamespaceMember[],
): void {
  const declaration = node.declaration;

  if (isRecord(declaration)) {
    if (declaration.type === "VariableDeclaration") {
      const declarations = Array.isArray(declaration.declarations) ? declaration.declarations : [];

      for (const declarator of declarations) {
        if (isRecord(declarator) && isIdentifierRecord(declarator.id)) {
          namespaceMembers.push({ namespaceName, memberName: declarator.id.name });
        }
      }
      return;
    }

    if (isIdentifierRecord(declaration.id)) {
      namespaceMembers.push({ namespaceName, memberName: declaration.id.name });
      return;
    }
  }

  const entries = Array.isArray(node.specifiers) ? node.specifiers : [];

  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }

    const exportName = parseOxcExportNameFromUnknown(entry.exportName);

    if (exportName) {
      namespaceMembers.push({ namespaceName, memberName: exportName });
    }
  }
}

function parseOxcExportNameFromUnknown(exportName: unknown): string | null {
  if (!isRecord(exportName)) {
    return null;
  }

  if (exportName.kind === "Default") {
    return "default";
  }

  return exportName.kind === "Name" && typeof exportName.name === "string" ? exportName.name : null;
}

function collectMemberUsesByObject(program: unknown): Map<string, Set<string>> {
  const uses = new Map<string, Set<string>>();

  visitNode(program, (node) => {
    if (node.type !== "MemberExpression" || node.computed !== false) {
      return;
    }

    const object = node.object;
    const property = node.property;

    if (!isIdentifierRecord(object) || !isIdentifierRecord(property)) {
      return;
    }

    const members = uses.get(object.name) ?? new Set<string>();
    members.add(property.name);
    uses.set(object.name, members);
  });

  return uses;
}

function parseOxcNamespaceMemberUses(
  entries: ParseResult["module"]["staticImports"][number]["entries"],
  memberUsesByObject: Map<string, Set<string>>,
): LocalReference["namespaceMemberUses"] {
  const uses = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (entry.importName.kind !== "Name" || !entry.importName.name) {
      continue;
    }

    const localName = getOxcImportLocalName(entry) ?? entry.importName.name;
    const memberNames = memberUsesByObject.get(localName);

    if (!memberNames || memberNames.size === 0) {
      continue;
    }

    const existing = uses.get(entry.importName.name) ?? new Set<string>();

    for (const memberName of memberNames) {
      existing.add(memberName);
    }

    uses.set(entry.importName.name, existing);
  }

  if (uses.size === 0) {
    return undefined;
  }

  return [...uses.entries()]
    .map(([namespaceName, memberNames]) => ({
      namespaceName,
      memberNames: [...memberNames].sort(),
    }))
    .sort((left, right) => left.namespaceName.localeCompare(right.namespaceName));
}

function getOxcImportLocalName(
  entry: ParseResult["module"]["staticImports"][number]["entries"][number],
): string | null {
  const localName = "localName" in entry ? entry.localName : null;

  if (isRecord(localName) && typeof localName.name === "string") {
    return localName.name;
  }

  if (isRecord(localName) && typeof localName.value === "string") {
    return localName.value;
  }

  if (typeof localName === "string") {
    return localName;
  }

  return null;
}

function getNodeStart(node: Record<string, unknown>): number {
  return typeof node.start === "number" ? node.start : 0;
}

function getNodeEnd(node: Record<string, unknown>): number {
  return typeof node.end === "number" ? node.end : 0;
}

function collectNamespaceBodyRanges(program: unknown): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  visitNode(program, (node) => {
    if (node.type !== "TSModuleDeclaration" || !isRecord(node.body)) {
      return;
    }

    ranges.push({ start: getNodeStart(node.body), end: getNodeEnd(node.body) });
  });

  return ranges;
}

function isInsideRange(position: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => position > range.start && position < range.end);
}

function hasAliasJsDocBefore(source: string, start: number): boolean {
  const before = source.slice(0, start);
  const match = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  return Boolean(match?.[1]?.includes("@alias"));
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

function isIdentifierRecord(node: unknown): node is Record<string, unknown> & { name: string } {
  return isRecord(node) && node.type === "Identifier" && typeof node.name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
