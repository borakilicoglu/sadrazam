import { describe, expect, it } from "vitest";

import { parseImports } from "../src/importParser.js";
import { parseFileSymbols, parseLocalReferences, parseExportedNames } from "../src/symbolParser.js";

describe("source parsing", () => {
  it("parses OXC-backed TypeScript import and export forms", () => {
    const source = `
import type { TypeOnly } from "types";
import value, { used as renamed } from "values";
import equals = require("equals-package");

const resolved = require.resolve("resolved-package");

export type { PublicType } from "public-types";
export { sourceName as publicName } from "public-values";
export * as namespace from "namespace-package";
export * from "star-package";

export interface LocalType {}
export const localValue = value;
export default renamed;
`;

    expect(parseFileSymbols(source, [])).toEqual({
      allSpecifiers: [
        "equals-package",
        "namespace-package",
        "public-types",
        "public-values",
        "resolved-package",
        "star-package",
        "types",
        "values",
      ],
      localReferences: [
        {
          specifier: "types",
          importedNames: ["TypeOnly"],
          usesAllExports: false,
        },
        {
          specifier: "values",
          importedNames: ["default", "used"],
          usesAllExports: false,
        },
        {
          specifier: "public-types",
          importedNames: ["PublicType"],
          usesAllExports: false,
        },
        {
          specifier: "public-values",
          importedNames: ["sourceName"],
          usesAllExports: false,
        },
        {
          specifier: "namespace-package",
          importedNames: [],
          usesAllExports: true,
        },
        {
          specifier: "star-package",
          importedNames: [],
          usesAllExports: true,
        },
        {
          specifier: "equals-package",
          importedNames: [],
          usesAllExports: true,
        },
        {
          specifier: "resolved-package",
          importedNames: [],
          usesAllExports: true,
        },
      ],
      exportedNames: ["LocalType", "default", "localValue"],
      ignoredExportNames: [],
    });
  });

  it("ignores import, require, and export syntax inside comments and strings", () => {
    const source = `
import { real } from "real-package";

// import "comment-side-effect";
// const fake = require("comment-require");
/*
export { fake } from "comment-export";
import fakeDefault from "comment-import";
*/

const docs = 'import "string-side-effect"; require("string-require"); export { fake } from "string-export";';
export const used = real;
// export const commentedExport = true;
`;

    expect(parseImports(source).map((item) => item.specifier)).toEqual(["real-package"]);
    expect(parseFileSymbols(source, [])).toEqual({
      allSpecifiers: ["real-package"],
      localReferences: [
        {
          specifier: "real-package",
          importedNames: ["real"],
          usesAllExports: false,
        },
      ],
      exportedNames: ["used"],
      ignoredExportNames: [],
    });
    expect(parseLocalReferences(source)).toEqual([
      {
        specifier: "real-package",
        importedNames: ["real"],
        usesAllExports: false,
      },
    ]);
    expect(parseExportedNames(source)).toEqual(["used"]);
  });
});
