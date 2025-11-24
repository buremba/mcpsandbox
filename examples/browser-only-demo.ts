
// Mock server-manager to avoid loading server code in this browser simulation
import { mock } from "node:test";
import * as aiSdk from "../packages/ai-sdk/src/index.js";

// We need to intercept the import of server-manager.js inside index.ts
// But since we can't easily do that with ES modules in this simple script without a loader,
// we will rely on the fact that we are triggering the browser path which SHOULD NOT import server-manager
// IF we structure the code correctly.
// However, the current index.ts imports it at the top level.

// Let's try to fix index.ts to import server-manager dynamically or only if needed.
// But first, let's fix the demo to point to the right place.

import { convertTo1McpTools } from "../packages/ai-sdk/src/index.js";
import { tool } from "ai";
import { z } from "zod";

// Mock window to simulate browser environment
globalThis.window = {} as any;

// Mock Worker
class MockWorker {
    onmessage: ((event: any) => void) | null = null;

    postMessage(data: any) {
        if (data.type === "executeRaw") {
            // Simulate execution
            setTimeout(() => {
                if (this.onmessage) {
                    this.onmessage({
                        data: {
                            type: "result",
                            data: {
                                runId: data.payload.runId,
                                type: "exit",
                                exitCode: 0
                            }
                        }
                    });
                }
            }, 10);
        }
    }

    terminate() { }
}
globalThis.Worker = MockWorker as any;

async function runDemo() {
    console.log("Starting Browser-Only Demo...");

    const weatherTool = tool({
        description: "Get weather",
        parameters: z.object({ location: z.string() }),
        execute: async ({ location }) => `Weather in ${location} is Sunny`,
    });

    const { client, cleanup } = await convertTo1McpTools({
        weather: weatherTool,
    }, {
        mcps: [
            {
                name: "github",
                transport: "http",
                endpoint: "http://localhost:3000/mcp" // Mock endpoint
            }
        ]
    });

    console.log("Client created. Tools:");
    const tools = await client.tools();
    console.log(Object.keys(tools));

    if (!tools["run_js"]) {
        throw new Error("run_js tool missing!");
    }

    console.log("Executing weather tool...");
    const weather = await tools["weather"].execute({ location: "London" });
    console.log("Weather result:", weather);

    // Mock the MCP client in the BrowserDirectClient instance
    // Since we can't easily access private properties, we'll rely on the fact that handleMcpCall throws if not found
    // But for this test, we want to verify the worker sends the message.

    // We can't fully end-to-end test the MCP call without a real MCP server or mocking the client internals.
    // However, we can verify that run_js accepts the mcpConfigs.

    console.log("Executing run_js with MCP proxy...");
    // This will fail in the worker because we haven't mocked the MCP client in BrowserDirectClient
    // But we should see the attempt.
    try {
        const result = await tools["run_js"].execute({
            code: `
        console.log('Calling github...');
        try {
          const user = await github.getUser({ username: 'test' });
          console.log('User:', user);
        } catch (e) {
          console.error('MCP call failed as expected (mock):', e);
        }
      `
        });
        console.log("run_js result:", result);
    } catch (e) {
        console.error("run_js execution failed:", e);
    }

    await cleanup();
    console.log("Demo finished successfully.");
}

runDemo().catch(console.error);
