/**
 * Virtual Filesystem Backend Interface
 *
 * Unified VFS interface for cross-platform file storage:
 * - Memory (all platforms)
 * - Local filesystem (Node.js)
 * - Git repository (via container)
 * - Cloudflare R2
 * - AWS S3
 * - Google Drive
 */

/**
 * File information
 */
export interface FileInfo {
  /** File path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Whether this is a file */
  isFile: boolean;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Last modified timestamp (ms) */
  modifiedAt: number;
  /** Content type (MIME) if known */
  contentType?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

/**
 * Options for listing files
 */
export interface ListOptions {
  /** Recurse into subdirectories */
  recursive?: boolean;
  /** Maximum number of entries to return */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
}

/**
 * Result of listing files
 */
export interface ListResult {
  /** File/directory names */
  entries: string[];
  /** Whether there are more entries */
  hasMore: boolean;
  /** Cursor for next page */
  cursor?: string;
}

/**
 * Options for writing files
 */
export interface WriteOptions {
  /** Content type (MIME) */
  contentType?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
  /** Create parent directories if needed */
  createParents?: boolean;
}

/**
 * VFS backend capabilities
 */
export interface VFSCapabilities {
  /** Supports read operations */
  read: boolean;
  /** Supports write operations */
  write: boolean;
  /** Supports delete operations */
  delete: boolean;
  /** Supports directory operations */
  directories: boolean;
  /** Supports symbolic links */
  symlinks: boolean;
  /** Supports watching for changes */
  watch: boolean;
  /** Maximum file size in bytes (0 = unlimited) */
  maxFileSize: number;
}

/**
 * VFS Backend Interface
 *
 * All paths are POSIX-style (forward slashes) and absolute (start with /).
 */
export interface VFSBackend {
  /** Backend name (e.g., "memory", "local", "r2") */
  readonly name: string;

  /** Backend capabilities */
  readonly capabilities: VFSCapabilities;

  /**
   * Read file contents
   * @throws Error if file doesn't exist
   */
  read(path: string): Promise<Uint8Array>;

  /**
   * Read file as text
   * @throws Error if file doesn't exist
   */
  readText(path: string): Promise<string>;

  /**
   * Write file contents
   * @throws Error if parent directory doesn't exist (unless createParents=true)
   */
  write(path: string, data: Uint8Array, options?: WriteOptions): Promise<void>;

  /**
   * Write text file
   */
  writeText(path: string, text: string, options?: WriteOptions): Promise<void>;

  /**
   * Delete a file
   * @throws Error if file doesn't exist
   */
  delete(path: string): Promise<void>;

  /**
   * Get file/directory info
   * @throws Error if path doesn't exist
   */
  stat(path: string): Promise<FileInfo>;

  /**
   * Check if file/directory exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * List directory contents
   * @throws Error if path is not a directory
   */
  list(path: string, options?: ListOptions): Promise<string[]>;

  /**
   * List directory contents with pagination
   */
  listPaginated(path: string, options?: ListOptions): Promise<ListResult>;

  /**
   * Create directory
   * @throws Error if parent doesn't exist (unless recursive=true)
   */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Remove directory
   * @throws Error if directory is not empty (unless recursive=true)
   */
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Copy file or directory
   */
  copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Move/rename file or directory
   */
  move(src: string, dest: string): Promise<void>;

  /**
   * Initialize the backend
   */
  initialize?(): Promise<void>;

  /**
   * Close/cleanup the backend
   */
  close?(): Promise<void>;
}

/**
 * Mount configuration for composite VFS
 */
export interface MountConfig {
  /** VFS path to mount at (e.g., "/workspace") */
  target: string;
  /** Backend type */
  type: MountType;
  /** Source (interpretation depends on type) */
  source?: string;
  /** Mount as read-only */
  readonly?: boolean;
  /** Credentials for authenticated backends */
  credentials?: MountCredentials;
}

/**
 * Supported mount types
 */
export type MountType =
  | "memory"      // In-memory only
  | "local"       // Local filesystem (Node.js)
  | "git"         // Git repository (cloned on mount)
  | "r2"          // Cloudflare R2
  | "s3"          // AWS S3 / compatible
  | "gdrive";     // Google Drive

/**
 * Credentials for authenticated backends
 */
export interface MountCredentials {
  /** OAuth access token */
  accessToken?: string;
  /** OAuth refresh token */
  refreshToken?: string;
  /** API key */
  apiKey?: string;
  /** AWS-style credentials */
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Account ID (for Cloudflare R2) */
  accountId?: string;
}

/**
 * Factory function type for creating VFS backends
 */
export type VFSBackendFactory = (config?: MountConfig) => Promise<VFSBackend>;
