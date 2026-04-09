import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { cli, createSandbox, fn } from "../src/index";

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcpsandbox-mixed-"));

  try {
    const sandbox = await createSandbox({
      name: "mixed-demo",
      filesystem: {
        root,
        writable: true,
      },
      commands: {
        slugify: fn({
          input: { text: "$1" },
          handler: ({ text }: { text: string }) =>
            text.toLowerCase().replace(/\s+/g, "-"),
        }),
        upper: cli({
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write((process.argv[1] ?? '').toUpperCase())",
            "$1",
          ],
        }),
      },
    });

    await sandbox.run('printf "demo-file\\n" > note.txt');
    console.log("commands:", sandbox.commands());
    console.log("slugify:", await sandbox.run('slugify "Hello Demo World"'));
    console.log("upper:", await sandbox.run('upper "hello from cli"'));
    console.log("files:", await sandbox.fs.list("/"));
    console.log("note:", await sandbox.fs.read("note.txt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

void main();
