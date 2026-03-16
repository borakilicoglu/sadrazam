#!/usr/bin/env node

import path from "node:path";

import pc from "picocolors";
import { Command } from "commander";

import { resolveAiConfig, SUPPORTED_AI_PROVIDERS } from "./aiConfig.js";
import { scanProject } from "./scan.js";

const program = new Command();

program
  .name("sarraf")
  .description("Scan a project and summarize import usage.")
  .argument("[target]", "directory to scan", ".")
  .option("--ai", "enable AI-assisted analysis")
  .option("--provider <provider>", `AI provider (${SUPPORTED_AI_PROVIDERS.join(", ")})`)
  .option("--model <model>", "AI model name")
  .action(async (target, options) => {
    try {
      const targetDir = path.resolve(target);
      const aiConfig = resolveAiConfig(options);
      const result = await scanProject(targetDir);

      console.log(pc.bold(`Scanned: ${result.rootDir}`));
      console.log(`Package file: ${result.packagePath}`);
      console.log(`Files: ${result.files.length}`);
      console.log(`External packages: ${result.externalImports.length}`);

      if (aiConfig) {
        console.log("");
        console.log(pc.magenta("AI mode"));
        console.log(`Provider: ${aiConfig.provider}`);
        console.log(`Model: ${aiConfig.model ?? "default"}`);
        console.log("Status: configured");
        console.log("Note: AI result generation is not implemented yet.");
      }

      if (result.externalImports.length > 0) {
        console.log("");
        console.log(pc.cyan("External imports"));

        for (const packageName of result.externalImports) {
          console.log(`- ${packageName}`);
        }
      }

      if (result.missingPackages.length > 0) {
        console.log("");
        console.log(pc.red("Missing from package.json"));

        for (const packageName of result.missingPackages) {
          console.log(`- ${packageName}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(pc.red(`Error: ${message}`));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
