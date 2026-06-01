import { describe, expect, it } from "vitest";

import {
  parseLernaWorkspaceJson,
  parsePnpmWorkspaceYaml,
  parseRushWorkspaceJson,
} from "../src/workspaceFinder.js";

describe("parsePnpmWorkspaceYaml", () => {
  it("parses a basic packages list", () => {
    const yaml = `
packages:
  - packages/**
  - apps/*
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/**", "apps/*"]);
  });

  it("strips single and double quotes from values", () => {
    const yaml = `
packages:
  - "packages/**"
  - 'apps/*'
  - unquoted/*
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/**", "apps/*", "unquoted/*"]);
  });

  it("ignores inline comments", () => {
    const yaml = `
packages:
  - packages/** # all packages
  - apps/*      # all apps
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/**", "apps/*"]);
  });

  it("preserves hash characters inside quoted values", () => {
    const yaml = `
packages:
  - "packages/#internal/**" # internal packages
  - 'apps/#admin/*'
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/#internal/**", "apps/#admin/*"]);
  });

  it("ignores comment-only lines", () => {
    const yaml = `
# workspace config
packages:
  # core packages
  - packages/**
  # apps
  - apps/*
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/**", "apps/*"]);
  });

  it("handles multiple top-level keys without breaking", () => {
    const yaml = `
packages:
  - packages/**
  - apps/*

catalog:
  react: ^18.0.0

catalogMode: default
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/**", "apps/*"]);
  });

  it("returns empty array when packages key is missing", () => {
    const yaml = `
catalog:
  react: ^18.0.0
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(parsePnpmWorkspaceYaml("")).toEqual([]);
  });

  it("handles packages key with no items", () => {
    const yaml = `
packages:

catalog:
  react: ^18.0.0
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual([]);
  });

  it("handles Windows-style line endings", () => {
    const yaml = "packages:\r\n  - packages/**\r\n  - apps/*\r\n";
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/**", "apps/*"]);
  });

  it("handles packages key appearing after other keys", () => {
    const yaml = `
catalogMode: default

packages:
  - packages/**
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/**"]);
  });
});

describe("parseLernaWorkspaceJson", () => {
  it("uses explicit package globs", () => {
    expect(parseLernaWorkspaceJson({ packages: ["packages/*", "apps/*"] })).toEqual(["packages/*", "apps/*"]);
  });

  it("uses the Lerna default package glob when packages are omitted", () => {
    expect(parseLernaWorkspaceJson({ version: "independent" })).toEqual(["packages/*"]);
  });
});

describe("parseRushWorkspaceJson", () => {
  it("uses projectFolder entries", () => {
    expect(parseRushWorkspaceJson({
      projects: [
        { packageName: "@acme/api", projectFolder: "apps/api" },
        { packageName: "@acme/shared", projectFolder: "packages/shared" },
      ],
    })).toEqual(["apps/api", "packages/shared"]);
  });

  it("ignores projects without a projectFolder", () => {
    expect(parseRushWorkspaceJson({ projects: [{ packageName: "@acme/missing" }] })).toEqual([]);
  });
});
