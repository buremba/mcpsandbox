# mcpsandbox

Build tiny sandboxes from MCP tools, TypeScript functions, CLIs, provider adapters, and `just-bash`.

`mcpsandbox` gives you a lightweight sandbox object inspired by Daytona-style ergonomics, but built around command projection instead of a full VM or container. You map capabilities into a minimal runtime, then let an agent use them through shell commands and a small typed API.

## What It Supports

- `just-bash` as the execution engine
- Built-in filesystem sandboxing rooted at a chosen directory
- Built-in `git` integration
- MCP-backed commands via `mcp(...)`
- TypeScript handlers via `fn(...)`
- Existing binaries via `cli(...)`
- External sandbox providers via `provider(...)`
- Top-level network policy for MCP host checks
- Safe passthrough for non-conflicting `just-bash` options through `bash`
- Secret references resolved at runtime for mapped commands

Today, `mcpsandbox` supports the `just-bash` features that fit this model cleanly, especially execution limits and other non-conflicting runtime toggles. For example, `bash.executionLimits` is passed straight through to `just-bash`, while `filesystem`, `env`, `network`, and generated commands stay owned by `mcpsandbox`.

## Quick Start

```ts
import { createSandbox, fn, mcp, cli, provider, secret } from "mcpsandbox";

const sandbox = await createSandbox({
  filesystem: {
    root: "./workspace",
    writable: true,
  },
  network: {
    allow: ["api.github.com"],
  },
  bash: {
    executionLimits: {
      maxLoopIterations: 1000,
    },
  },
  integrations: {
    git: true,
  },
  env: {
    GITHUB_TOKEN: secret.env("GITHUB_TOKEN"),
  },
  commands: {
    slugify: fn({
      input: { text: "$1" },
      handler: ({ text }: { text: string }) =>
        text.toLowerCase().replace(/\s+/g, "-"),
    }),
    "github.search": mcp({
      server: "https://proxy.example.com/mcp",
      tool: "search_repositories",
      input: { q: "$1" },
    }),
    jq: cli({
      command: "jq",
      args: ["$1", "$2"],
    }),
    "docker.node": provider({
      command: "docker",
      args: ["run", "--rm", "node:20-alpine", "node", "-e", "$1"],
    }),
  },
});

await sandbox.run('slugify "Hello World"');
await sandbox.run("git status");
```

## API Shape

```ts
import { createSandbox, mcp, fn, cli, provider } from "mcpsandbox";
```

### `createSandbox(config)`

Creates a sandbox rooted at `filesystem.root` and backed by `just-bash`.

```ts
const sandbox = await createSandbox({
  filesystem: {
    root: "./repo",
    writable: true,
    allow: ["src/**", "package.json", ".git/**"],
    deny: [".env", "secrets/**"],
  },
  network: {
    allow: ["api.github.com", "https://api.example.com/v1/"],
    methods: ["GET", "POST"],
  },
  bash: {
    executionLimits: {
      maxLoopIterations: 1000,
    },
    sleep: true,
    javascript: true,
  },
  integrations: {
    git: true,
  },
  commands: {
    "github.search": mcp({
      server: "https://proxy.example.com/mcp",
      tool: "search_repositories",
      input: { q: "$1" },
    }),
  },
});
```

### `sandbox.run(command, options?)`

Runs a shell command inside the sandbox.

```ts
const result = await sandbox.run('echo "hello"');
```

Run options pass through the matching safe `just-bash` execution flags:

```ts
await sandbox.run("echo $1", {
  args: ["hello"],
  cwd: "/",
  stdin: "",
});
```

### `sandbox.fs`

```ts
await sandbox.fs.write("note.txt", "hello");
const text = await sandbox.fs.read("note.txt");
const files = await sandbox.fs.list(".");
```

### `sandbox.git`

Available when `integrations.git` is enabled.

```ts
await sandbox.git?.status(["--short"]);
await sandbox.git?.diff();
await sandbox.git?.log(["--oneline", "-5"]);
```

## Command Adapters

### `fn(...)`

Map a TypeScript handler into a shell command.

```ts
const sandbox = await createSandbox({
  commands: {
    slugify: fn({
      input: { text: "$1" },
      handler: ({ text }: { text: string }) =>
        text.toLowerCase().replace(/\s+/g, "-"),
    }),
  },
});
```

### `mcp(...)`

Map an MCP tool into a shell command.

```ts
const sandbox = await createSandbox({
  network: { allow: ["http://127.0.0.1:3000/"] },
  commands: {
    "github.search": mcp({
      server: "http://127.0.0.1:3000",
      tool: "search_repositories",
      input: { q: "$1" },
    }),
  },
});
```

### `cli(...)`

Wrap an existing host binary behind the same command surface.

```ts
const sandbox = await createSandbox({
  commands: {
    jq: cli({
      command: "jq",
      args: ["$1", "$2"],
    }),
  },
});
```

### `provider(...)`

`provider(...)` is a semantic alias for `cli(...)`. Use it when the command you are mapping is itself a sandbox runtime such as Daytona, Upstash Box, or Docker.

```ts
const sandbox = await createSandbox({
  commands: {
    "docker.node": provider({
      command: "docker",
      args: ["run", "--rm", "node:20-alpine", "node", "-e", "$1"],
    }),
  },
});
```

## Secrets

Secret references are resolved at execution time and are not exposed through the generic shell environment.

```ts
const sandbox = await createSandbox({
  env: {
    GITHUB_TOKEN: secret.env("GITHUB_TOKEN"),
  },
  commands: {
    whoami: cli({
      command: "node",
      args: ["-e", "console.log(Boolean(process.env.GITHUB_TOKEN))"],
    }),
  },
});
```

