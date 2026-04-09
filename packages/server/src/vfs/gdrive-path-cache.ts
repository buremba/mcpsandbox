/**
 * Google Drive Path-to-FileId Cache
 *
 * Google Drive uses file IDs (e.g., "1abc2def3ghi") instead of paths.
 * This cache maintains a bidirectional mapping between VFS paths and Drive file IDs.
 */

/**
 * Cache entry for a file/folder
 */
export interface PathCacheEntry {
  /** Google Drive file ID */
  fileId: string;
  /** File/folder name */
  name: string;
  /** MIME type */
  mimeType: string;
  /** Whether this is a folder */
  isFolder: boolean;
  /** Parent folder ID */
  parentId: string;
  /** File size in bytes */
  size: number;
  /** Creation time (ms) */
  createdTime: number;
  /** Last modified time (ms) */
  modifiedTime: number;
  /** When this entry was cached */
  cachedAt: number;
}

/**
 * Cache options
 */
export interface PathCacheOptions {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  ttlMs?: number;
  /** Maximum entries (default: 10000) */
  maxEntries?: number;
}

/**
 * Bidirectional path-to-fileId cache for Google Drive
 *
 * Maintains mappings:
 * - path -> entry (for VFS operations)
 * - fileId -> path (for reverse lookups)
 */
export class GoogleDrivePathCache {
  private pathToEntry = new Map<string, PathCacheEntry>();
  private idToPath = new Map<string, string>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(options?: PathCacheOptions) {
    this.ttlMs = options?.ttlMs ?? 5 * 60 * 1000; // 5 minutes
    this.maxEntries = options?.maxEntries ?? 10000;
  }

  /**
   * Get file ID for a path
   *
   * @param path VFS path (e.g., "/documents/notes.txt")
   * @returns File ID or null if not cached/expired
   */
  getFileId(path: string): string | null {
    const entry = this.getEntry(path);
    return entry?.fileId ?? null;
  }

  /**
   * Get path for a file ID
   *
   * @param fileId Google Drive file ID
   * @returns VFS path or null if not cached
   */
  getPath(fileId: string): string | null {
    return this.idToPath.get(fileId) ?? null;
  }

  /**
   * Get cached entry for a path
   *
   * @param path VFS path
   * @returns Cache entry or null if not cached/expired
   */
  getEntry(path: string): PathCacheEntry | null {
    const normalized = this.normalizePath(path);
    const entry = this.pathToEntry.get(normalized);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.invalidate(normalized);
      return null;
    }

    return entry;
  }

  /**
   * Get entry by file ID
   *
   * @param fileId Google Drive file ID
   * @returns Cache entry or null
   */
  getEntryById(fileId: string): PathCacheEntry | null {
    const path = this.idToPath.get(fileId);
    if (!path) return null;
    return this.getEntry(path);
  }

  /**
   * Cache a path-to-fileId mapping
   *
   * @param path VFS path
   * @param entry Cache entry
   */
  set(path: string, entry: PathCacheEntry): void {
    const normalized = this.normalizePath(path);

    // Evict if at capacity
    if (this.pathToEntry.size >= this.maxEntries) {
      this.evictOldest();
    }

    // Remove old mapping if fileId changed
    const oldEntry = this.pathToEntry.get(normalized);
    if (oldEntry && oldEntry.fileId !== entry.fileId) {
      this.idToPath.delete(oldEntry.fileId);
    }

    // Set new mappings
    this.pathToEntry.set(normalized, entry);
    this.idToPath.set(entry.fileId, normalized);
  }

  /**
   * Invalidate a path and optionally its children
   *
   * @param path VFS path to invalidate
   * @param includeChildren Whether to invalidate child paths
   */
  invalidate(path: string, includeChildren = true): void {
    const normalized = this.normalizePath(path);

    // Remove direct entry
    const entry = this.pathToEntry.get(normalized);
    if (entry) {
      this.idToPath.delete(entry.fileId);
      this.pathToEntry.delete(normalized);
    }

    // Remove children if requested
    if (includeChildren) {
      const prefix = normalized === "/" ? "/" : `${normalized}/`;
      for (const [cachedPath, cachedEntry] of this.pathToEntry) {
        if (cachedPath.startsWith(prefix)) {
          this.idToPath.delete(cachedEntry.fileId);
          this.pathToEntry.delete(cachedPath);
        }
      }
    }
  }

  /**
   * Invalidate by file ID
   *
   * @param fileId Google Drive file ID
   */
  invalidateById(fileId: string): void {
    const path = this.idToPath.get(fileId);
    if (path) {
      this.invalidate(path, false);
    }
  }

  /**
   * Check if a path is cached (and not expired)
   */
  has(path: string): boolean {
    return this.getEntry(path) !== null;
  }

  /**
   * Get number of cached entries
   */
  get size(): number {
    return this.pathToEntry.size;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.pathToEntry.clear();
    this.idToPath.clear();
  }

  /**
   * Prune expired entries
   *
   * @returns Number of entries pruned
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [path, entry] of this.pathToEntry) {
      if (now - entry.cachedAt > this.ttlMs) {
        this.idToPath.delete(entry.fileId);
        this.pathToEntry.delete(path);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get all cached paths under a directory
   *
   * @param parentPath Parent directory path
   * @returns Array of child paths
   */
  getChildren(parentPath: string): string[] {
    const normalized = this.normalizePath(parentPath);
    const prefix = normalized === "/" ? "/" : `${normalized}/`;
    const children: string[] = [];

    for (const path of this.pathToEntry.keys()) {
      if (path.startsWith(prefix)) {
        // Check if it's a direct child (no additional slashes)
        const relativePath = path.slice(prefix.length);
        if (!relativePath.includes("/")) {
          children.push(relativePath);
        }
      }
    }

    return children;
  }

  /**
   * Update access time for an entry (to prevent eviction)
   */
  touch(path: string): void {
    const normalized = this.normalizePath(path);
    const entry = this.pathToEntry.get(normalized);
    if (entry) {
      entry.cachedAt = Date.now();
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Normalize path to consistent format
   */
  private normalizePath(path: string): string {
    // Ensure starts with /
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    // Remove trailing slash (except for root)
    if (path !== "/" && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    // Normalize multiple slashes
    return path.replace(/\/+/g, "/");
  }

  /**
   * Evict oldest entries to make room
   */
  private evictOldest(): void {
    // Find oldest entry
    let oldest: { path: string; cachedAt: number } | null = null;

    for (const [path, entry] of this.pathToEntry) {
      if (!oldest || entry.cachedAt < oldest.cachedAt) {
        oldest = { path, cachedAt: entry.cachedAt };
      }
    }

    if (oldest) {
      this.invalidate(oldest.path, false);
    }
  }
}
