/**
 * Database module exports
 *
 * Provides a unified interface for database operations across:
 * - Cloudflare D1 (Workers)
 * - better-sqlite3 (Node.js)
 * - sql.js (Browser)
 */

// Core interface
export type {
  DatabaseAdapter,
  DatabaseAdapterOptions,
  DatabaseAdapterFactory,
  ExecResult,
  QueryOptions,
} from "./interface.js";

// Adapters - imported conditionally based on environment
export { D1Adapter, createD1Adapter } from "./d1.js";
export type { D1Database } from "./d1.js";

export {
  BetterSqlite3Adapter,
  createBetterSqlite3Adapter,
  createInMemorySqlite3Adapter,
} from "./better-sqlite3.js";
export type { BetterSqlite3AdapterOptions } from "./better-sqlite3.js";

export {
  SqlJsAdapter,
  createSqlJsAdapter,
  createInMemorySqlJsAdapter,
} from "./sql-js.js";
export type { SqlJsAdapterOptions } from "./sql-js.js";

// Schema utilities
export {
  initializeSchema,
  getSchemaVersion,
  isSchemaInitialized,
  ensureSchema,
} from "./schema-init.js";

/**
 * Detect runtime environment and return appropriate adapter factory
 */
export function detectEnvironment(): "workers" | "node" | "browser" {
  // Check for Cloudflare Workers
  if (
    typeof globalThis !== "undefined" &&
    "caches" in globalThis &&
    !("navigator" in globalThis)
  ) {
    return "workers";
  }

  // Check for Node.js
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    return "node";
  }

  // Default to browser
  return "browser";
}
