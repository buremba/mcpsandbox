/**
 * better-sqlite3 Database Adapter for Node.js
 *
 * better-sqlite3 is a synchronous SQLite driver for Node.js.
 * This adapter wraps it with async methods for consistency with D1.
 *
 * NOTE: This file requires better-sqlite3 to be installed as an optional dependency.
 * It will throw at runtime if not available.
 *
 * @see https://github.com/WiseLibs/better-sqlite3
 */

import type {
  DatabaseAdapter,
  DatabaseAdapterOptions,
  ExecResult,
} from "./interface.js";

/**
 * Type definitions for better-sqlite3
 * We define these here to avoid requiring the @types/better-sqlite3 package
 */
interface BetterSqlite3Database {
  prepare(sql: string): BetterSqlite3Statement;
  exec(sql: string): BetterSqlite3Database;
  transaction<T>(fn: () => T): () => T;
  close(): void;
  open: boolean;
}

interface BetterSqlite3Statement {
  run(...params: unknown[]): BetterSqlite3RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  bind(...params: unknown[]): BetterSqlite3Statement;
}

interface BetterSqlite3RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Options specific to better-sqlite3 adapter
 */
export interface BetterSqlite3AdapterOptions extends DatabaseAdapterOptions {
  /** Path to the SQLite database file */
  path: string;
  /** Whether to create the database if it doesn't exist (default: true) */
  create?: boolean;
  /** Whether to open the database in read-only mode */
  readonly?: boolean;
  /** Enable WAL mode for better concurrent access (default: true) */
  walMode?: boolean;
}

/**
 * better-sqlite3 Database Adapter for Node.js
 */
export class BetterSqlite3Adapter implements DatabaseAdapter {
  private db: BetterSqlite3Database;
  private verbose: boolean;

  constructor(db: BetterSqlite3Database, options?: DatabaseAdapterOptions) {
    this.db = db;
    this.verbose = options?.verbose ?? false;
  }

  async exec(sql: string, params?: unknown[]): Promise<ExecResult> {
    if (!this.db.open) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[SQLite] exec:", sql, params);
    }

    const stmt = this.db.prepare(sql);
    const result = params && params.length > 0 ? stmt.run(...params) : stmt.run();

    return {
      rowsAffected: result.changes,
    };
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.db.open) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[SQLite] query:", sql, params);
    }

    const stmt = this.db.prepare(sql);
    const results = params && params.length > 0 ? stmt.all(...params) : stmt.all();

    return results as T[];
  }

  async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
    if (!this.db.open) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[SQLite] queryOne:", sql, params);
    }

    const stmt = this.db.prepare(sql);
    const result = params && params.length > 0 ? stmt.get(...params) : stmt.get();

    return (result as T) ?? null;
  }

  async batch(statements: [string, unknown[]?][]): Promise<ExecResult[]> {
    if (!this.db.open) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[SQLite] batch:", statements.length, "statements");
    }

    const results: ExecResult[] = [];

    // Use a transaction for batch operations
    const runBatch = this.db.transaction(() => {
      for (const [sql, params] of statements) {
        const stmt = this.db.prepare(sql);
        const result = params && params.length > 0 ? stmt.run(...params) : stmt.run();
        results.push({ rowsAffected: result.changes });
      }
    });

    runBatch();
    return results;
  }

  async transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    if (!this.db.open) {
      throw new Error("Database connection is closed");
    }

    // better-sqlite3 transactions are synchronous, but our interface is async.
    // We need to handle this carefully - we'll use BEGIN/COMMIT/ROLLBACK manually
    // since the callback is async.

    try {
      this.db.exec("BEGIN IMMEDIATE");
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Ignore rollback errors
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db.open) {
      this.db.close();
    }
  }

  isOpen(): boolean {
    return this.db.open;
  }
}

/**
 * Create a better-sqlite3 database adapter
 * @param options Adapter options including the database path
 */
// Type for the better-sqlite3 default export
type BetterSqlite3Constructor = new (
  path: string,
  options?: { readonly?: boolean; fileMustExist?: boolean }
) => BetterSqlite3Database;

export async function createBetterSqlite3Adapter(
  options: BetterSqlite3AdapterOptions
): Promise<DatabaseAdapter> {
  // Dynamic import to avoid bundling better-sqlite3 in non-Node environments
  // Use a variable to prevent TypeScript from trying to resolve the module at compile time
  const moduleName = "better-sqlite3";
  const mod = await import(/* @vite-ignore */ moduleName) as { default: BetterSqlite3Constructor };
  const Database = mod.default;

  const db: BetterSqlite3Database = new Database(options.path, {
    readonly: options.readonly ?? false,
    fileMustExist: !(options.create ?? true),
  });

  // Enable WAL mode for better concurrent access
  if (options.walMode !== false && !options.readonly) {
    db.exec("PRAGMA journal_mode = WAL");
  }

  // Enable foreign keys
  db.exec("PRAGMA foreign_keys = ON");

  return new BetterSqlite3Adapter(db, options);
}

/**
 * Create an in-memory better-sqlite3 database adapter
 * Useful for testing
 */
export async function createInMemorySqlite3Adapter(
  options?: DatabaseAdapterOptions
): Promise<DatabaseAdapter> {
  return createBetterSqlite3Adapter({
    ...options,
    path: ":memory:",
    walMode: false, // WAL mode doesn't work with in-memory databases
  });
}
