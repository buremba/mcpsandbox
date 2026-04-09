/**
 * Cloudflare Workers Entry Point
 *
 * Unified server running on Cloudflare Workers with:
 * - D1 database for sessions, rate limits, threads
 * - R2 for file storage (optional)
 * - JWE-encrypted API keys for secure LLM proxying
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { D1Adapter, type D1Database } from "./db/d1.js";
import { ensureSchema } from "./db/schema-init.js";
import { TokenManager } from "./services/token-manager.js";
import { RateLimiter } from "./services/rate-limiter.js";
import { createMemoryVFS } from "./vfs/memory.js";
import { createR2VFS, type R2Bucket } from "./vfs/r2.js";
import { createCompositeVFS } from "./vfs/composite.js";
import { setupChatEndpoint } from "./endpoints/chat.js";

/**
 * Cloudflare Workers Environment
 */
export interface CloudflareEnv {
  // D1 Database
  DB: D1Database;

  // R2 Bucket (optional)
  STORAGE?: R2Bucket;

  // Secrets
  ENCRYPTION_SECRET: string;
  SIGNING_KEY?: string;

  // Optional configuration
  ALLOWED_ORIGINS?: string;
}

/**
 * ExecutionContext type for Workers
 */
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Cached services to avoid re-initialization on every request
let cachedServices: {
  db: D1Adapter;
  tokenManager: TokenManager;
  rateLimiter: RateLimiter;
  vfs: ReturnType<typeof createCompositeVFS>;
  schemaInitialized: boolean;
} | null = null;

/**
 * Workers handler
 */
export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    _ctx: ExecutionContext
  ): Promise<Response> {
    try {
      // Create Hono app
      const app = new Hono();

      // CORS middleware
      const origins = env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) ?? ["*"];
      app.use("*", cors({ origin: origins }));

      // Request logging
      app.use("*", logger());

      // Initialize services (cached across requests in same isolate)
      if (!cachedServices) {
        const db = new D1Adapter(env.DB);
        const tokenManager = new TokenManager(env.ENCRYPTION_SECRET);
        await tokenManager.initialize();
        const rateLimiter = new RateLimiter(db);
        const vfs = createCompositeVFS();
        vfs.mount("/tmp", createMemoryVFS());
        if (env.STORAGE) {
          vfs.mount("/storage", createR2VFS({ bucket: env.STORAGE }));
        }
        cachedServices = { db, tokenManager, rateLimiter, vfs, schemaInitialized: false };
      }

      // Initialize schema on first request
      if (!cachedServices.schemaInitialized) {
        await ensureSchema(cachedServices.db);
        cachedServices.schemaInitialized = true;
      }

      // Setup endpoints
      setupChatEndpoint(app, cachedServices.tokenManager, cachedServices.rateLimiter);

      // Health check
      app.get("/", (c) => {
        return c.json({
          name: "relay-mcp",
          status: "running",
          platform: "cloudflare-workers",
          version: "1.0.0",
        });
      });

      // MCP endpoint (placeholder - would need full MCP protocol implementation)
      app.post("/mcp", async (c) => {
        return c.json({ error: "MCP endpoint not yet implemented" }, 501);
      });

      return app.fetch(request);
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
