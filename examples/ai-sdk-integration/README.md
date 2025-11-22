# Chrome Prompt API + AI SDK + relay-mcp Integration

A live demonstration of using Chrome's built-in Gemini Nano model with Vercel AI SDK and relay-mcp for secure, sandboxed tool execution.

## Features

- 🤖 **Chrome's Local AI**: Uses Gemini Nano running on-device (no API keys, no cloud)
- 🔧 **Tool Calling**: Demonstrates Chrome Prompt API's tool calling capabilities
- 🌐 **Browser APIs**: Direct access to geolocation, localStorage, and other browser features
- 🔒 **Sandboxed Execution**: Secure JavaScript and 
- ⚡ **Vercel AI SDK**: Familiar API for developers already using AI SDK

## Prerequisites

### Chrome Setup

1. **Chrome 129+** with flags enabled:
   - Visit `chrome://flags/#optimization-guide-on-device-model`
   - Set to **Enabled**
   - Visit `chrome://flags/#prompt-api-for-gemini-nano`
   - Set to **Enabled**
   - Restart Chrome

2. **Download the model** (first time only):
   - The app will prompt you to download Gemini Nano
   - Download is ~1.5GB and happens once

### Development Setup

```bash
# Install dependencies from the workspace root
pnpm install

# Start the development server
cd examples/ai-sdk-integration
pnpm dev
```

## Optional: Enable Relay-MCP Tools

To use sandboxed JavaScript/, start a relay-mcp server:

```bash
# In a separate terminal, from workspace root
cd packages/server
pnpm dev:serve

# Or use the CLI
npx 1mcp serve
```

The app will automatically connect to `http://localhost:7888` if available.

## Usage

### Example Prompts

**Browser API Tools:**
```
- "What's my current location?"
- "Save 'hello world' to storage with key 'greeting'"
- "Get the value from storage with key 'greeting'"
- "List all localStorage keys"
- "What's the current time in UTC?"
```

**Relay-MCP Tools** (requires server running):
```
- "Calculate the factorial of 10 using JavaScript"
- "Generate the Fibonacci sequence up to 100 using 
- "Use JavaScript to reverse the string 'hello world'"
```

### Available Tools

**Browser API Tools** (always available):
- `getGeolocation` - Get user's coordinates
- `saveToStorage` - Save to localStorage
- `getFromStorage` - Retrieve from localStorage
- `removeFromStorage` - Remove from localStorage
- `listStorageKeys` - List all localStorage keys
- `getCurrentTime` - Get current time with optional timezone

**Relay-MCP Tools** (requires server):
- `executeJavaScript` - Run JavaScript in QuickJS WASM sandbox
- `execute

## Architecture

```
User Prompt
    ↓
Vercel AI SDK (generateText)
    ↓
Chrome Prompt API Provider (custom)
    ↓
Chrome's Gemini Nano (local model)
    ↓
Tool Calling Decision
    ↓
    ├─→ Browser Tools: Execute directly in browser
    └─→ Relay-MCP Tools: Forward to relay server
            ↓
        WASM Sandboxed Execution (QuickJS/)
            ↓
        Return Results
    ↓
Model synthesizes final response
    ↓
Display to user
```

## Key Concepts

### Custom AI SDK Provider

This example demonstrates how to create a custom language model provider for Vercel AI SDK. The `ChromeLanguageModelProvider` wraps Chrome's Prompt API and makes it work seamlessly with AI SDK's `generateText()` API.

See: `packages/ai-sdk/src/chrome-provider.ts`

### Tool Format Conversion

AI SDK tools (using Zod schemas) are automatically converted to Chrome's tool format (JSON Schema + execute functions):

```typescript
// AI SDK format
const tool = tool({
  description: "Get weather",
  parameters: z.object({
    location: z.string()
  }),
  execute: async ({ location }) => { /* ... */ }
});

// Automatically converts to Chrome format
{
  name: "getWeather",
  description: "Get weather",
  inputSchema: { type: "object", properties: { /* JSON Schema */ } },
  execute: async (args) => { /* ... */ }
}
```

### Relay-MCP Integration

The relay-mcp tools demonstrate how to integrate secure sandboxed execution with Chrome's local AI:

1. User asks for computation (e.g., "calculate factorial")
2. Chrome model calls `executeJavaScript` tool
3. Code is sent to relay-mcp server
4. Executes in WASM sandbox (QuickJS or )
5. Result returned to model
6. Model formats response for user

## Code Structure

```
examples/ai-sdk-integration/
├── src/
│   ├── App.tsx                 # Main UI component
│   ├── main.tsx                # React entry point
│   ├── styles.css              # Styling
│   ├── tools/
│   │   ├── browser.ts          # Browser API tools
│   │   └── relay.ts            # Relay-MCP integration
├── index.html                  # HTML entry
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript config
└── package.json                # Dependencies
```

## Troubleshooting

### "LanguageModel API not found"

- Ensure you're using Chrome 129+
- Enable the required flags (see Prerequisites)
- Restart Chrome after enabling flags

### "Model unavailable"

- The model may not be supported on your device
- Check Chrome's console for specific error messages
- Ensure you have sufficient disk space (~2GB)

### "Relay-MCP not connected"

- This is optional - browser tools will still work
- To enable: Start relay-mcp server on port 7888
- Check that no firewall is blocking localhost:7888

## Testing

For comprehensive testing documentation, including:
- Automated Playwright tests
- Chrome Canary setup instructions
- Session persistence fix details
- Manual testing guide

See: [TESTING.md](./TESTING.md)

### Quick Test

```bash
# Run automated tests
pnpm test

# Run tests in UI mode
pnpm test:ui
```

**Note:** Full Chrome Prompt API testing requires Chrome Canary with experimental flags enabled. See TESTING.md for details.

## Recent Fixes

### Session Persistence Bug (Fixed)

**Issue:** When asked to "run a fibonacci example in javascript", the AI would output the word "javascript" instead of executing the tool.

**Root Cause:** The session was being recreated on every request due to a condition that checked `if (!this.session || tools)`. Since AI SDK always passes tools, this was always truthy.

**Fix:** Changed to `if (!this.session)` to initialize session only once, ensuring:
- Tool definitions persist across requests
- System prompt remains active
- Conversation context is maintained
- AI follows instructions to USE tools instead of describing them

See [TESTING.md#the-session-persistence-fix](./TESTING.md#the-session-persistence-fix) for technical details.

## Learn More

- [Chrome Prompt API Docs](https://developer.chrome.com/docs/ai/prompt-api)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [relay-mcp Documentation](../../packages/server/README.md)
- [Testing Documentation](./TESTING.md)

## License

MIT
