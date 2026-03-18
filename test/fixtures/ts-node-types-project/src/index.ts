import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";

export const program = new Command();
export const versionPath = path.join(process.cwd(), "package.json");
export const versionText = fs.readFileSync(versionPath, "utf8");
