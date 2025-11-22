/**
 * DEPRECATED: This file is no longer used.
 *
 * The app now uses convertTo1MCP from @onemcp/ai-sdk to properly connect
 * to the relay server via MCP protocol, which automatically provides
 * all 4 tools: run_js, read, write, search.
 *
 * This manual implementation only provided the run_js tool and used
 * a custom /execute endpoint instead of the proper MCP protocol.
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * Relay-MCP connection state
 */
let relayServerUrl: string | null = null;
let sessionId: string | null = null;

/**
 * Initialize relay-mcp connection
 * This should be called before using relay tools
 */
export async function initializeRelay(serverUrl: string): Promise<void> {
	relayServerUrl = serverUrl;

	try {
		// Create a session with the relay server
		const response = await fetch(`${serverUrl}/session`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to create session: ${response.statusText}`);
		}

		const data = await response.json();
		sessionId = data.sessionId;

		console.log("Relay-MCP session initialized:", sessionId);
	} catch (error) {
		console.error("Failed to initialize relay:", error);
		throw error;
	}
}

/**
 * Execute code through relay-mcp
 */
async function executeViaRelay(
	code: string,
	runtime: "quickjs",
): Promise<unknown> {
	console.log("🌐 [executeViaRelay] Starting with code:", code);

	if (!relayServerUrl || !sessionId) {
		throw new Error(
			"Relay not initialized. Call initializeRelay() first.",
		);
	}

	try {
		const requestBody = {
			sessionId,
			runtime,
			code,
		};
		console.log("🌐 [executeViaRelay] Request body:", requestBody);
		console.log("🌐 [executeViaRelay] URL:", `${relayServerUrl}/execute`);

		const response = await fetch(`${relayServerUrl}/execute`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
		});

		console.log("🌐 [executeViaRelay] Response status:", response.status, response.statusText);

		if (!response.ok) {
			const error = await response.text();
			console.error("🌐 [executeViaRelay] Error response:", error);
			throw new Error(`Execution failed: ${error}`);
		}

		const result = await response.json();
		console.log("🌐 [executeViaRelay] JSON result:", result);
		return result;
	} catch (error) {
		console.error("🌐 [executeViaRelay] Exception:", error);
		throw error;
	}
}

/**
 * Relay-MCP tools for sandboxed execution
 */

export const executeJavaScriptTool = tool({
	description:
		"Execute JavaScript code in a sandboxed QuickJS environment through relay-mcp. " +
		"Use this for calculations, data processing, or any JavaScript logic that should run in isolation. " +
		"The code runs in a secure WASM sandbox with limited permissions.",
	inputSchema: z.object({
		code: z
			.string()
			.describe(
				"The JavaScript code to execute. Must be valid ES5/ES6 syntax. Can return a value.",
			),
	}),
	execute: async ({ code }) => {
		console.log("🔧 [TOOL EXECUTE] Called with code:", code);

		// Check if relay is initialized, if not wait a bit and retry
		if (!relayServerUrl || !sessionId) {
			console.warn("🔧 [TOOL EXECUTE] Relay not initialized, waiting...");
			// Wait up to 2 seconds for initialization
			for (let i = 0; i < 20; i++) {
				await new Promise(resolve => setTimeout(resolve, 100));
				if (relayServerUrl && sessionId) {
					console.log("🔧 [TOOL EXECUTE] Relay initialized after wait");
					break;
				}
			}
		}

		try {
			console.log("🔧 [TOOL EXECUTE] Calling executeViaRelay...");
			const result = await executeViaRelay(code, "quickjs") as any;
			console.log("🔧 [TOOL EXECUTE] Got result from executeViaRelay:", JSON.stringify(result, null, 2));

			// For Chrome's Prompt API, return a very simple, direct result
			// Chrome's model will interpret and present this to the user
			if (result.exitCode === 0) {
				// Return the last value if present, otherwise stdout, otherwise success message
				if (result.lastValue !== undefined && result.lastValue !== null) {
					const simpleResult = String(result.lastValue);
					console.log("🔧 [TOOL EXECUTE] lastValue type:", typeof result.lastValue);
					console.log("🔧 [TOOL EXECUTE] lastValue value:", result.lastValue);
					console.log("🔧 [TOOL EXECUTE] Converted to string:", simpleResult);
					console.log("🔧 [TOOL EXECUTE] String typeof:", typeof simpleResult);
					console.log("🔧 [TOOL EXECUTE] FINAL RETURN VALUE:", simpleResult);
					return simpleResult;
				}

				if (result.stdout && result.stdout.trim()) {
					console.log("🔧 [TOOL EXECUTE] Returning stdout:", result.stdout.trim());
					return result.stdout.trim();
				}

				const successMsg = 'Code executed successfully';
				console.log("🔧 [TOOL EXECUTE] Returning success message");
				return successMsg;
			} else {
				// Error case
				const errorMsg = result.stderr || `Execution failed with exit code ${result.exitCode}`;
				console.log("🔧 [TOOL EXECUTE] Returning error:", errorMsg);
				return errorMsg;
			}
		} catch (error) {
			console.error("🔧 [TOOL EXECUTE] Error occurred:", error);
			const errorMessage = `Execution error: ${error instanceof Error ? error.message : String(error)}`;
			console.log("🔧 [TOOL EXECUTE] Returning error:", errorMessage);
			return errorMessage;
		}
	},
});

/**
 * Export all relay tools as a collection
 */
export const relayTools = {
	executeJavaScript: executeJavaScriptTool,
};

/**
 * Get relay connection status
 */
export function getRelayStatus(): {
	connected: boolean;
	serverUrl: string | null;
	sessionId: string | null;
} {
	return {
		connected: relayServerUrl !== null && sessionId !== null,
		serverUrl: relayServerUrl,
		sessionId,
	};
}

/**
 * Cleanup relay connection
 */
export async function cleanupRelay(): Promise<void> {
	if (relayServerUrl && sessionId) {
		try {
			await fetch(`${relayServerUrl}/session/destroy`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ sessionId }),
			});
		} catch (error) {
			console.error("Failed to cleanup relay session:", error);
		}
	}

	relayServerUrl = null;
	sessionId = null;
}
