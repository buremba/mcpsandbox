# mcpsandbox

Build tiny sandboxes from MCP tools, TypeScript functions, CLIs, provider adapters, and `just-bash`.

`mcpsandbox` gives you a lightweight sandbox object inspired by Daytona-style ergonomics, but built around command projection instead of a full VM or container. You map capabilities into a minimal runtime, then let an agent use them through shell commands and a small typed API.

## What It Supports

- `just-bash` as the execution engine
- Built-in filesystem modes for in-memory, read-only overlay, or read-write disk-backed sandboxes
- Built-in `git` integration
- MCP-backed commands via `mcp(...)`
- TypeScript handlers via `fn(...)`
- Existing binaries via `cli(...)`
- External sandbox providers via `provider(...)`
- Top-level network policy for MCP host checks
- Safe passthrough for non-conflicting `just-bash` options through `bash`
- Secret references resolved at runtime for mapped commands

Today, `mcpsandbox` supports the `just-bash` features that fit this model cleanly, especially execution limits and other non-conflicting runtime toggles. For example, `bash.executionLimits` is passed straight through to `just-bash`, while `filesystem`, `env`, `network`, and generated commands stay owned by `mcpsandbox`.

## Simple Example

Map an MCP tool into a bash-like command and call it with `sandbox.run(...)`.

```ts
import { createSandbox, mcp } from "mcpsandbox";

const sandbox = await createSandbox({
  network: {
    allow: ["https://api.example.com/mcp/"],
  },
  commands: {
    "issues.search": mcp({
      server: "https://api.example.com/mcp",
      tool: "search_issues",
      input: { query: "$1" },
    }),
  },
});

const result = await sandbox.run('issues.search "billing bug"');
console.log(result.stdout);
```

## Full Example

This example shows the main pieces together: filesystem mode, secrets, a TypeScript handler, an MCP command, a local CLI, and `git`.

```ts
import { createSandbox, fn, mcp, cli, provider, secret } from "mcpsandbox";

const sandbox = await createSandbox({
  filesystem: {
    mode: "readwrite",
    root: "./workspace",
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

## Core Ideas

```ts
import { createSandbox, mcp, fn, cli, provider } from "mcpsandbox";
```

- `createSandbox(...)` builds a small shell-oriented sandbox
- `mcp(...)` maps an MCP tool into a shell command
- `fn(...)` maps a TypeScript function into a shell command
- `cli(...)` wraps a local binary
- `provider(...)` is a semantic alias for `cli(...)` when that command delegates work to another sandbox runtime
- `filesystem.mode` can be `memory`, `readonly`, or `readwrite`
- `sandbox.run(...)` executes commands in the sandbox
- `sandbox.fs` exposes simple read, write, list, and exists helpers

## Advanced Usage

Use [ADVANCED.md](./ADVANCED.md) for:

- filesystem modes
- command adapter details
- secrets
- network and limits
- MCP auth and OAuth patterns
- provider examples with Daytona, Upstash Box, and Docker
- current limitations

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

Reference point against mainstream sandbox providers:

Representative provider comparison:

| Percentile | `mcpsandbox` | Fastest Sandbox (E2B) | Speedup |
| --- | ---: | ---: |
| p50 | 4.8 ms | 440 ms | 92x faster |
| p95 | 5.6 ms | 950 ms | 170x faster |
| p99 | 6.1 ms | 3,150 ms | 516x faster |

Memory per instance:

| Workload | `mcpsandbox` | Cheapest Sandbox (Daytona) | Reduction |
| --- | ---: | ---: |
| full coding agent | ~131 MB | ~1,024 MB | 8x smaller |
| simple shell command | ~22 MB | ~1,024 MB | 47x smaller |

How `mcpsandbox` fits into that frame:

- `createSandbox()` p50 in this repo is `0.040 ms`, mean `0.067 ms`, p95 `0.090 ms`
- built-in shell dispatch is sub-millisecond
- host-process-backed `provider(...)` and `cli(...)` are still only low single-digit milliseconds on the local machine
- this places `mcpsandbox` firmly in the same local fast-path category as in-process runtimes, not the remote sandbox category

Comparison notes:

- these are not same-machine, same-runtime, same-hardware numbers, so treat them as directional rather than a head-to-head benchmark
- `mcpsandbox` numbers above were measured on an Apple M4 Pro with Bun 1.3.5
- the useful conclusion is category-level: local in-process runtimes are orders of magnitude closer to zero-overhead setup than remote sandbox providers

Interpretation:

- the local in-process path is sub-millisecond
- host process dispatch is still only a few milliseconds
- published E2B and Daytona comparisons are directionally consistent with the claim that local in-process runtimes are orders of magnitude closer to zero-overhead setup than remote sandboxes
- remote sandboxes will be slower on raw dispatch, because they add container startup, control-plane work, or network round-trips

Run the same benchmark locally:

```bash
pnpm --filter mcpsandbox bench
```

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
