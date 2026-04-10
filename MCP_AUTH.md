# MCP Authentication

`mcpsandbox` does not manage OAuth sessions, token refresh, or provider-specific login flows for MCP servers.

The recommended pattern is:

- handle OAuth in your host app
- store refresh and access tokens in your app
- inject a valid access token into MCP calls through `mcp.invokeTool`

This keeps `mcpsandbox` focused on command projection and execution, while your application owns auth state.

## Full Example

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
  // Replace this with your provider's token refresh endpoint.
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

async function main() {
  const userId = "user_123";

  sessionStore.set(userId, {
    accessToken: "initial-access-token",
    refreshToken: "initial-refresh-token",
    expiresAt: Date.now() + 30_000,
  });

  const sandbox = await createUserSandbox(userId);

  const search = await sandbox.run('acme.search "billing errors"');
  console.log(search.stdout);

  const issue = await sandbox.run("acme.issue.get 42");
  console.log(issue.stdout);
}

void main();
```

## Simpler Case

If you already have a stable API key or a bearer token and do not need refresh logic, you can inject it directly in `headers`:

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

## Boundary

Use `mcpsandbox` for:

- command mapping
- network allow-list enforcement
- shell and function dispatch
- MCP tool invocation

Use your app for:

- OAuth login
- session storage
- token refresh
- tenant and user identity