Mapped commands can receive those secrets. Generic shell commands do not.

## Network And Limits

`mcpsandbox` supports network policy and `just-bash` execution limits today.

```ts
const sandbox = await createSandbox({
  network: {
    allow: ["api.github.com", "https://api.example.com/v1/"],
  },
  bash: {
    executionLimits: {
      maxLoopIterations: 100,
    },
  },
});
```

Current behavior:

- `network.allow` is enforced for MCP server URLs
- `network.allow` accepts either bare domains like `api.github.com` or full URL prefixes like `https://api.example.com/v1/`
- `bash.executionLimits` is passed through directly to `just-bash`
- other non-conflicting `just-bash` options can be supplied under `bash`

## Performance

This project is optimized for the local fast path. It does not need to provision a VM, container, or remote session just to dispatch a mapped function or shell command.

That said, it should not claim "fastest sandbox" as a universal truth across every category. Daytona, Upstash Box, and Docker solve broader isolation and lifecycle problems, so direct latency comparisons are only fair when you compare the same execution model.

Local benchmark on April 9, 2026:

- machine: Apple M4 Pro
- runtime: Bun 1.3.5
- package: `packages/mcpsandbox/examples/benchmark.ts`

| Operation | Mean | P50 | P95 |
| --- | ---: | ---: | ---: |
| `createSandbox()` | 0.067 ms | 0.040 ms | 0.090 ms |
| built-in shell command (`echo`) | 0.460 ms | 0.406 ms | 0.687 ms |
| mapped `fn(...)` command | 0.350 ms | 0.319 ms | 0.550 ms |
| mapped `provider(...)` command (`true`) | 2.143 ms | 2.038 ms | 3.298 ms |
| mapped `cli(...)` command (`node -e`) | 4.160 ms | 3.878 ms | 7.314 ms |

Interpretation:

- the local in-process path is sub-millisecond
- host process dispatch is still only a few milliseconds
- remote sandboxes will be slower on raw dispatch, because they add container startup, control-plane work, or network round-trips

Run the same benchmark locally:

```bash
pnpm --filter mcpsandbox bench
```

## External Sandbox Providers

Sometimes the local `mcpsandbox` path is exactly what you want:

- you want the lowest possible dispatch overhead
- you want local files and local CLIs
- you want agent tools to feel like shell commands without provisioning anything else

Sometimes you want to hand work off to an external sandbox provider instead:

- you need a stronger isolation boundary than host-process CLI execution
- you need a remote machine, not just local command projection
- you need longer-lived sandboxes with pause, resume, archive, or snapshot workflows
- you need larger compute, custom runtimes, or provider-managed networking
- you need to run untrusted code away from the host that launched the agent

That is why `provider(...)` exists. It lets `mcpsandbox` stay the orchestration layer while delegating actual execution to external sandboxes when needed.

### Daytona

Use Daytona when you want remote lifecycle management, start/stop/archive flows, or larger hosted sandboxes.

```ts
import { createSandbox, provider, secret } from "mcpsandbox";

const sandbox = await createSandbox({
  env: {
    DAYTONA_API_KEY: secret.env("DAYTONA_API_KEY"),
  },
  commands: {
    "daytona.create": provider({
      command: "daytona",
      args: ["create"],
    }),
    "daytona.start": provider({
      command: "daytona",
      args: ["start", "$1"],
    }),
    "daytona.delete": provider({
      command: "daytona",
      args: ["delete", "$1"],
    }),
  },
});
```

### Upstash Box

Use Upstash Box when you want durable cloud boxes with their own filesystem, process tree, network stack, and provider-managed lifecycle. If a provider does not have a native CLI flow you like, map a small adapter script through `provider(...)`.

```ts
import { createSandbox, provider, secret } from "mcpsandbox";

const sandbox = await createSandbox({
  env: {
    UPSTASH_BOX_API_KEY: secret.env("UPSTASH_BOX_API_KEY"),
  },
  commands: {
    "upstash.exec": provider({
      command: process.execPath,
      args: ["./scripts/upstash-box-exec.mjs", "$*"],
    }),
  },
});
```

Example adapter shape:

```js
import { Box } from "@upstash/box";

const box = await Box.create({ runtime: "node" });
const command = process.argv.slice(2).join(" ");
const result = await box.exec.command(command);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
await box.delete();
```

### Docker

Use Docker when you want a local container boundary, reproducible images, or easy bind mounts for development and CI.

```ts
import { createSandbox, provider } from "mcpsandbox";

const sandbox = await createSandbox({
  commands: {
    "docker.node": provider({
      command: "docker",
      args: [
        "run",
        "--rm",
        "-i",
        "node:20-alpine",
        "node",
        "-e",
        "$1",
      ],
    }),
  },
});
```

## Current Limitation

`cli(...)` commands execute real host binaries. That is useful for demos and lightweight local sandboxes, but it is not the same isolation level as a container or VM-backed sandbox.

`provider(...)` does not change that by itself. It is a nicer way to express "this command hands execution off to another sandbox system", but the actual isolation boundary still depends on the provider you map.

## Development

```bash
pnpm install
pnpm --filter mcpsandbox typecheck
pnpm --filter mcpsandbox build
pnpm --filter mcpsandbox test
pnpm --filter mcpsandbox bench
pnpm --filter mcpsandbox demo:mixed
pnpm --filter mcpsandbox demo:git
pnpm --filter mcpsandbox demo:mcp
```
