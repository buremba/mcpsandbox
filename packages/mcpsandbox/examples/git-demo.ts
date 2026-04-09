import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { createSandbox } from "../src/index";

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcpsandbox-git-"));

  try {
    const sandbox = await createSandbox({
      name: "git-demo",
      filesystem: { root, writable: true },
      integrations: { git: true },
    });

    await sandbox.run("mkdir src");
    await sandbox.fs.write("src/index.ts", 'export const demo = "mcpsandbox";\n');
    await sandbox.run("git init -q");

    console.log("git commands:", sandbox.commands());
    console.log("git status:", await sandbox.git?.status(["--short"]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

void main();
