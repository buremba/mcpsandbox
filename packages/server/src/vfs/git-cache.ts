/**
 * Git repository cache for efficient re-cloning
 *
 * Implements LRU caching with configurable TTL and size limits.
 * Caches cloned repository content in memory for fast re-access.
 */

import type { MemoryVFSBackend } from "./memory.js";

/**
 * Cache entry for a cloned repository
 */
export interface GitCacheEntry {
  /** Memory VFS containing repository files */
  vfs: MemoryVFSBackend;
  /** Commit SHA that was cloned */
  commit: string;
  /** When the cache entry was created */
  createdAt: number;
  /** When the cache entry was last accessed */
  accessedAt: number;
  /** Total size of cached files in bytes */
  size: number;
}

/**
 * Cache statistics
 */
export interface GitCacheStats {
  /** Number of entries in cache */
  entries: number;
  /** Total size in bytes */
  totalSizeBytes: number;
  /** Cache hit count since last clear */
  hits: number;
  /** Cache miss count since last clear */
  misses: number;
}

/**
 * Options for GitCache
 */
export interface GitCacheOptions {
  /** Maximum total size in bytes (default: 500MB) */
  maxSizeBytes?: number;
  /** Maximum number of entries (default: 50) */
  maxEntries?: number;
  /** Default TTL in milliseconds (default: 5 minutes) */
  defaultTtlMs?: number;
}

/**
 * LRU cache for cloned git repositories
 *
 * Stores cloned repository content in MemoryVFSBackend instances.
 * Automatically evicts least-recently-used entries when limits are exceeded.
 */
export class GitCache {
  private cache = new Map<string, GitCacheEntry>();
  private maxSizeBytes: number;
  private maxEntries: number;
  private defaultTtlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(options?: GitCacheOptions) {
    this.maxSizeBytes = options?.maxSizeBytes ?? 500 * 1024 * 1024; // 500MB
    this.maxEntries = options?.maxEntries ?? 50;
    this.defaultTtlMs = options?.defaultTtlMs ?? 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Generate cache key from URL and ref
   *
   * Normalizes URL to ensure consistent caching:
   * - Removes .git suffix
   * - Converts to lowercase
   * - Includes ref (branch/tag/commit)
   */
  static getCacheKey(url: string, ref?: string): string {
    // Normalize URL
    let normalizedUrl = url
      .replace(/\.git$/, "")
      .toLowerCase();

    // Remove credentials from URL for key
    try {
      const parsed = new URL(normalizedUrl);
      parsed.username = "";
      parsed.password = "";
      normalizedUrl = parsed.toString();
    } catch {
      // Not a valid URL, use as-is
    }

    const normalizedRef = ref || "HEAD";
    return `${normalizedUrl}@${normalizedRef}`;
  }

  /**
   * Get cached repository if available and valid
   *
   * @param url Repository URL
   * @param ref Branch/tag/commit
   * @param ttlMs Optional TTL override
   * @returns Cache entry or null if not found/expired
   */
  get(url: string, ref?: string, ttlMs?: number): GitCacheEntry | null {
    const key = GitCache.getCacheKey(url, ref);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    const ttl = ttlMs ?? this.defaultTtlMs;
    if (Date.now() - entry.createdAt > ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update access time
    entry.accessedAt = Date.now();
    this.hits++;

    return entry;
  }

  /**
   * Store repository in cache
   *
   * @param url Repository URL
   * @param ref Branch/tag/commit
   * @param vfs Memory VFS containing repository files
   * @param commit Commit SHA
   */
  set(
    url: string,
    ref: string | undefined,
    vfs: MemoryVFSBackend,
    commit: string
  ): void {
    const key = GitCache.getCacheKey(url, ref);
    const size = vfs.getTotalSize?.() ?? 0;

    // Check if entry would exceed max size
    if (size > this.maxSizeBytes) {
      console.warn(
        `Git cache: entry size (${size} bytes) exceeds max size (${this.maxSizeBytes} bytes), not caching`
      );
      return;
    }

    // Evict entries if necessary
    this.evictIfNeeded(size);

    const entry: GitCacheEntry = {
      vfs,
      commit,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      size,
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if repository is cached
   */
  has(url: string, ref?: string): boolean {
    const key = GitCache.getCacheKey(url, ref);
    const entry = this.cache.get(key);

    if (!entry) return false;

    // Check TTL
    if (Date.now() - entry.createdAt > this.defaultTtlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Remove repository from cache
   */
  delete(url: string, ref?: string): boolean {
    const key = GitCache.getCacheKey(url, ref);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Prune expired entries
   *
   * @returns Number of entries pruned
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.defaultTtlMs) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get cache statistics
   */
  getStats(): GitCacheStats {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }

    return {
      entries: this.cache.size,
      totalSizeBytes: totalSize,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /**
   * Get total size of all cached entries
   */
  getTotalSize(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Evict entries to make room for new entry
   */
  private evictIfNeeded(newEntrySize: number): void {
    // Evict by count
    while (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    // Evict by size
    let totalSize = this.getTotalSize();
    while (totalSize + newEntrySize > this.maxSizeBytes && this.cache.size > 0) {
      this.evictLRU();
      totalSize = this.getTotalSize();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldest: { key: string; accessedAt: number } | null = null;

    for (const [key, entry] of this.cache) {
      if (!oldest || entry.accessedAt < oldest.accessedAt) {
        oldest = { key, accessedAt: entry.accessedAt };
      }
    }

    if (oldest) {
      this.cache.delete(oldest.key);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalCache: GitCache | null = null;

/**
 * Get the global git cache instance
 */
export function getGitCache(): GitCache {
  if (!globalCache) {
    globalCache = new GitCache();
  }
  return globalCache;
}

/**
 * Set custom global cache (for testing or custom configuration)
 */
export function setGitCache(cache: GitCache): void {
  globalCache = cache;
}
