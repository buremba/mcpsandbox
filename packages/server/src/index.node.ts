/**
 * Node.js Entry Point
 *
 * Unified server running on Node.js with:
 * - better-sqlite3 for database
 * - Local filesystem for file storage
 * - QuickJS WASM for sandboxed execution
 * - JWE-encrypted API keys for secure LLM proxying
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import pino from "pino";
import { createBetterSqlite3Adapter } from "./db/better-sqlite3.js";
import { ensureSchema } from "./db/schema-init.js";
import { TokenManager } from "./services/token-manager.js";
import { RateLimiter } from "./services/rate-limiter.js";
import { QuickJSNodeBackend } from "./execution/quickjs-node.js";
import { createMemoryVFS } from "./vfs/memory.js";
import { createLocalVFS } from "./vfs/local.js";
import { createCompositeVFS } from "./vfs/composite.js";
import { setupChatEndpoint } from "./endpoints/chat.js";

/**
 * Node.js server configuration
 */
export interface NodeServerConfig {
  /** Server port */
  port: number;
  /** Bind address */
  host: string;
  /** Database path */
  databasePath: string;
  /** Encryption secret for JWE tokens */
  encryptionSecret: string;
  /** Working directory for file operations */
  workDir: string;
  /** Allowed CORS origins */
  allowedOrigins?: string[];
}

/**
 * Start the Node.js server
 */
export async function startNodeServer(config: NodeServerConfig) {
  const log = pino({
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  });

  // Initialize database
  log.info("Initializing database...");
  const db = await createBetterSqlite3Adapter({
    path: config.databasePath,
    create: true,
    walMode: true,
  });
  await ensureSchema(db);
  log.info(`Database initialized at ${config.databasePath}`);

  // Initialize token manager
  log.info("Initializing token manager...");
  const tokenManager = new TokenManager(config.encryptionSecret);
  await tokenManager.initialize();

  // Initialize rate limiter
  const rateLimiter = new RateLimiter(db);

  // Initialize execution backend
  log.info("Initializing QuickJS execution backend...");
  const executor = new QuickJSNodeBackend();
  await executor.initialize();

  // Initialize VFS
  log.info("Initializing virtual filesystem...");
  const vfs = createCompositeVFS();
  vfs.mount("/tmp", createMemoryVFS());
  vfs.mount("/workspace", await createLocalVFS({
    baseDir: config.workDir,
    createBaseDir: true,
  }));

  // Create Hono app
  const app = new Hono();

  // CORS middleware
  const origins = config.allowedOrigins ?? ["*"];
  app.use("*", cors({ origin: origins }));

  // Request logging
  app.use("*", logger());

  // Setup endpoints
  setupChatEndpoint(app, tokenManager, rateLimiter);

  // Health check
  app.get("/", (c) => {
    return c.json({
      name: "relay-mcp",
      status: "running",
      platform: "node",
      version: "1.0.0",
      endpoints: {
        chat: "/chat",
        execute: "/execute",
        health: "/",
      },
    });
  });

  // Execute code endpoint
  app.post("/execute", async (c) => {
    try {
      const body = await c.req.json();
      const { code, options } = body;

      if (!code) {
        return c.json({ error: "Missing code" }, 400);
      }

      const result = await executor.execute(code, {
        ...options,
        vfs,
      });

      return c.json(result);
    } catch (error) {
      log.error({ error }, "Execute endpoint error");
      return c.json(
        { error: error instanceof Error ? error.message : "Execution error" },
        500
      );
    }
  });

  // Generate token endpoint (for development/testing)
  app.post("/token/generate", async (c) => {
    try {
      const body = await c.req.json();
      const {
        apiKey,
        provider,
        developerId,
        userId,
        limits,
        expiresIn,
      } = body;

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

  // Start server
  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host,
    },
    (info) => {
      log.info(`Server listening on http://${info.address}:${info.port}`);
    }
  );

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info(`${signal} received, shutting down gracefully...`);

    await executor.dispose();
    await db.close();

    server.close(() => {
      log.info("Server closed");
      process.exit(0);
    });

    // Force close after 30s
    setTimeout(() => {
      log.warn("Forcing shutdown after grace period");
      process.exit(1);
    }, 30000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}

/**
 * CLI entry point
 */
export async function main() {
  const config: NodeServerConfig = {
    port: parseInt(process.env.PORT ?? "3000"),
    host: process.env.HOST ?? "0.0.0.0",
    databasePath: process.env.DATABASE_PATH ?? "./data/relay.db",
    encryptionSecret: process.env.ENCRYPTION_SECRET ?? "development-secret-change-in-production",
    workDir: process.env.WORK_DIR ?? "./workspace",
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(","),
  };

  await startNodeServer(config);
}

// Run if called directly
const isMainModule = import.meta.url.endsWith(process.argv[1] ?? "");
if (isMainModule) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
