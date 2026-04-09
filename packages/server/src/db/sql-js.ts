/**
 * sql.js Database Adapter for Browser
 *
 * sql.js is a JavaScript SQLite implementation that runs in the browser.
 * This adapter wraps it for use with our DatabaseAdapter interface.
 * Optionally supports persistence via IndexedDB.
 *
 * @see https://github.com/sql-js/sql.js
 */

/// <reference lib="dom" />

import type {
  DatabaseAdapter,
  DatabaseAdapterOptions,
  ExecResult,
} from "./interface.js";

/**
 * Type definitions for sql.js
 */
interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string): SqlJsQueryExecResult[];
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsStatement {
  bind(params?: unknown[]): boolean;
  step(): boolean;
  get(params?: unknown[]): unknown[];
  getAsObject(params?: unknown[]): Record<string, unknown>;
  free(): boolean;
  reset(): void;
}

interface SqlJsQueryExecResult {
  columns: string[];
  values: unknown[][];
}

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

/**
 * Options specific to sql.js adapter
 */
export interface SqlJsAdapterOptions extends DatabaseAdapterOptions {
  /** Initial database data (Uint8Array from a previous export) */
  data?: Uint8Array;
  /** IndexedDB database name for persistence */
  persistKey?: string;
  /** Auto-save interval in milliseconds (default: 5000, 0 to disable) */
  autoSaveInterval?: number;
}

/**
 * sql.js Database Adapter for Browser
 */
export class SqlJsAdapter implements DatabaseAdapter {
  private db: SqlJsDatabase;
  private verbose: boolean;
  private persistKey?: string;
  private autoSaveTimer?: ReturnType<typeof setInterval>;
  private _isOpen: boolean = true;
  private dirty: boolean = false;

  constructor(
    db: SqlJsDatabase,
    options?: SqlJsAdapterOptions
  ) {
    this.db = db;
    this.verbose = options?.verbose ?? false;
    this.persistKey = options?.persistKey;

    // Set up auto-save if persistence is enabled
    if (this.persistKey && options?.autoSaveInterval !== 0) {
      const interval = options?.autoSaveInterval ?? 5000;
      this.autoSaveTimer = setInterval(() => this.persistIfDirty(), interval);
    }
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private async persistIfDirty(): Promise<void> {
    if (!this.dirty || !this.persistKey || !this._isOpen) return;

    try {
      await this.persist();
      this.dirty = false;
    } catch (error) {
      console.error("[sql.js] Auto-persist failed:", error);
    }
  }

  /**
   * Persist the database to IndexedDB
   */
  async persist(): Promise<void> {
    if (!this.persistKey) {
      throw new Error("No persistKey configured");
    }

    const data = this.db.export();
    await saveToIndexedDB(this.persistKey, data);

    if (this.verbose) {
      console.log("[sql.js] Persisted to IndexedDB:", this.persistKey);
    }
  }

  async exec(sql: string, params?: unknown[]): Promise<ExecResult> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[sql.js] exec:", sql, params);
    }

    try {
      this.db.run(sql, params);
      this.markDirty();

      // sql.js doesn't provide changes count directly for run()
      // We can use a workaround with changes() if needed
      return { rowsAffected: 0 };
    } catch (error) {
      throw new Error(`SQL exec error: ${error}`);
    }
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[sql.js] query:", sql, params);
    }

    try {
      const stmt = this.db.prepare(sql);
      const results: T[] = [];

      if (params && params.length > 0) {
        stmt.bind(params);
      }

      while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
      }

      stmt.free();
      return results;
    } catch (error) {
      throw new Error(`SQL query error: ${error}`);
    }
  }

  async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[sql.js] queryOne:", sql, params);
    }

    try {
      const stmt = this.db.prepare(sql);

      if (params && params.length > 0) {
        stmt.bind(params);
      }

      let result: T | null = null;
      if (stmt.step()) {
        result = stmt.getAsObject() as T;
      }

      stmt.free();
      return result;
    } catch (error) {
      throw new Error(`SQL queryOne error: ${error}`);
    }
  }

  async batch(statements: [string, unknown[]?][]): Promise<ExecResult[]> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[sql.js] batch:", statements.length, "statements");
    }

    const results: ExecResult[] = [];

    try {
      this.db.run("BEGIN TRANSACTION");

      for (const [sql, params] of statements) {
        this.db.run(sql, params);
        results.push({ rowsAffected: 0 });
      }

      this.db.run("COMMIT");
      this.markDirty();
    } catch (error) {
      try {
        this.db.run("ROLLBACK");
      } catch {
        // Ignore rollback errors
      }
      throw error;
    }

    return results;
  }

  async transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    try {
      this.db.run("BEGIN TRANSACTION");
      const result = await fn(this);
      this.db.run("COMMIT");
      this.markDirty();
      return result;
    } catch (error) {
      try {
        this.db.run("ROLLBACK");
      } catch {
        // Ignore rollback errors
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (!this._isOpen) return;

    // Persist before closing if dirty
    if (this.dirty && this.persistKey) {
      await this.persist();
    }

    // Clear auto-save timer
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }

    this.db.close();
    this._isOpen = false;
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Export the database as a Uint8Array
   * Useful for backup or transfer
   */
  export(): Uint8Array {
    return this.db.export();
  }
}

/**
 * IndexedDB helpers for persistence
 */
const IDB_NAME = "relay-mcp-sqljs";
const IDB_STORE = "databases";

async function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

async function saveToIndexedDB(key: string, data: Uint8Array): Promise<void> {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const request = store.put(data, key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

async function loadFromIndexedDB(key: string): Promise<Uint8Array | null> {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db.close();
      resolve(request.result ?? null);
    };
  });
}

/**
 * Load sql.js library
 * This handles loading the WASM binary
 */
async function loadSqlJs(): Promise<SqlJsStatic> {
  // In a browser environment, sql.js is typically loaded from a CDN
  // or bundled with the application
  const initSqlJs = (globalThis as unknown as { initSqlJs?: (config: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic> }).initSqlJs;

  if (!initSqlJs) {
    throw new Error(
      "sql.js not loaded. Please include sql.js script before using SqlJsAdapter"
    );
  }

  return initSqlJs({
    // Use the CDN for the WASM file by default
    locateFile: (file: string) =>
      `https://sql.js.org/dist/${file}`,
  });
}

/**
 * Create a sql.js database adapter
 * @param options Adapter options
 */
export async function createSqlJsAdapter(
  options?: SqlJsAdapterOptions
): Promise<SqlJsAdapter> {
  const SQL = await loadSqlJs();

  let data = options?.data;

  // Try to load from IndexedDB if persistKey is set and no initial data
  if (!data && options?.persistKey) {
    data = (await loadFromIndexedDB(options.persistKey)) ?? undefined;
  }

  const db = new SQL.Database(data);

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  return new SqlJsAdapter(db, options);
}

/**
 * Create an in-memory sql.js database adapter
 * No persistence, useful for testing
 */
export async function createInMemorySqlJsAdapter(
  options?: DatabaseAdapterOptions
): Promise<SqlJsAdapter> {
  return createSqlJsAdapter({
    ...options,
    persistKey: undefined,
  });
}
