import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function loadEnv(path: string): void {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(content))) {
    process.env[key] ??= value;
  }
}
