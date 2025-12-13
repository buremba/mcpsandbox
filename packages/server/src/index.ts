/**
 * Main server entry point (spec §2)
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import pino from "pino";
import { SessionManager } from "./services/session-manager.js";
import { CapsuleBuilder } from "./capsule/builder.js";
import { MCPManager } from "./services/mcp-manager.js";
import { CapsuleCleanupService } from "./services/capsule-cleanup.js";
import { StubGenerator } from "./services/stub-generator.js";
import { NodeExecutor } from "./harness/executor.js";
import { createServerThreadStorage } from "./services/thread-storage.js";
import { setupMcpEndpoint } from "./endpoints/mcp.js";
import { setupSessionEndpoints } from "./endpoints/session.js";
import { setupCapsuleEndpoints } from "./endpoints/capsules.js";
import { setupMcpsRpcEndpoint } from "./endpoints/mcps-rpc.js";
import { setupThreadEndpoints } from "./endpoints/threads.js";
import type { RelayConfig } from "@onemcp/shared";

export interface ServerConfig {
  config: RelayConfig;
  port: number;
  bindAddress: string;
  headless: boolean;
  keyPath: string;
  cacheDir: string;
}

export async function startServer(serverConfig: ServerConfig) {
  const app = new Hono();

  // Logger
  const log = pino({
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  });

  // CORS middleware - wildcard for browser as MCP client (spec §2.1)
  app.use("*", cors({ origin: "*" }));

  // Request logging
  app.use("*", logger());

  // Initialize services
  const sessionManager = new SessionManager(serverConfig.keyPath);
  await sessionManager.initialize();

  const capsuleBuilder = new CapsuleBuilder({
    cacheDir: serverConfig.cacheDir,
    keyPath: serverConfig.keyPath,
    policy: serverConfig.config.policy,
    logger: log,
  });
  await capsuleBuilder.initialize();

  // Initialize MCP manager for upstream MCP servers
  const mcpManager = new MCPManager(serverConfig.config.mcps, log);

  // Generate TypeScript stubs for MCP tools
  if (serverConfig.config.mcps && serverConfig.config.mcps.length > 0) {
    const stubGenerator = new StubGenerator(mcpManager, ".relay/mcp", log);
    await stubGenerator.generateAllStubs(serverConfig.config.mcps.map(m => m.name));
  }

  // Initialize Node harness executor (QuickJS WASM) with MCP support
  const nodeExecutor = new NodeExecutor(
    serverConfig.cacheDir,
    serverConfig.config.policy.filesystem,
    mcpManager,
    serverConfig.config.mcps
  );
  await nodeExecutor.initialize();
  log.info("Node harness initialized (QuickJS WASM)");

  // Initialize capsule cleanup service
  const cleanupService = new CapsuleCleanupService({
    cacheDir: serverConfig.cacheDir,
    maxSizeBytes: 1024 * 1024 * 1024, // 1GB
    maxAgeDays: 7, // 7 days
    intervalMs: 60 * 60 * 1000, // 1 hour
  }, log);
  cleanupService.start();
  log.info("Capsule cleanup service started");

  // Initialize thread storage
  const threadStorage = await createServerThreadStorage({ type: "memory" }, log);
  log.info("Thread storage initialized");

  // Setup endpoints
  setupMcpEndpoint(app, capsuleBuilder, sessionManager, nodeExecutor, serverConfig.config);
  setupSessionEndpoints(app, sessionManager);
  setupCapsuleEndpoints(app, capsuleBuilder);
  setupMcpsRpcEndpoint(app, mcpManager);
  setupThreadEndpoints(app, threadStorage);

  // Simple execute endpoint for frontend tools (non-MCP)
  app.post("/execute", async (c) => {
    try {
      const body = await c.req.json();
      const { sessionId, runtime, code } = body;

      if (!sessionId || !runtime || !code) {
        return c.json({ error: "Missing required parameters: sessionId, runtime, code" }, 400);
      }

      if (runtime !== "quickjs") {
        return c.json({ error: "Only 'quickjs' runtime is currently supported" }, 400);
      }

      // Import QuickJSRuntime dynamically
      const { QuickJSRuntime } = await import("./harness/quickjs-runtime.js");
      const qjs = new QuickJSRuntime();

      // Create minimal capsule for execution
      const minimalCapsule = {
        version: "1.0.0",
        language: "js",
        entry: { path: "/index.js" },
        policy: serverConfig.config.policy || {
          limits: {
            timeoutMs: 30000,
            memMb: 128,
            stdoutBytes: 1048576
          }
        }
      };

      let stdout = "";
      let stderr = "";

      // Execute code using QuickJS
      const result = await qjs.execute(
        code,
        minimalCapsule as any,
        (chunk: string) => { stdout += chunk; },
        (chunk: string) => { stderr += chunk; }
      );

      return c.json({
        ...result,
        stdout,
        stderr
      });
    } catch (error: unknown) {
      log.error({ error }, "Execute endpoint error");
      return c.json({
        error: error instanceof Error ? error.message : String(error),
        success: false
      }, 500);
    }
  });

  // Static file serving for UI
  if (!serverConfig.headless) {
    const { serveStatic } = await import("@hono/node-server/serve-static");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    // Serve AI SDK integration example (built by Vite)
    // When built: packages/server/dist/index.js
    // Need to go up 3 levels to project root, then to examples/ai-sdk-integration/dist
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const websiteDist = resolve(__dirname, "../../../examples/ai-sdk-integration/dist");

    app.use("/*", serveStatic({ root: websiteDist }));
  }

  // Health check (headless mode only)
  if (serverConfig.headless) {
    app.get("/", (c) => {
      return c.json({
        name: "relay-mcp",
        status: "running",
        mode: "headless",
        executionMode: "node-harness-only",
        endpoints: {
          mcp: `POST http://${serverConfig.bindAddress}:${serverConfig.port}/mcp`,
          threads: `http://${serverConfig.bindAddress}:${serverConfig.port}/threads`,
        },
      });
    });
  }

  // Start server
  const server = serve(
    {
      fetch: app.fetch,
      port: serverConfig.port,
      hostname: serverConfig.bindAddress,
    },
    (info) => {
      log.info(
        `Server listening on http://${info.address}:${info.port}`
      );
    }
  );

  // Graceful shutdown (spec v1.3)
  process.on("SIGTERM", async () => {
    log.info("SIGTERM received, shutting down gracefully...");

    // Stop cleanup service
    cleanupService.stop();

    // Shutdown MCP manager first
    await mcpManager.shutdown();

    // Dispose node executor
    nodeExecutor.dispose();

    server.close(() => {
      log.info("Server closed");
      process.exit(0);
    });

    // Force close after grace period
    setTimeout(() => {
      log.warn("Forcing shutdown after grace period");
      process.exit(1);
    }, 30_000); // 30s grace period
  });

  return server;
}
