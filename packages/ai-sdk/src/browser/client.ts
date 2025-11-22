/**
 * Browser client for connecting to relay-mcp server via SSE
 */

import type { Capsule } from "@onemcp/shared";

export interface ExecutionResult {
	runId: string;
	type: "stdout" | "stderr" | "exit" | "error";
	chunk?: string;
	exitCode?: number;
	error?: string;
}

export interface CapsuleMessage {
	type: "capsule";
	runId: string;
	manifest: Capsule;
	urls: {
		capsule: string;
		fsLayers: string[];
	};
}

export type ServerMessage = CapsuleMessage | { type: string; [key: string]: unknown };

/**
 * RelayBrowserClient - manages SSE connection and capsule execution
 */
export class RelayBrowserClient {
	private sessionId: string | null = null;
	private eventSource: EventSource | null = null;
	private capsuleHandlers: Array<(capsule: CapsuleMessage) => void> = [];

	constructor(private serverUrl: string) {}

	/**
	 * Connect to relay-mcp server and create session
	 * @returns Session ID
	 */
	async connect(): Promise<string> {
		// Create session
		const response = await fetch(`${this.serverUrl}/session`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});

		if (!response.ok) {
			throw new Error(`Failed to create session: ${response.statusText}`);
		}

		const { sessionId, attachToken } = await response.json();
		this.sessionId = sessionId;

		// Connect via SSE
		this.eventSource = new EventSource(
			`${this.serverUrl}/session/${sessionId}/events?token=${attachToken}`,
		);

		this.eventSource.onmessage = (event) => {
			try {
				const message: ServerMessage = JSON.parse(event.data);

				if (message.type === "capsule") {
					// Notify handlers
					for (const handler of this.capsuleHandlers) {
						handler(message as CapsuleMessage);
					}
				}
			} catch (err) {
				console.error("Failed to parse SSE message:", err);
			}
		};

		this.eventSource.onerror = (err) => {
			console.error("SSE connection error:", err);
		};

		return sessionId;
	}

	/**
	 * Register handler for incoming capsules
	 */
	onCapsule(handler: (capsule: CapsuleMessage) => void): void {
		this.capsuleHandlers.push(handler);
	}

	/**
	 * Send execution result back to server
	 */
	async sendResult(result: ExecutionResult): Promise<void> {
		if (!this.sessionId) {
			throw new Error("Not connected to server");
		}

		await fetch(`${this.serverUrl}/session/${this.sessionId}/result`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(result),
		});
	}

	/**
	 * Disconnect from server
	 */
	disconnect(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		this.sessionId = null;
		this.capsuleHandlers = [];
	}
}
