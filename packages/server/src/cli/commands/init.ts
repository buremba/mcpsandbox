/**
 * init command - creates 1mcp.config.json (spec §12)
 */

import { writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import kleur from "kleur";
import { DEFAULT_POLICY } from "@onemcp/shared";

const DEFAULT_CONFIG = {
  language: "js",
  npm: {
    dependencies: {},
    lockfile: "",
  },
  policy: DEFAULT_POLICY,
  mcps: [],
  sessionTtlMs: 300000,
  signingKeyPath: ".1mcp/keys/",
  cacheDir: ".1mcp/capsules/",
};

export async function initCommand() {
  const configPath = resolve(process.cwd(), "1mcp.config.json");

  // Check if config already exists
  try {
    await access(configPath);
    console.log(kleur.yellow("⚠ 1mcp.config.json already exists"));
    return;
  } catch {
    // File doesn't exist, continue
  }

  // Write config
  await writeFile(
    configPath,
    JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
    "utf-8"
  );

  console.log(kleur.green("✅ Created 1mcp.config.json"));
  console.log("\nNext steps:");
  console.log("  1. Edit 1mcp.config.json to configure your project");
  console.log("  2. Run: npx 1mcp serve");
}
