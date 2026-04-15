# mcpbash

Build tiny sandboxes from MCP tools, TypeScript functions, CLIs, and `just-bash`.

`mcpbash` gives you a small shell-first sandbox object. Instead of provisioning a VM or container, you map capabilities into commands and run them through a controlled runtime.

## Install

```bash
pnpm add mcpbash
# or
npm install mcpbash
```

## Why use it?

- Map MCP tools to shell commands
- Map TypeScript functions to shell commands
- Wrap existing binaries
- Choose an in-memory, read-only, or read-write filesystem
- Opt into `git` support when you need it
- Control outbound MCP access with a simple network policy
- Resolve secrets at runtime instead of hardcoding them

## Quick start

This example creates one command, `slugify`, and runs it inside the sandbox.

```ts
import { createSandbox, fn } from "mcpbash";

const sandbox = await createSandbox({
  filesystem: { mode: "memory" },
  commands: {
    slugify: fn({
      input: { text: "$1" },
      handler: ({ text }: { text: string }) =>
        text.toLowerCase().replace(/\s+/g, "-"),
    }),
  },
});

const result = await sandbox.run('slugify "Hello World"');

console.log(result.stdout); // hello-world
console.log(result.exitCode); // 0

await sandbox.dispose();
```

## Common patterns

### Run a real MCP-backed command

This example is fully runnable. It starts a tiny local HTTP server that behaves like an MCP tool endpoint, maps that tool into the sandbox as `repos.search`, and calls it like a shell command.

```ts
import http from "node:http";
import { createSandbox, mcp } from "mcpbash";

async function startToolServer(): Promise<{ url: string; close(): Promise<void> }> {
  return new Promise((resolve) => {
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
        const { input } = JSON.parse(body) as { input?: { q?: string } };
        const query = input?.q ?? "";

        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            result: {
              query,
              repos: [
                `${query}-api`,
                `${query}-web`,
                `${query}-worker`,
              ],
            },
          })
        );
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("failed to start tool server");
      }

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else done();
            });
          }),
      });
    });
  });
}

const toolServer = await startToolServer();

try {
  const sandbox = await createSandbox({
    filesystem: { mode: "memory" },
    network: {
      allow: ["127.0.0.1"],
    },
    commands: {
      "repos.search": mcp({
        server: toolServer.url,
        tool: "search_repositories",
        input: { q: "$1" },
      }),
    },
  });

  const result = await sandbox.run('repos.search "billing"');
  console.log(result.stdout);
  // {
  //   "query": "billing",
  //   "repos": ["billing-api", "billing-web", "billing-worker"]
  // }

  await sandbox.dispose();
} finally {
  await toolServer.close();
}
```

See also: `packages/mcpbash/examples/mcp-demo.ts`

### Wrap a local CLI

```ts
import { cli, createSandbox } from "mcpbash";

const sandbox = await createSandbox({
  commands: {
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

console.log((await sandbox.run('upper "hello"')).stdout); // HELLO
```

### Work in a writable directory with git

```ts
import { createSandbox } from "mcpbash";

const sandbox = await createSandbox({
  filesystem: {
    mode: "readwrite",
    root: "./workspace",
  },
  integrations: {
    git: true,
  },
});

await sandbox.run("git init -q");
await sandbox.fs.write("README.md", "# demo\n");

const status = await sandbox.git?.status(["--short"]);
console.log(status?.stdout);
```

## API at a glance

```ts
import { createSandbox, mcp, fn, cli, provider, secret } from "mcpbash";
```

- `createSandbox(...)` creates a sandbox
- `mcp(...)` maps an MCP tool to a command
- `fn(...)` maps a TypeScript handler to a command
- `cli(...)` wraps a local binary
- `provider(...)` is an alias for `cli(...)` for external runtimes
- `secret.env("NAME")` resolves a secret at runtime
- `sandbox.run(...)` executes a command
- `sandbox.fs` exposes `read`, `write`, `list`, and `exists`
- `sandbox.git` exposes `status`, `diff`, and `log` when git is enabled

## Filesystem modes

- `memory`: isolated in-memory sandbox
- `readonly`: overlay an existing directory without writes
- `readwrite`: back the sandbox with a real directory

## Examples in this repo

- `packages/mcpbash/examples/mixed-demo.ts`
- `packages/mcpbash/examples/mcp-demo.ts`
- `packages/mcpbash/examples/git-demo.ts`
- `packages/mcpbash/examples/benchmark.ts`

Run them:

```bash
pnpm install
pnpm --filter mcpbash demo:mixed
pnpm --filter mcpbash demo:mcp
pnpm --filter mcpbash demo:git
pnpm --filter mcpbash bench
```

## Advanced usage

See [ADVANCED.md](./ADVANCED.md) for:

- filesystem allow/deny rules
- secrets
- network policy
- MCP auth and OAuth patterns
- provider examples with Daytona, Upstash Box, and Docker
- current limitations

## Performance

Local benchmark on April 9, 2026, on an Apple M4 Pro with Bun 1.3.5:

| Operation | Mean | P50 | P95 |
| --- | ---: | ---: | ---: |
| `createSandbox()` | 0.067 ms | 0.040 ms | 0.090 ms |
| built-in shell command (`echo`) | 0.460 ms | 0.406 ms | 0.687 ms |
| mapped `fn(...)` command | 0.350 ms | 0.319 ms | 0.550 ms |
| mapped `provider(...)` command (`true`) | 2.143 ms | 2.038 ms | 3.298 ms |
| mapped `cli(...)` command (`node -e`) | 4.160 ms | 3.878 ms | 7.314 ms |

The important takeaway is category-level: `mcpbash` stays on the local fast path. It does not provision a VM, container, or remote session just to dispatch a mapped command, so startup and dispatch stay in the low-millisecond range.

Run the benchmark locally:

```bash
pnpm --filter mcpbash bench
```

## Development

```bash
pnpm install
pnpm --filter mcpbash typecheck
pnpm --filter mcpbash build
pnpm --filter mcpbash test
```
