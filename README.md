# mcpsandbox

Build tiny sandboxes from MCP tools, TypeScript functions, CLIs, and `just-bash`.

`mcpsandbox` gives you a lightweight sandbox object inspired by Daytona-style ergonomics, but built around command projection instead of a full VM or container. You map capabilities into a minimal runtime, then let an agent use them through shell commands and a small typed API.

## What It Supports

- `just-bash` as the execution engine
- Built-in filesystem sandboxing rooted at a chosen directory
- Built-in `git` integration
- MCP-backed commands via `mcp(...)`
- TypeScript handlers via `fn(...)`
- Existing binaries via `cli(...)`
- Top-level network policy for MCP host checks
- Safe passthrough for non-conflicting `just-bash` options through `bash`
- Secret references resolved at runtime for mapped commands

Today, `mcpsandbox` supports the `just-bash` features that fit this model cleanly, especially execution limits and other non-conflicting runtime toggles. For example, `bash.executionLimits` is passed straight through to `just-bash`, while `filesystem`, `env`, `network`, and generated commands stay owned by `mcpsandbox`.

## Quick Start

```ts
import { createSandbox, fn, mcp, cli, secret } from "mcpsandbox";

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
  },
});

await sandbox.run('slugify "Hello World"');
await sandbox.run("git status");
```

## API Shape

```ts
import { createSandbox, mcp, fn, cli } from "mcpsandbox";
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

## Current Limitation

`cli(...)` commands execute real host binaries. That is useful for demos and lightweight local sandboxes, but it is not the same isolation level as a container or VM-backed sandbox.

## Development

```bash
pnpm install
pnpm --filter mcpsandbox typecheck
pnpm --filter mcpsandbox build
pnpm --filter mcpsandbox test
pnpm --filter mcpsandbox demo:mixed
pnpm --filter mcpsandbox demo:git
pnpm --filter mcpsandbox demo:mcp
```
