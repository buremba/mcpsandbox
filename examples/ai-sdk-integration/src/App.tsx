import { useState, useEffect, useCallback, useMemo } from "react";
import { useAIProvider } from "./hooks/use-ai-provider";
import { useModelProvider } from "./hooks/use-model-provider";
import { useAssistant } from "./hooks/use-assistant";
import { useThreadStorage } from "./hooks/use-thread-storage";
import { LocalStorageThreadStorage } from "./storage";
import { ThreadSidebar } from "./components/thread-sidebar";
import { ChatThread } from "./components/chat-thread";
import { Select } from "./components/ui/select";
import { browserTools } from "./tools/browser";
import { calculatorTools } from "./tools/calculator";
import { tool } from "ai";
import { z } from "zod";
import { getProviderIcon } from "./components/icons/provider-icons";
import type { ChromeProviderCallbacks } from "./providers/chrome-provider";

function App() {
	const [relayConnected, setRelayConnected] = useState(false);
	const [mcpTools, setMcpTools] = useState<Record<string, any>>({});
	const [mcpCleanup, setMcpCleanup] = useState<(() => Promise<void>) | null>(null);
	const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);

	// Theme detection based on system preference
	useEffect(() => {
		const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const updateTheme = (e: MediaQueryListEvent | MediaQueryList) => {
			document.documentElement.classList.toggle('dark', e.matches);
		};

		// Set initial theme
		updateTheme(darkModeMediaQuery);

		// Listen for changes
		darkModeMediaQuery.addEventListener('change', updateTheme);

		return () => darkModeMediaQuery.removeEventListener('change', updateTheme);
	}, []);

	// Initialize storage (can be swapped for RemoteThreadStorage)
	const storage = useMemo(() => new LocalStorageThreadStorage(), []);

	// Thread storage
	const {
		threads,
		currentThread,
		currentThreadId,
		createThread,
		updateThread,
		selectThread,
		deleteThread,
		loadMessages,
		saveMessages,
		isInitialized,
	} = useThreadStorage(storage);

	// Model provider hook
	const modelProvider = useModelProvider({ mode: "local" });

	// Tool tracking callbacks for Chrome provider
	const chromeCallbacks: ChromeProviderCallbacks = {
		onToolCallStart: useCallback((data) => {
			console.log("Tool call started:", data);
		}, []),
		onToolCallComplete: useCallback((data) => {
			console.log("Tool call completed:", data);
		}, []),
		onToolCallError: useCallback((data) => {
			console.error("Tool call error:", data);
		}, []),
	};

	// Get AI provider configuration (uses selectedModelId if set, otherwise default)
	const providerConfig = useAIProvider({
		modelId: selectedModelId || modelProvider.selectedModelId,
		chromeCallbacks
	});

	// Prepare tools - only include MCP tools if relay is connected
	const allTools = {
		...browserTools,
		...calculatorTools,
		...(relayConnected ? mcpTools : {}),
	};

	// Generic assistant that works with any provider
	const { messages, sendMessage, clearMessages, isGenerating } = useAssistant({
		tools: allTools,
		providerConfig,
	});

	// Clean up auto-created "New Chat" threads on mount
	useEffect(() => {
		if (!isInitialized) return;

		const autoCreatedThreads = threads.filter((t) => t.title === "New Chat");
		if (autoCreatedThreads.length > 0) {
			const shouldClearCurrent = autoCreatedThreads.some(
				(t) => t.id === currentThreadId,
			);
			autoCreatedThreads.forEach((thread) => {
				deleteThread(thread.id);
			});
			if (shouldClearCurrent) {
				clearMessages();
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isInitialized]); // Run once after initialization

	// Initialize relay-mcp connection via MCP protocol
	useEffect(() => {
		const initRelay = async () => {
			try {
				console.log("Connecting to relay-mcp server via MCP protocol...");

				const mcpUrl = "http://127.0.0.1:7888/mcp";

				// Initialize MCP session
				const initResponse = await fetch(mcpUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2024-11-05",
							capabilities: {},
							clientInfo: {
								name: "ai-sdk-integration",
								version: "1.0.0"
							}
						}
					})
				});

				const initResult = await initResponse.json();
				console.log("MCP initialized:", initResult);

				// Fetch tools list
				const toolsResponse = await fetch(mcpUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 2,
						method: "tools/list"
					})
				});

				const toolsResult = await toolsResponse.json();
				const mcpToolsList = toolsResult.result.tools;
				console.log("MCP tools fetched:", mcpToolsList.map((t: any) => t.name));

				// Helper function to convert JSON Schema to simple Zod (only top-level)
				const jsonSchemaToZod = (jsonSchema: any): any => {
					if (!jsonSchema || jsonSchema.type !== 'object') {
						return z.object({});
					}

					const shape: Record<string, any> = {};
					const properties = jsonSchema.properties || {};
					const required = jsonSchema.required || [];

					for (const [key, prop] of Object.entries(properties)) {
						const propSchema = prop as any;
						let zodType: any;

						// Simplified conversion - avoid nested objects to prevent OpenAI schema validation errors
						switch (propSchema.type) {
							case 'string':
								zodType = z.string();
								if (propSchema.description) {
									zodType = zodType.describe(propSchema.description);
								}
								break;
							case 'number':
								zodType = z.number();
								if (propSchema.description) {
									zodType = zodType.describe(propSchema.description);
								}
								break;
							case 'boolean':
								zodType = z.boolean();
								if (propSchema.description) {
									zodType = zodType.describe(propSchema.description);
								}
								break;
							case 'array':
								// Simple array of strings
								zodType = z.array(z.string());
								if (propSchema.description) {
									zodType = zodType.describe(propSchema.description);
								}
								break;
							case 'object':
								// For objects, just use z.any() to avoid nested schema issues
								zodType = z.any();
								if (propSchema.description) {
									zodType = zodType.describe(propSchema.description);
								}
								break;
							default:
								zodType = z.any();
						}

						// Make optional if not required
						if (!required.includes(key)) {
							zodType = zodType.optional();
						}

						shape[key] = zodType;
					}

					return z.object(shape);
				};

				// Convert MCP tools to AI SDK tools
				const convertedTools: Record<string, any> = {};
				for (const mcpTool of mcpToolsList) {
					const zodSchema = jsonSchemaToZod(mcpTool.inputSchema);

					convertedTools[mcpTool.name] = tool({
						description: mcpTool.description,
						inputSchema: zodSchema,
						execute: async (args: any) => {
							console.log(`Executing MCP tool: ${mcpTool.name}`, args);

							const response = await fetch(mcpUrl, {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									jsonrpc: "2.0",
									id: Date.now(),
									method: "tools/call",
									params: {
										name: mcpTool.name,
										arguments: args
									}
								})
							});

							const result = await response.json();
							console.log(`MCP tool ${mcpTool.name} result:`, result);

							if (result.error) {
								throw new Error(result.error.message);
							}

							// Extract text content from MCP response
							if (result.result?.content?.[0]?.text) {
								return result.result.content[0].text;
							}

							return JSON.stringify(result.result);
						}
					});
				}

				setMcpTools(convertedTools);
				setRelayConnected(true);
				console.log("Relay-MCP connected via MCP protocol with tools:", Object.keys(convertedTools));
			} catch (error) {
				console.warn(
					"Relay-MCP not available. Only browser tools will work.",
					error
				);
				setRelayConnected(false);
			}
		};

		initRelay();

		return () => {
			// MCP cleanup if needed
			if (mcpCleanup) {
				mcpCleanup().catch(console.error);
			}
		};
	}, []);


	const handleCreateThread = async () => {
		await createThread(
			`Chat ${threads.length + 1}`,
			providerConfig.modelId,
		);
		clearMessages();
	};

	const handleSelectThread = async (id: string) => {
		const thread = threads.find((t) => t.id === id);
		if (!thread) return;

		await selectThread(id);

		// Update selected model to match thread's model
		setSelectedModelId(thread.modelId);

		// Load thread messages from storage
		const messagePage = await loadMessages(id);
		// TODO: Set loaded messages in assistant hook
		// For now, just clear since we don't have setMessages yet
		clearMessages();
	};

	const handleDeleteThread = async (id: string) => {
		await deleteThread(id);
		if (currentThreadId === id) {
			clearMessages();
		}
	};

	const handleSendMessage = async (content: string) => {
		// Create a new thread if none exists
		if (!currentThreadId) {
			const threadTitle =
				content.length > 50 ? content.substring(0, 50) + "..." : content;
			await createThread(
				threadTitle,
				providerConfig.modelId,
			);
		}

		// Send the message
		await sendMessage(content);
	};

	// Auto-save messages when they change
	useEffect(() => {
		if (!isInitialized || !currentThreadId || messages.length === 0) return;

		// Debounce saving
		const timeoutId = setTimeout(() => {
			saveMessages(currentThreadId, messages).catch((error) => {
				console.error("Failed to save messages:", error);
			});
		}, 1000);

		return () => clearTimeout(timeoutId);
	}, [messages, currentThreadId, isInitialized, saveMessages]);

	// Sync provider dropdown when thread changes
	useEffect(() => {
		if (currentThread) {
			setSelectedModelId(currentThread.modelId);
		}
	}, [currentThread]);

	// Handle model switching
	const handleModelChange = (newModelId: string) => {
		setSelectedModelId(newModelId);
		// Clear messages when switching models (optional behavior)
		// clearMessages();
	};

	const renderStatusBadge = () => {
		return (
			<div className="flex items-center gap-2">
				{relayConnected && (
					<div className="flex items-center gap-1.5">
						<div className="h-1.5 w-1.5 rounded-full bg-green-500" />
						<span>MCP</span>
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="flex h-screen bg-background">
			{/* Thread Sidebar */}
			<ThreadSidebar
				threads={threads}
				currentThreadId={currentThreadId}
				generatingThreadId={isGenerating ? currentThreadId : null}
				onSelectThread={handleSelectThread}
				onCreateThread={handleCreateThread}
				onDeleteThread={handleDeleteThread}
			/>

			{/* Main Content */}
			<div className="flex-1 flex flex-col">
				{/* Minimal Top Bar */}
				<div className="border-b px-4 py-3">
					<div className="flex items-center justify-between">
						{/* Model Selector */}
						<div className="relative inline-flex items-center">
							{(() => {
								const ProviderIcon = getProviderIcon(providerConfig.provider);
								return <ProviderIcon className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" size={16} />;
							})()}
							<Select
								value={providerConfig.modelId}
								className="pl-9 pr-8 w-auto min-w-[240px]"
								onChange={(e) => handleModelChange(e.target.value)}
							>
								{modelProvider.models.map((model) => (
									<option key={model.id} value={model.id} disabled={!model.enabled}>
										{model.name} {!model.enabled && "(Not available)"}
									</option>
								))}
							</Select>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
							>
								<path d="m6 9 6 6 6-6" />
							</svg>
						</div>

						<div className="flex items-center gap-2">
							{/* Status Badge */}
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								{renderStatusBadge()}
							</div>

							{/* Share Button */}
							<button
								className="p-2 hover:bg-accent rounded-md transition-colors cursor-pointer"
								title="Share"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
									<polyline points="16 6 12 2 8 6" />
									<line x1="12" x2="12" y1="2" y2="15" />
								</svg>
							</button>
						</div>
					</div>
				</div>

				{!providerConfig.isAvailable && providerConfig.error && (
					<div className="m-4 p-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
						{providerConfig.error}
					</div>
				)}

				{/* Chat Area */}
				<div className="flex-1 overflow-hidden">
					<ChatThread
						messages={messages}
						onSendMessage={handleSendMessage}
						isGenerating={isGenerating}
					/>
				</div>
			</div>
		</div>
	);
}

export default App;
