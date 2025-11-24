/**
 * @onemcp/ai-sdk
 *
 * Convert AI SDK tools to 1mcp gateway tools using MCP integration.
 */

import type { CoreTool } from "ai";
import { experimental_createMCPClient } from "ai";
// import { startEmbeddedRelay } from "./server-manager.js";
// import { writeToolsToWorkDir } from "./tool-serializer.js";

// Import RelayConfig type - will be resolved at build time
import type { RelayConfig } from "@onemcp/shared";

// HTTP MCP Transport (fallback implementation if not exported by AI SDK)
class HttpMCPTransport {
	constructor(public config: { url: string }) { }
}

export interface ConvertOptions extends Partial<RelayConfig> {
	/**
	 * Optional URL to external relay-mcp server.
	 * If not provided, starts an embedded server.
	 */
	relayUrl?: string;
	/**
	 * Port for embedded server (default: auto-select starting from 7888)
	 */
	port?: number;
}

export interface MCPClient {
	tools: () => Promise<Record<string, CoreTool>>;
	close: () => Promise<void>;
}

export interface ConvertResult {
	/**
	 * MCP client connected to relay-mcp server
	 */
	client: MCPClient;
	/**
	 * Base URL of relay-mcp server (for browser connection)
	 */
	serverUrl: string;
	/**
	 * Cleanup function - closes MCP client and stops embedded server if running
	 */
	cleanup: () => Promise<void>;
}

/**
 * Convert AI SDK tools to 1mcp gateway tools
 *
 * @example
 * ```typescript
 * import { convertTo1McpTools } from '@onemcp/ai-sdk';
 * import { streamText } from 'ai';
 *
 * // Convert your 50 AI SDK tools to 5 gateway tools
 * const { client, cleanup } = await convertTo1McpTools({
 *   weather: weatherTool,
 *   calculator: calculatorTool,
 *   // ... 48 more tools
 * }, {
 *   policy: {
 *     limits: { timeoutMs: 5000 }
 *   }
 * });
 *
 * const tools = await client.tools(); // Returns 5 gateway tools
 *
 * const result = await streamText({
 *   model: openai('gpt-4'),
 *   prompt: 'What is the weather?',
 *   tools, // LLM sees 5 tools, not 50!
 *   onFinish: () => cleanup()
 * });
 * ```
 */
export async function convertTo1McpTools(
	aiSdkTools: Record<string, CoreTool>,
	options: ConvertOptions = {},
): Promise<ConvertResult> {
	const { relayUrl, port, ...config } = options;

	// Check for Browser-Only mode eligibility
	const isBrowser = typeof window !== "undefined";
	const hasOnlyHttpMcps = !config.mcps || config.mcps.every((m) => m.transport === "http");

	if (isBrowser && !relayUrl && hasOnlyHttpMcps) {
		// Browser-Only mode
		// We need to dynamically import BrowserDirectClient to avoid bundling it in Node
		const { BrowserDirectClient } = await import("./browser/direct-client.js");
		// TODO: Allow configuring worker URL
		const workerUrl = (config as any).workerUrl || "/relay-worker.js";
		const client = new BrowserDirectClient(aiSdkTools, config, workerUrl);

		return {
			client,
			serverUrl: "browser://local", // Virtual URL
			cleanup: async () => await client.close(),
		};
	}

	if (relayUrl) {
		// Connect to external relay-mcp server
		return await connectToExternalRelay(relayUrl, aiSdkTools);
	}

	// Start embedded relay-mcp server
	return await startEmbeddedMode(aiSdkTools, { port, config });
}

/**
 * Connect to an external relay-mcp server
 */
async function connectToExternalRelay(
	relayUrl: string,
	_aiSdkTools: Record<string, CoreTool>,
): Promise<ConvertResult> {
	// Create MCP transport
	const transport = new HttpMCPTransport({
		url: relayUrl,
	});

	// Create MCP client using AI SDK's experimental API
	const mcpClient = await experimental_createMCPClient({ transport: transport as unknown as never });

	// TODO: Send tools to external server
	// For now, assume tools are pre-configured on the external server
	// In production, we'd need an endpoint like POST /api/register-tools

	return {
		client: mcpClient as MCPClient,
		serverUrl: new URL(relayUrl).origin,
		cleanup: async () => {
			await mcpClient.close();
		},
	};
}

/**
 * Start embedded relay-mcp server
 */
async function startEmbeddedMode(
	aiSdkTools: Record<string, CoreTool>,
	options: { port?: number; config: Partial<RelayConfig> },
): Promise<ConvertResult> {
	// Start embedded server
	const { startEmbeddedRelay } = await import("./server-manager.js");
	const server = await startEmbeddedRelay({
		port: options.port,
		config: options.config,
	});

	// Write AI SDK tools to server's working directory
	const { writeToolsToWorkDir } = await import("./tool-serializer.js");
	await writeToolsToWorkDir(server.workDir, aiSdkTools);

	// Create MCP transport to embedded server
	const transport = new HttpMCPTransport({
		url: `${server.baseUrl}/mcp`,
	});

	// Create MCP client
	const mcpClient = await experimental_createMCPClient({ transport: transport as unknown as never });

	return {
		client: mcpClient as MCPClient,
		serverUrl: server.baseUrl,
		cleanup: async () => {
			await mcpClient.close();
			await server.stop();
		},
	};
}

// Alias for README compatibility
export const convertTo1MCP = convertTo1McpTools;

// Re-export browser client
export { RelayBrowserClient } from "./browser/client.js";

// Re-export types
export type { CoreTool } from "ai";
export type { RelayConfig } from "@onemcp/shared";
