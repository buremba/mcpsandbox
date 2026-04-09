/**
 * Database adapter interface for cross-platform SQLite support
 *
 * Implementations:
 * - D1Adapter: Cloudflare D1 (Workers)
 * - BetterSqlite3Adapter: Node.js (better-sqlite3)
 * - SqlJsAdapter: Browser (sql.js with IndexedDB persistence)
 */

/**
 * Result of an exec operation (no return values)
 */
export interface ExecResult {
  /** Number of rows affected by the operation */
  rowsAffected: number;
}

/**
 * Options for query operations
 */
export interface QueryOptions {
  /** Whether to return only the first result */
  first?: boolean;
}

/**
 * Database adapter interface
 * All implementations must support standard SQL operations
 */
export interface DatabaseAdapter {
  /**
   * Execute a SQL statement that doesn't return data (INSERT, UPDATE, DELETE)
   * @param sql SQL statement with optional parameter placeholders (?)
   * @param params Parameter values to bind
   * @returns Execution result with rowsAffected
   */
  exec(sql: string, params?: unknown[]): Promise<ExecResult>;

  /**
   * Execute a SQL query and return all matching rows
   * @param sql SQL query with optional parameter placeholders (?)
   * @param params Parameter values to bind
   * @returns Array of result rows
   */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a SQL query and return only the first row
   * @param sql SQL query with optional parameter placeholders (?)
   * @param params Parameter values to bind
   * @returns First result row or null if no results
   */
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;

  /**
   * Execute multiple SQL statements in a batch
   * All statements are executed in a transaction
   * @param statements Array of [sql, params] tuples
   * @returns Array of exec results
   */
  batch(statements: [string, unknown[]?][]): Promise<ExecResult[]>;

  /**
   * Execute statements within a transaction
   * If the callback throws, the transaction is rolled back
   * @param fn Callback receiving the adapter for use within the transaction
   * @returns Result of the callback
   */
  transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T>;

  /**
   * Close the database connection
   * After calling close, the adapter should not be used
   */
  close(): Promise<void>;

  /**
   * Check if the database connection is open
   */
  isOpen(): boolean;
}

/**
 * Options for creating a database adapter
 */
export interface DatabaseAdapterOptions {
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Factory function type for creating database adapters
 */
export type DatabaseAdapterFactory = (
  options?: DatabaseAdapterOptions
) => Promise<DatabaseAdapter>;
