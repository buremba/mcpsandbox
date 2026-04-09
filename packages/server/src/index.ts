/**
 * Main server entry point
 *
 * Unified server running on Node.js with:
 * - SQLite database for sessions, rate limits, threads
 * - QuickJS WASM for sandboxed execution
 * - MCP server management
 * - LLM proxy with rate limiting
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import pino from "pino";
import { SessionManager } from "./services/session-manager.js";
import { MCPManager } from "./services/mcp-manager.js";
import { StubGenerator } from "./services/stub-generator.js";
import { createServerThreadStorage } from "./services/thread-storage.js";
import { setupMcpEndpoint } from "./endpoints/mcp.js";
import { setupSessionEndpoints } from "./endpoints/session.js";
import { setupMcpsRpcEndpoint } from "./endpoints/mcps-rpc.js";
import { setupThreadEndpoints } from "./endpoints/threads.js";
import { setupChatEndpoint } from "./endpoints/chat.js";
import { createBetterSqlite3Adapter } from "./db/better-sqlite3.js";
import { ensureSchema } from "./db/schema-init.js";
import { TokenManager } from "./services/token-manager.js";
import { RateLimiter } from "./services/rate-limiter.js";
import { QuickJSNodeBackend } from "./execution/quickjs-node.js";
import { createMemoryVFS } from "./vfs/memory.js";
import { createLocalVFS } from "./vfs/local.js";
import { createCompositeVFS } from "./vfs/composite.js";
import type { RelayConfig } from "@onemcp/shared";

export interface ServerConfig {
  config: RelayConfig;
  port: number;
  bindAddress: string;
  headless: boolean;
  keyPath: string;
  cacheDir: string;
  databasePath?: string;
  encryptionSecret?: string;
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

  // CORS middleware
  app.use("*", cors({ origin: "*" }));

  // Request logging
  app.use("*", logger());

  // Initialize database
  const databasePath = serverConfig.databasePath ?? `${serverConfig.cacheDir}/relay.db`;
  log.info(`Initializing database at ${databasePath}`);

  let db;
  try {
    db = await createBetterSqlite3Adapter({
      path: databasePath,
      create: true,
      walMode: true,
    });
    await ensureSchema(db);
    log.info("Database initialized");
  } catch (error) {
    log.warn({ error }, "SQLite not available, using in-memory storage");
    db = null;
  }

  // Initialize token manager for LLM proxy
  const encryptionSecret = serverConfig.encryptionSecret ?? "development-secret-change-in-production";
  const tokenManager = new TokenManager(encryptionSecret);
  await tokenManager.initialize();
  log.info("Token manager initialized");

  // Initialize rate limiter (if database available)
  let rateLimiter: RateLimiter | null = null;
  if (db) {
    rateLimiter = new RateLimiter(db);
    log.info("Rate limiter initialized");
  }

  // Initialize session manager
  const sessionManager = new SessionManager(serverConfig.keyPath);
  await sessionManager.initialize();

  // Initialize MCP manager for upstream MCP servers
  const mcpManager = new MCPManager(serverConfig.config.mcps, log);

  // Generate TypeScript stubs for MCP tools
  if (serverConfig.config.mcps && serverConfig.config.mcps.length > 0) {
    const stubGenerator = new StubGenerator(mcpManager, ".relay/mcp", log);
    await stubGenerator.generateAllStubs(serverConfig.config.mcps.map(m => m.name));
  }

  // Initialize execution backend (QuickJS WASM)
  const executor = new QuickJSNodeBackend({ verbose: false });
  await executor.initialize();
  log.info("QuickJS execution backend initialized");

  // Initialize VFS
  const vfs = createCompositeVFS();
  vfs.mount("/tmp", createMemoryVFS());
  try {
    vfs.mount("/workspace", await createLocalVFS({
      baseDir: serverConfig.cacheDir + "/workspace",
      createBaseDir: true,
    }));
    log.info("Local filesystem mounted at /workspace");
  } catch {
    log.warn("Local filesystem not available, using memory only");
  }

  // Initialize thread storage
  const threadStorage = await createServerThreadStorage({ type: "memory" }, log);
  log.info("Thread storage initialized");

  // Setup MCP endpoint with new execution backend
  setupMcpEndpoint(app, null as any, sessionManager, executor as any, serverConfig.config);
  setupSessionEndpoints(app, sessionManager);
  setupMcpsRpcEndpoint(app, mcpManager);
  setupThreadEndpoints(app, threadStorage);

  // Setup chat endpoint for LLM proxy (if rate limiter available)
  if (rateLimiter) {
    setupChatEndpoint(app, tokenManager, rateLimiter);
    log.info("Chat endpoint enabled with rate limiting");
  }

  // Execute endpoint using new execution backend
  app.post("/execute", async (c) => {
    try {
      const body = await c.req.json();
      const { code, options } = body;

      if (!code) {
        return c.json({ error: "Missing required parameter: code" }, 400);
      }

      const result = await executor.execute(code, {
        ...options,
        vfs,
        limits: {
          timeoutMs: serverConfig.config.policy?.limits?.timeoutMs ?? 30000,
          memMb: serverConfig.config.policy?.limits?.memMb ?? 128,
          stdoutBytes: serverConfig.config.policy?.limits?.stdoutBytes ?? 1048576,
        },
        network: serverConfig.config.policy?.network,
        mcpCallTool: (serverName, toolName, args) =>
          mcpManager.callTool(serverName, toolName, args),
        mcpConfigs: serverConfig.config.mcps,
      });

      return c.json(result);
    } catch (error: unknown) {
      log.error({ error }, "Execute endpoint error");
      return c.json({
        error: error instanceof Error ? error.message : String(error),
        success: false
      }, 500);
    }
  });

  // Token generation endpoint (for development/testing)
  app.post("/token/generate", async (c) => {
    try {
      const body = await c.req.json();
      const { apiKey, provider, developerId, userId, limits, expiresIn } = body;

      if (!apiKey || !provider || !developerId || !userId) {
        return c.json(
          { error: "Missing required fields: apiKey, provider, developerId, userId" },
          400
        );
      }

      const token = await tokenManager.generateToken({
        apiKey,
        provider,
        developerId,
        userId,
        limits: limits ?? {
          maxTokensPerRequest: 4000,
          maxTokensPerDay: 100000,
          maxRequestsPerMinute: 20,
          maxRequestsPerDay: 1000,
        },
        expiresIn,
      });

      return c.json({ token });
    } catch (error) {
      log.error({ error }, "Token generation error");
      return c.json(
        { error: error instanceof Error ? error.message : "Token generation error" },
        500
      );
    }
  });

  // Static file serving for UI
  if (!serverConfig.headless) {
    const { serveStatic } = await import("@hono/node-server/serve-static");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const websiteDist = resolve(__dirname, "../../../examples/ai-sdk-integration/dist");

    app.use("/*", serveStatic({ root: websiteDist }));
  }

  // Health check
  app.get("/", (c) => {
    return c.json({
      name: "relay-mcp",
      status: "running",
      mode: serverConfig.headless ? "headless" : "ui",
      platform: "node",
      endpoints: {
        mcp: `/mcp`,
        execute: `/execute`,
        chat: rateLimiter ? `/chat` : null,
        threads: `/threads`,
        token: `/token/generate`,
      },
    });
  });

  // Start server
  const server = serve(
    {
      fetch: app.fetch,
      port: serverConfig.port,
      hostname: serverConfig.bindAddress,
    },
    (info) => {
      log.info(`Server listening on http://${info.address}:${info.port}`);
    }
  );

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info(`${signal} received, shutting down gracefully...`);

    await mcpManager.shutdown();
    await executor.dispose();
    if (db) await db.close();

    server.close(() => {
      log.info("Server closed");
      process.exit(0);
    });

    setTimeout(() => {
      log.warn("Forcing shutdown after grace period");
      process.exit(1);
    }, 30000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}

// Re-export new modules
export * from "./db/index.js";
export * from "./execution/index.js";
export * from "./vfs/index.js";
export * from "./services/token-manager.js";
export * from "./services/rate-limiter.js";
