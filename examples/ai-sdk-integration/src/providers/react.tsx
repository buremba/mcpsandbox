/**
 * React integration for @onemcp/ai-sdk
 *
 * Provides <RelayProvider> component that connects browser to relay-mcp server
 * and executes capsules in WASM sandbox.
 */

"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface RelayProviderProps {
	/**
	 * URL to relay-mcp server
	 * @default "http://localhost:7888"
	 */
	serverUrl?: string;
	/**
	 * Enable console logging for debugging
	 * @default true
	 */
	enableLogs?: boolean;
	children: ReactNode;
}

/**
 * RelayProvider - connects browser to relay-mcp server for WASM execution
 *
 * @example
 * ```tsx
 * import { RelayProvider } from '@onemcp/ai-sdk/react';
 *
 * export default function App() {
 *   return (
 *     <RelayProvider serverUrl="http://localhost:7888">
 *       <YourApp />
 *     </RelayProvider>
 *   );
 * }
 * ```
 */
export function RelayProvider({
	serverUrl = "http://localhost:7888",
	enableLogs = true,
	children,
}: RelayProviderProps) {
	const workerRef = useRef<Worker | null>(null);
	const eventSourceRef = useRef<EventSource | null>(null);
	const sessionIdRef = useRef<string | null>(null);

	useEffect(() => {
		let mounted = true;

		async function initializeConnection() {
			try {
				if (enableLogs) {
					console.log("relay-mcp: Initializing browser client...");
				}

				// 1. Create session with relay-mcp server
				const sessionResponse = await fetch(`${serverUrl}/session`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				});

				if (!sessionResponse.ok) {
					throw new Error(
						`Failed to create session: ${sessionResponse.statusText}`,
					);
				}

				const { sessionId, attachToken } = await sessionResponse.json();
				sessionIdRef.current = sessionId;

				if (enableLogs) {
					console.log(`relay-mcp: Connected to server (session: ${sessionId})`);
				}

				// 2. Initialize Web Worker for WASM execution
				// Note: In production, this would load from a bundled worker file
				// For now, we'll create an inline worker as a placeholder
				const workerBlob = new Blob(
					[
						`
// Placeholder Web Worker for WASM execution
// TODO: Replace with actual worker implementation

self.addEventListener('message', async (event) => {
  const { type, capsule } = event.data;

  if (type === 'execute') {
    console.log('Worker: Received capsule for execution', capsule);

    // TODO: Load QuickJS/Pyodide WASM
    // TODO: Mount VFS layers
    // TODO: Execute code
    // TODO: Stream results back

    // For now, just acknowledge receipt
    self.postMessage({
      type: 'result',
      data: { status: 'placeholder' }
    });
  }
});
          `,
					],
					{ type: "application/javascript" },
				);

				const worker = new Worker(URL.createObjectURL(workerBlob));
				workerRef.current = worker;

				// Handle messages from worker
				worker.onmessage = async (event) => {
					const { type, data } = event.data;

					if (type === "result") {
						// Send result back to server
						if (sessionIdRef.current) {
							await fetch(
								`${serverUrl}/session/${sessionIdRef.current}/result`,
								{
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify(data),
								},
							);
						}
					}
				};

				if (enableLogs) {
					console.log("relay-mcp: Web Worker initialized");
				}

				// 3. Connect to server via SSE
				const eventSource = new EventSource(
					`${serverUrl}/session/${sessionId}/events?token=${attachToken}`,
				);
				eventSourceRef.current = eventSource;

				eventSource.onopen = () => {
					if (enableLogs && mounted) {
						console.log("relay-mcp: Ready. Waiting for execution requests...");
					}
				};

				eventSource.onmessage = (event) => {
					if (!mounted) return;

					try {
						const message = JSON.parse(event.data);

						if (message.type === "capsule") {
							if (enableLogs) {
								console.log(
									`relay-mcp: Received capsule ${message.manifest?.runtime?.id || "unknown"}`,
								);
							}

							// Send capsule to worker for execution
							worker.postMessage({
								type: "execute",
								capsule: message,
							});
						}
					} catch (err) {
						console.error("relay-mcp: Error parsing SSE message:", err);
					}
				};

				eventSource.onerror = (err) => {
					if (!mounted) return;

					console.error("relay-mcp: SSE connection error:", err);

					if (enableLogs) {
						console.log("relay-mcp: Attempting to reconnect...");
					}
				};
			} catch (err) {
				console.error("relay-mcp: Failed to initialize:", err);
			}
		}

		initializeConnection();

		// Cleanup on unmount
		return () => {
			mounted = false;

			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}

			if (workerRef.current) {
				workerRef.current.terminate();
				workerRef.current = null;
			}

			if (enableLogs) {
				console.log("relay-mcp: Disconnected");
			}
		};
	}, [serverUrl, enableLogs]);

	return <>{children}</>;
}
