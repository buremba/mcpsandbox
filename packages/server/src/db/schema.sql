-- Relay MCP SQLite Schema
-- Compatible with D1, better-sqlite3, and sql.js

-- Sessions table: Track browser and MCP sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'browser' CHECK (type IN ('browser', 'mcp')),
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  browser_attached INTEGER NOT NULL DEFAULT 0,
  metadata TEXT  -- JSON blob for additional session data
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen);
CREATE INDEX IF NOT EXISTS idx_sessions_browser_attached ON sessions(browser_attached);

-- Rate limits table: Track API usage per developer/user
CREATE TABLE IF NOT EXISTS rate_limits (
  developer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tokens_used_today INTEGER NOT NULL DEFAULT 0,
  requests_today INTEGER NOT NULL DEFAULT 0,
  requests_this_minute INTEGER NOT NULL DEFAULT 0,
  day_reset_at INTEGER NOT NULL,
  minute_reset_at INTEGER NOT NULL,
  PRIMARY KEY (developer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(day_reset_at);

-- Threads table: Chat thread metadata
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'regular' CHECK (status IN ('regular', 'archived', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT  -- JSON blob for additional thread data
);

CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);

-- Messages table: Chat messages within threads
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  status TEXT DEFAULT 'complete' CHECK (status IN ('pending', 'streaming', 'complete', 'error')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  tool_calls TEXT,  -- JSON blob for tool call data
  metadata TEXT,    -- JSON blob for additional message data
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(thread_id, created_at);

-- Event queue table: For backchannel events and results
CREATE TABLE IF NOT EXISTS event_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,  -- JSON blob
  created_at INTEGER NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_events_session_run ON event_queue(session_id, run_id);
CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON event_queue(processed, created_at);

-- Schema version for migrations
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- Insert initial schema version
INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, strftime('%s', 'now') * 1000);
