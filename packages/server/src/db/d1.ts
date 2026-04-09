/**
 * Cloudflare D1 Database Adapter
 *
 * D1 is Cloudflare's serverless SQLite database.
 * This adapter wraps the D1 binding for use with our DatabaseAdapter interface.
 *
 * @see https://developers.cloudflare.com/d1/
 */

import type {
  DatabaseAdapter,
  DatabaseAdapterOptions,
  ExecResult,
} from "./interface.js";

/**
 * D1Database type from Cloudflare Workers
 * This mirrors the actual D1Database interface without requiring the full types package
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
  };
}

interface D1ExecResult {
  count: number;
  duration: number;
}

/**
 * D1 Database Adapter for Cloudflare Workers
 */
export class D1Adapter implements DatabaseAdapter {
  private db: D1Database;
  private _isOpen: boolean = true;
  private verbose: boolean;

  constructor(db: D1Database, options?: DatabaseAdapterOptions) {
    this.db = db;
    this.verbose = options?.verbose ?? false;
  }

  async exec(sql: string, params?: unknown[]): Promise<ExecResult> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[D1] exec:", sql, params);
    }

    const stmt = this.db.prepare(sql);
    const bound = params && params.length > 0 ? stmt.bind(...params) : stmt;
    const result = await bound.run();

    return {
      rowsAffected: result.meta.changes,
    };
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[D1] query:", sql, params);
    }

    const stmt = this.db.prepare(sql);
    const bound = params && params.length > 0 ? stmt.bind(...params) : stmt;
    const result = await bound.all<T>();

    return result.results ?? [];
  }

  async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[D1] queryOne:", sql, params);
    }

    const stmt = this.db.prepare(sql);
    const bound = params && params.length > 0 ? stmt.bind(...params) : stmt;
    const result = await bound.first<T>();

    return result;
  }

  async batch(statements: [string, unknown[]?][]): Promise<ExecResult[]> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    if (this.verbose) {
      console.log("[D1] batch:", statements.length, "statements");
    }

    const preparedStatements = statements.map(([sql, params]) => {
      const stmt = this.db.prepare(sql);
      return params && params.length > 0 ? stmt.bind(...params) : stmt;
    });

    const results = await this.db.batch(preparedStatements);

    return results.map((result) => ({
      rowsAffected: result.meta.changes,
    }));
  }

  async transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    if (!this._isOpen) {
      throw new Error("Database connection is closed");
    }

    // D1 batch() is already transactional, but for the transaction API,
    // we need to wrap in BEGIN/COMMIT. D1 doesn't support explicit transactions
    // in the traditional sense, so we use a workaround with batch.
    //
    // Note: D1's batch() automatically wraps statements in a transaction,
    // but the transaction() API expects a callback that can make multiple
    // individual calls. For now, we just execute the callback directly.
    // In a production system, you might want to buffer statements and
    // execute them in a batch at the end.
    //
    // TODO: Implement proper transaction buffering for D1
    try {
      const result = await fn(this);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async close(): Promise<void> {
    // D1 doesn't require explicit connection closing
    // The binding is managed by the Workers runtime
    this._isOpen = false;
  }

  isOpen(): boolean {
    return this._isOpen;
  }
}

/**
 * Create a D1 database adapter
 * @param db D1 database binding from the Workers environment
 * @param options Adapter options
 */
export function createD1Adapter(
  db: D1Database,
  options?: DatabaseAdapterOptions
): DatabaseAdapter {
  return new D1Adapter(db, options);
}
