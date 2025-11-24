/**
 * Browser Direct Client - runs entirely in browser without relay server
 */

import type { CoreTool } from "ai";
import type { RelayConfig } from "@onemcp/shared";
import type { MCPClient } from "../index.js";
import { experimental_createMCPClient } from "ai";

// Worker wrapper to manage the QuickJS worker
class WorkerManager {
    private worker: Worker | null = null;
    private pending = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();

    constructor(
        private workerScriptUrl: string,
        private mcpHandler: (mcpName: string, method: string, params: any) => Promise<any>
    ) { }

    async getWorker(): Promise<Worker> {
        if (!this.worker) {
            this.worker = new Worker(this.workerScriptUrl, { type: "module" });

            this.worker.onmessage = async (event) => {
                const { type, data } = event.data;
                if (type === "result") {
                    const { runId, type: resultType, chunk, exitCode, error } = data;
                    const p = this.pending.get(runId);
                    if (!p) return;

                    if (resultType === "exit") {
                        if (exitCode === 0) {
                            p.resolve("Success");
                        } else {
                            p.reject(new Error(`Exit code ${exitCode}`));
                        }
                        this.pending.delete(runId);
                    } else if (resultType === "error") {
                        p.reject(new Error(error));
                        this.pending.delete(runId);
                    } else if (resultType === "stdout") {
                        console.log("[Worker stdout]", chunk);
                    } else if (resultType === "stderr") {
                        console.error("[Worker stderr]", chunk);
                    }
                } else if (type === "mcpCall") {
                    // Handle MCP call from worker
                    const { runId, callId, mcpName, method, params } = data;
                    try {
                        const result = await this.mcpHandler(mcpName, method, params);
                        this.worker?.postMessage({
                            type: "mcpCallResult",
                            result: {
                                callId,
                                success: true,
                                data: result
                            }
                        });
                    } catch (error) {
                        this.worker?.postMessage({
                            type: "mcpCallResult",
                            result: {
                                callId,
                                success: false,
                                error: String(error)
                            }
                        });
                    }
                }
            };
        }
        return this.worker;
    }

    async executeRaw(code: string, npm: any = {}, mcpConfigs: any[] = []): Promise<string> {
        const worker = await this.getWorker();
        const runId = Math.random().toString(36).slice(2);

        return new Promise((resolve, reject) => {
            this.pending.set(runId, { resolve, reject });
            worker.postMessage({
                type: "executeRaw",
                payload: {
                    runId,
                    code,
                    npm,
                    mcpConfigs
                }
            });
        });
    }

    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

export class BrowserDirectClient implements MCPClient {
    private workerManager: WorkerManager;
    private mcpClients: Map<string, any> = new Map(); // mcpName -> client

    constructor(
        private aiSdkTools: Record<string, CoreTool>,
        private config: Partial<RelayConfig>,
        workerScriptUrl: string = "/relay-worker.js"
    ) {
        this.workerManager = new WorkerManager(workerScriptUrl, this.handleMcpCall.bind(this));
    }

    private async handleMcpCall(mcpName: string, method: string, params: any): Promise<any> {
        const client = this.mcpClients.get(mcpName);
        if (!client) {
            throw new Error(`MCP server '${mcpName}' not found`);
        }

        // Assuming client has a generic call method or we map it
        // Since we don't have the full MCP client implementation here yet,
        // we'll assume a standard interface or direct tool call

        // If using AI SDK's experimental_createMCPClient, it returns a client with a `tools` method
        // but not a direct `callTool` method exposed easily without digging into internals.
        // However, for this integration, we might need to maintain a map of toolName -> tool

        // For now, let's assume we have a way to call it.
        // In a real implementation, we would map the MCP tools to a flat list
        // but here we need to call a specific tool on a specific MCP server.

        // TODO: Implement proper tool lookup
        throw new Error("MCP call handling not fully implemented in BrowserDirectClient yet");
    }

    async tools(): Promise<Record<string, CoreTool>> {
        const tools: Record<string, CoreTool> = { ...this.aiSdkTools };

        // Connect to HTTP MCPs
        if (this.config.mcps) {
            for (const mcpConfig of this.config.mcps) {
                if (mcpConfig.transport === "http" && mcpConfig.endpoint) {
                    try {
                        // Placeholder for HTTP MCP connection
                        // const transport = new HttpMCPTransport({ url: mcpConfig.endpoint });
                        // const client = await experimental_createMCPClient({ transport });
                        // this.mcpClients.set(mcpConfig.name, client);

                        // We also need to expose these tools to the LLM?
                        // If we want the LLM to use them, we merge them into `tools`.
                        // If we only want them available inside `run_js`, we don't need to merge them here
                        // BUT usually we want both.

                        // const mcpTools = await client.tools();
                        // Object.assign(tools, mcpTools);
                    } catch (err) {
                        console.error(`Failed to connect to MCP ${mcpConfig.name}:`, err);
                    }
                }
            }
        }

        // Add run_js tool
        tools["run_js"] = {
            description: "Execute JavaScript code in a secure sandbox",
            parameters: {
                type: "object",
                properties: {
                    code: { type: "string", description: "JavaScript code to execute" },
                    npm: {
                        type: "object",
                        description: "NPM dependencies (not supported in browser-only mode yet)",
                        properties: { dependencies: { type: "object" } }
                    }
                },
                required: ["code"]
            },
            execute: async ({ code, npm }: { code: string; npm?: any }) => {
                return await this.workerManager.executeRaw(code, npm, this.config.mcps || []);
            }
        };

        return tools;
    }

    async close(): Promise<void> {
        this.workerManager.terminate();
        // Close all MCP clients
    }
}
