import { Command } from "commander";
import { greet } from "@/utils/greet";
import { farewell } from "~/utils/farewell";
import { fallback } from "@fallback/utils/fallback";

const cmd = new Command();
console.log(greet("world"));
console.log(farewell("world"));
console.log(fallback("world"));
cmd.parse();
