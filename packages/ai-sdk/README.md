# @1mcp/ai-sdk

Convert AI SDK tools to 1mcp gateway tools - **reduce context bloat by 87%**.

## Why?

**Problem:** 50 tools = 15,000 tokens in every LLM call
**Solution:** 50 tools → 5 gateway tools = 2,000 tokens

Your tools are loaded on-demand from files, not sent in every request.

## Installation

```bash
npm install @1mcp/ai-sdk
# or
pnpm add @1mcp/ai-sdk
```

## Quick Start

### Backend (API Route)

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { convertTo1McpTools } from '@1mcp/ai-sdk';
import * as myTools from '@/tools'; // Your 50 AI SDK tools

// Convert tools once (can be singleton)
const { client, serverUrl } = await convertTo1McpTools(myTools, {
  policy: {
    limits: { timeoutMs: 5000 }
  }
});

export async function POST(req: Request) {
  const { messages } = await req.json();
  const tools = await client.tools(); // Returns 5 gateway tools!

  const result = streamText({
    model: openai('gpt-4'),
    messages,
    tools, // LLM sees 5 tools, not 50!
  });

  return result.toDataStreamResponse();
}
```

### Frontend (React Component)

```tsx
// app/page.tsx
'use client'
import { useChat } from 'ai/react';
import { RelayProvider } from '@1mcp/ai-sdk/react';

export default function ChatPage() {
  const { messages, input, handleSubmit, handleInputChange } = useChat();

  return (
    <RelayProvider serverUrl="http://localhost:7888">
      <form onSubmit={handleSubmit}>
        {messages.map(m => (
          <div key={m.id}>{m.content}</div>
        ))}
        <input value={input} onChange={handleInputChange} />
      </form>
    </RelayProvider>
  );
}
```

## How It Works

```
┌─────────────────────────┐
│ Your Next.js App        │
│  - 50 tools defined     │
│  - 5 tools sent to LLM  │
└─────────────────────────┘
         ↓
┌─────────────────────────┐
│ Embedded relay-mcp      │
│  - Builds capsules      │
│  - Manages execution    │
└─────────────────────────┘
         ↓
┌─────────────────────────┐
│ Browser (WASM sandbox)  │
│  - Executes in QuickJS  │
│  - Isolated & secure    │
└─────────────────────────┘
```

## API

### `convertTo1McpTools(tools, options?)`

Convert AI SDK tools to gateway tools using relay-mcp.

**Parameters:**
- `tools`: Record of your AI SDK tools
- `options`: Optional configuration

**Options:**
```typescript
{
  // External relay server URL (production)
  relayUrl?: string;

  // Port for embedded server (dev)
  port?: number;

  // Security policies
  policy?: {
    network?: {
      allowedDomains?: string[];
      maxBodyBytes?: number;
    };
    filesystem?: {
      readonly?: string[];
      writable?: string[];
    };
    limits?: {
      timeoutMs?: number;
      memMb?: number;
    };
  };

  // Upstream MCP servers
  mcps?: Array<{
    name: string;
    endpoint?: string;
    transport: 'http' | 'stdio';
  }>;
}
```

**Returns:**
```typescript
{
  client: MCPClient;      // Use with AI SDK
  serverUrl: string;      // For browser connection
  cleanup: () => Promise<void>;
}
```

### `<RelayProvider>`

React component that connects browser to relay-mcp for WASM execution.

**Props:**
```typescript
{
  serverUrl?: string;     // Default: http://localhost:7888
  enableLogs?: boolean;   // Default: true
  children: ReactNode;
}
```

## Deployment

### Development (localhost)

```typescript
// Embedded mode - starts relay-mcp automatically
const { client } = await convertTo1McpTools(tools);
```

✅ Works out of the box
✅ Browser execution via localhost:7888
✅ Full WASM sandbox

### Production (Vercel/Cloudflare)

```typescript
// External relay mode
const { client } = await convertTo1McpTools(tools, {
  relayUrl: process.env.RELAY_MCP_URL
});
```

**.env.production:**
```bash
RELAY_MCP_URL=https://relay.yourdomain.com/mcp
NEXT_PUBLIC_RELAY_MCP_URL=https://relay.yourdomain.com
```

✅ Works on serverless platforms
✅ Self-host or use hosted relay service
✅ Scales independently

### Self-Hosting Relay Server

```bash
# Railway/Fly.io/DigitalOcean
npx 1mcp serve --bind 0.0.0.0 --port 7888
```

## Examples

See [examples/nextjs-ai-sdk](../../examples/nextjs-ai-sdk) for a complete demo.

## Benefits

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Tools in context | 50 | 5 | 90% |
| Tokens per request | 15,000 | 2,000 | 87% |
| LLM costs | High | Low | 87% |

## How Tools Are Executed

1. LLM calls `run_js` tool with code
2. relay-mcp builds secure capsule
3. Sends to browser (if attached) or Node fallback
4. Executes in WASM sandbox (QuickJS/Pyodide)
5. Results stream back to LLM

**Your tools run on-demand**, not in every request!

## License

MIT
