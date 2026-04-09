/**
 * Schema initialization utilities
 *
 * Provides functions to initialize the database schema across all adapters.
 */

import type { DatabaseAdapter } from "./interface.js";

/**
 * SQL statements to create the schema
 * Split into individual statements for compatibility with all adapters
 */
const SCHEMA_STATEMENTS = [
  // Sessions table
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'browser' CHECK (type IN ('browser', 'mcp')),
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    browser_attached INTEGER NOT NULL DEFAULT 0,
    metadata TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_browser_attached ON sessions(browser_attached)`,

  // Rate limits table
  `CREATE TABLE IF NOT EXISTS rate_limits (
    developer_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    tokens_used_today INTEGER NOT NULL DEFAULT 0,
    requests_today INTEGER NOT NULL DEFAULT 0,
    requests_this_minute INTEGER NOT NULL DEFAULT 0,
    day_reset_at INTEGER NOT NULL,
    minute_reset_at INTEGER NOT NULL,
    PRIMARY KEY (developer_id, user_id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(day_reset_at)`,

  // Threads table
  `CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'regular' CHECK (status IN ('regular', 'archived', 'deleted')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    metadata TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status)`,

  // Messages table
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    status TEXT DEFAULT 'complete' CHECK (status IN ('pending', 'streaming', 'complete', 'error')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    tool_calls TEXT,
    metadata TEXT,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(thread_id, created_at)`,

  // Event queue table
  `CREATE TABLE IF NOT EXISTS event_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE INDEX IF NOT EXISTS idx_events_session_run ON event_queue(session_id, run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON event_queue(processed, created_at)`,

  // Schema version table
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`,
];

/**
 * Initialize the database schema
 * Creates all tables and indexes if they don't exist
 *
 * @param db Database adapter
 * @param version Schema version to record (default: 1)
 */
export async function initializeSchema(
  db: DatabaseAdapter,
  version: number = 1
): Promise<void> {
  // Execute each statement
  for (const sql of SCHEMA_STATEMENTS) {
    await db.exec(sql);
  }

  // Record schema version (ignore if already exists)
  await db.exec(
    "INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)",
    [version, Date.now()]
  );
}

/**
 * Get the current schema version
 *
 * @param db Database adapter
 * @returns Current schema version or null if not initialized
 */
export async function getSchemaVersion(
  db: DatabaseAdapter
): Promise<number | null> {
  try {
    const result = await db.queryOne<{ version: number }>(
      "SELECT MAX(version) as version FROM schema_version"
    );
    return result?.version ?? null;
  } catch {
    // Table doesn't exist yet
    return null;
  }
}

/**
 * Check if the schema is initialized
 *
 * @param db Database adapter
 * @returns True if schema is initialized
 */
export async function isSchemaInitialized(db: DatabaseAdapter): Promise<boolean> {
  const version = await getSchemaVersion(db);
  return version !== null;
}

/**
 * Ensure schema is initialized, creating it if necessary
 *
 * @param db Database adapter
 */
export async function ensureSchema(db: DatabaseAdapter): Promise<void> {
  const initialized = await isSchemaInitialized(db);
  if (!initialized) {
    await initializeSchema(db);
  }
}
