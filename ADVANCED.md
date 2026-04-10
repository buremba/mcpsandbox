# Advanced Guide

This guide collects the deeper `mcpsandbox` features so the main README can stay short.

## Filesystem Modes

`mcpsandbox` supports three filesystem modes:

- `memory`: in-memory filesystem using `just-bash` `InMemoryFs`
- `readonly`: read-only overlay backed by `filesystem.root`
- `readwrite`: direct read-write access to `filesystem.root`

```ts
import { createSandbox } from "mcpsandbox";

const memorySandbox = await createSandbox({
  filesystem: {
    mode: "memory",
  },
});

const readonlySandbox = await createSandbox({
  filesystem: {
    mode: "readonly",
    root: "./repo",
  },
});

const readwriteSandbox = await createSandbox({
  filesystem: {
    mode: "readwrite",
    root: "./workspace",
    allow: ["src/**", "package.json"],
    deny: [".env", "secrets/**"],
  },
});
```

Notes:

- `filesystem.mode: "memory"` keeps shell and `context.fs` file operations in memory only
- `integrations.git` is not available with `filesystem.mode: "memory"`
- host-backed `cli(...)` and `provider(...)` commands still run as real host processes, so they should not be treated as sharing the in-memory filesystem

## Core API

```ts
import { createSandbox, mcp, fn, cli, provider, secret } from "mcpsandbox";
```

### `sandbox.run(command, options?)`

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

Map your own TypeScript handler into a shell command.

```ts
import { createSandbox, fn } from "mcpsandbox";

const sandbox = await createSandbox({
  filesystem: { mode: "memory" },
  commands: {
    saveNote: fn({
      input: { path: "$1", text: "$2" },
      async handler(
        { path, text }: { path: string; text: string },
        context
      ) {
        await context.fs.write(path, text);
        return context.fs.read(path);
      },
    }),
  },
});
```

The handler receives:

- `context.fs` for sandbox file reads and writes
- `context.run(...)` to run another sandbox command
- `context.args`, `context.cwd`, `context.stdin`, and resolved `context.env`

### `mcp(...)`

Map an MCP tool into a shell command.

```ts
import { createSandbox, mcp } from "mcpsandbox";

const sandbox = await createSandbox({
  network: { allow: ["https://api.example.com/mcp/"] },
  commands: {
    "issues.search": mcp({
      server: "https://api.example.com/mcp",
      tool: "search_issues",
      input: { query: "$1" },
    }),
  },
});
```

### `cli(...)`

Wrap an existing host binary behind the same command surface.

```ts
import { cli, createSandbox } from "mcpsandbox";

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
import { createSandbox, provider } from "mcpsandbox";

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
import { cli, createSandbox, secret } from "mcpsandbox";

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
import { createSandbox } from "mcpsandbox";

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

## MCP Authentication

`mcpsandbox` does not manage OAuth sessions, token refresh, or provider-specific login flows for MCP servers.

The recommended pattern is:

- handle OAuth in your host app
- store refresh and access tokens in your app
- inject a valid access token into MCP calls through `mcp.invokeTool`

This keeps `mcpsandbox` focused on command projection and execution, while your application owns auth state.

### Full Example

This example assumes:

- your app already completed OAuth for the current user
- your app stores `accessToken`, `refreshToken`, and `expiresAt`
- your MCP server expects `Authorization: Bearer <token>`

```ts
import {
  createSandbox,
  defaultHttpMcpInvoker,
  mcp,
  type McpToolInvocation,
} from "mcpsandbox";

type OAuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const sessionStore = new Map<string, OAuthSession>();

async function refreshAccessToken(refreshToken: string): Promise<OAuthSession> {
  const response = await fetch("https://auth.example.com/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const json = await response.json();

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

async function getValidAccessToken(userId: string): Promise<string> {
  const session = sessionStore.get(userId);
  if (!session) {
    throw new Error(`No OAuth session found for user ${userId}`);
  }

  const refreshWindowMs = 60_000;
  const isExpiring = session.expiresAt <= Date.now() + refreshWindowMs;

  if (!isExpiring) {
    return session.accessToken;
  }

  const refreshed = await refreshAccessToken(session.refreshToken);
  sessionStore.set(userId, refreshed);
  return refreshed.accessToken;
}

export async function createUserSandbox(userId: string) {
  return createSandbox({
    network: {
      allow: [
        "https://api.example.com/mcp/",
        "https://auth.example.com/",
      ],
    },
    mcp: {
      async invokeTool(invocation: McpToolInvocation) {
        const accessToken = await getValidAccessToken(userId);

        return defaultHttpMcpInvoker({
          ...invocation,
          headers: {
            ...invocation.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        });
      },
    },
    commands: {
      "acme.search": mcp({
        server: "https://api.example.com/mcp",
        tool: "search",
        input: { query: "$1" },
      }),
      "acme.issue.get": mcp({
        server: "https://api.example.com/mcp",
        tool: "get_issue",
        input: { id: "$1" },
      }),
    },
  });
}
```

### Simpler Case

If you already have a stable API key or a bearer token and do not need refresh logic, inject it directly in `headers`:

```ts
import { createSandbox, mcp, secret } from "mcpsandbox";

const sandbox = await createSandbox({
  commands: {
    "acme.search": mcp({
      server: "https://api.example.com/mcp",
      tool: "search",
      input: { query: "$1" },
      headers: {
        Authorization: secret.env("ACME_ACCESS_TOKEN"),
      },
    }),
  },
});
```

## External Sandbox Providers

Use `provider(...)` when `mcpsandbox` should stay the orchestration layer while actual execution happens in another sandbox system.

### Daytona

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
  },
});
```

### Upstash Box

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

### Docker

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
