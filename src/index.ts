import path from "node:path";

import pc from "picocolors";
import { Command } from "commander";

import { scanProject } from "./scan.js";

const program = new Command();

program
  .name("sarraf")
  .description("Scan a project and summarize import usage.")
  .argument("[target]", "directory to scan", ".")
  .action(async (target) => {
    const targetDir = path.resolve(target);
    const result = await scanProject(targetDir);

    console.log(pc.bold(`Scanned: ${result.rootDir}`));
    console.log(`Package file: ${result.packagePath}`);
    console.log(`Files: ${result.files.length}`);
    console.log(`External packages: ${result.externalImports.length}`);

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
  });

program.parseAsync(process.argv);
