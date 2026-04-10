import { afterEach, describe, expect, test } from "bun:test";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { cli, createSandbox, fn, mcp, provider, secret } from "../src/index";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.MCPBASH_SECRET;
});

describe("mcpbash", () => {
  test("runs function mappings and built-in shell commands together", async () => {
    const root = createTempDir("mcpbash-fn-");
    const sandbox = await createSandbox({
      filesystem: { mode: "readwrite", root },
      commands: {
        slugify: fn({
          input: { text: "$1" },
          handler: ({ text }: { text: string }) =>
            text.toLowerCase().replace(/\s+/g, "-"),
        }),
      },
    });

    await sandbox.run('printf "hello\\n" > note.txt');
    const result = await sandbox.run('slugify "Hello World"');

    expect(result.stdout).toBe("hello-world");
    expect(await sandbox.fs.read("note.txt")).toBe("hello\n");
  });

  test("does not expose secret env values to generic shell output", async () => {
    const root = createTempDir("mcpbash-secret-");
    process.env.MCPBASH_SECRET = "top-secret";

    const sandbox = await createSandbox({
      filesystem: { mode: "readwrite", root },
      env: {
        PUBLIC_NAME: "mcpbash",
        SECRET_NAME: secret.env("MCPBASH_SECRET"),
      },
      commands: {
        secretcheck: cli({
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write(process.env.SECRET_NAME ?? '')",
          ],
        }),
      },
    });

    const printenv = await sandbox.run("printenv SECRET_NAME");
    const privileged = await sandbox.run("secretcheck");

    expect(printenv.stdout).toBe("");
    expect(privileged.stdout).toBe("[REDACTED]");
  });

  test("blocks denied filesystem paths", async () => {
    const root = createTempDir("mcpbash-fs-");
    const sandbox = await createSandbox({
      filesystem: {
        mode: "readwrite",
        root,
        allow: ["**"],
        deny: ["secrets/**"],
      },
    });

    await sandbox.fs.write("safe.txt", "ok");
    mkdirSync(path.join(root, "secrets"), { recursive: true });
    writeFileSync(path.join(root, "secrets/token.txt"), "blocked", "utf8");

    const blocked = await sandbox.run('cat secrets/token.txt');

    expect(await sandbox.fs.read("safe.txt")).toBe("ok");
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stderr).toContain("No such file or directory");
  });

  test("supports an in-memory filesystem mode", async () => {
    const root = createTempDir("mcpbash-memory-");
    const sandbox = await createSandbox({
      filesystem: {
        mode: "memory",
        root,
      },
      commands: {
        upper: fn({
          input: { path: "$1", text: "$2" },
          async handler(
            { path, text }: { path: string; text: string },
            context
          ) {
            await context.fs.write(path, text.toUpperCase());
            return context.fs.read(path);
          },
        }),
      },
    });

    const write = await sandbox.run('printf "hello\\n" > note.txt');
    const custom = await sandbox.run('upper note2.txt "hello there"');

    expect(write.exitCode).toBe(0);
    expect(await sandbox.fs.read("note.txt")).toBe("hello\n");
    expect(custom.stdout).toBe("HELLO THERE");
    expect(existsSync(path.join(root, "note.txt"))).toBe(false);
    expect(existsSync(path.join(root, "note2.txt"))).toBe(false);
  });

  test("maps MCP commands through the configured invoker", async () => {
    const root = createTempDir("mcpbash-mcp-");

    const server = http.createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/tools/search_repositories") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as { input?: { q?: string } };
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ result: { query: parsed.input?.q } }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("No test server address");
      }

      const sandbox = await createSandbox({
        filesystem: { mode: "readwrite", root },
        network: { allow: [`http://127.0.0.1:${address.port}/`] },
        commands: {
          "github.search": mcp({
            server: `http://127.0.0.1:${address.port}`,
            tool: "search_repositories",
            input: { q: "$1" },
          }),
        },
      });

      const result = await sandbox.run('github.search "lobu ai"');
      expect(result.stdout).toContain('"query": "lobu ai"');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("passes through just-bash execution limits", async () => {
    const root = createTempDir("mcpbash-limits-");
    const sandbox = await createSandbox({
      filesystem: { mode: "readwrite", root },
      bash: {
        executionLimits: {
          maxLoopIterations: 2,
        },
      },
    });

    const result = await sandbox.run("while true; do echo x; done");

    expect(result.exitCode).toBe(126);
    expect(result.stdout).toBe("x\nx\n");
    expect(result.stderr).toContain("too many iterations");
  });

  test("aliases sandbox providers to CLI-backed commands", async () => {
    const root = createTempDir("mcpbash-provider-");
    const sandbox = await createSandbox({
      filesystem: { mode: "readwrite", root },
      commands: {
        "provider.smoke": provider({
          command: process.execPath,
          args: ["-e", "process.stdout.write('provider-ok')"],
        }),
      },
    });

    const result = await sandbox.run("provider.smoke");
    expect(result.stdout).toBe("provider-ok");
  });

  test("supports git as a built-in integration", async () => {
    const root = createTempDir("mcpbash-git-");
    const sandbox = await createSandbox({
      filesystem: { mode: "readwrite", root },
      integrations: { git: true },
    });

    await sandbox.run("git init -q");
    await sandbox.fs.write("README.txt", "demo");

    const status = await sandbox.git?.status(["--short"]);
    expect(status?.stdout).toContain("README.txt");
  });

  test("rejects git integration with in-memory filesystem mode", async () => {
    const root = createTempDir("mcpbash-memory-git-");

    await expect(
      createSandbox({
        filesystem: { mode: "memory", root },
        integrations: { git: true },
      })
    ).rejects.toThrow("integrations.git is not supported");
  });
});
