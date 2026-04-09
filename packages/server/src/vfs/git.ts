/**
 * Git VFS Backend
 *
 * Mounts git repositories as virtual filesystems.
 * Supports multiple clone strategies:
 * - Native git (Node.js with git CLI)
 * - isomorphic-git (pure JS, works everywhere)
 * - Container (for heavy operations)
 *
 * Features:
 * - Lazy cloning (clone on first access)
 * - LRU caching
 * - Branch/tag/commit support
 * - Authentication (tokens, basic auth)
 */

import type {
  VFSBackend,
  VFSCapabilities,
  FileInfo,
  ListOptions,
  ListResult,
  WriteOptions,
} from "./interface.js";
import { MemoryVFSBackend, createMemoryVFS } from "./memory.js";
import { GitCache, getGitCache } from "./git-cache.js";
import {
  cloneWithIsomorphicGit,
  type GitCredentials,
} from "./git-cloner-isomorphic.js";

/**
 * Clone strategy for git repositories
 */
export type GitCloneStrategy = "auto" | "native" | "isomorphic" | "container";

/**
 * Cache options for GitVFS
 */
export interface GitCacheOptions {
  /** Enable caching (default: true) */
  enabled?: boolean;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  ttlMs?: number;
  /** Use global cache (default: true) */
  useGlobalCache?: boolean;
}

/**
 * Options for GitVFSBackend
 */
export interface GitVFSOptions {
  /** Git repository URL (HTTPS or SSH) */
  url: string;
  /** Branch, tag, or commit SHA to checkout */
  ref?: string;
  /** Shallow clone depth (default: 1) */
  depth?: number;
  /** Mount as read-only (default: true for git repos) */
  readonly?: boolean;
  /** Authentication credentials */
  credentials?: GitCredentials;
  /** Cache configuration */
  cache?: GitCacheOptions;
  /** Clone strategy override */
  strategy?: GitCloneStrategy;
  /** CORS proxy URL (for browser environments) */
  corsProxy?: string;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Git VFS Backend
 *
 * Exposes a git repository as a virtual filesystem.
 * Clone happens lazily on first file access.
 */
export class GitVFSBackend implements VFSBackend {
  readonly name = "git";
  readonly capabilities: VFSCapabilities;

  private options: GitVFSOptions;
  private storage: VFSBackend | null = null;
  private clonePromise: Promise<void> | null = null;
  private clonedCommit: string | null = null;
  private lastCloneTime = 0;
  private cache: GitCache | null = null;

  constructor(options: GitVFSOptions) {
    this.options = {
      ref: "HEAD",
      depth: 1,
      readonly: true,
      cache: { enabled: true, useGlobalCache: true },
      strategy: "auto",
      ...options,
    };

    // Set capabilities based on readonly flag
    this.capabilities = {
      read: true,
      write: !this.options.readonly,
      delete: !this.options.readonly,
      directories: true,
      symlinks: false,
      watch: false,
      maxFileSize: 100 * 1024 * 1024, // 100MB
    };

    // Set up cache
    if (this.options.cache?.enabled !== false) {
      this.cache = this.options.cache?.useGlobalCache !== false
        ? getGitCache()
        : new GitCache();
    }
  }

  /**
   * Initialize the backend (optional, clone happens lazily)
   */
  async initialize(): Promise<void> {
    // Pre-clone if cache miss and caller wants immediate initialization
    await this.ensureCloned();
  }

  /**
   * Close the backend and release resources
   */
  async close(): Promise<void> {
    // If we have a native git clone, clean it up
    if (this.storage && (this.storage as any)._gitCleanup) {
      await (this.storage as any)._gitCleanup();
    }
    this.storage = null;
    this.clonePromise = null;
  }

  // ============================================================================
  // VFSBackend Implementation
  // ============================================================================

  async read(path: string): Promise<Uint8Array> {
    const storage = await this.ensureCloned();
    return storage.read(path);
  }

  async readText(path: string): Promise<string> {
    const storage = await this.ensureCloned();
    return storage.readText(path);
  }

  async write(path: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    if (this.options.readonly) {
      throw new Error("Git VFS is read-only");
    }
    const storage = await this.ensureCloned();
    return storage.write(path, data, options);
  }

  async writeText(path: string, text: string, options?: WriteOptions): Promise<void> {
    if (this.options.readonly) {
      throw new Error("Git VFS is read-only");
    }
    const storage = await this.ensureCloned();
    return storage.writeText(path, text, options);
  }

  async delete(path: string): Promise<void> {
    if (this.options.readonly) {
      throw new Error("Git VFS is read-only");
    }
    const storage = await this.ensureCloned();
    return storage.delete(path);
  }

  async stat(path: string): Promise<FileInfo> {
    const storage = await this.ensureCloned();
    return storage.stat(path);
  }

  async exists(path: string): Promise<boolean> {
    const storage = await this.ensureCloned();
    return storage.exists(path);
  }

  async list(path: string, options?: ListOptions): Promise<string[]> {
    const storage = await this.ensureCloned();
    return storage.list(path, options);
  }

  async listPaginated(path: string, options?: ListOptions): Promise<ListResult> {
    const storage = await this.ensureCloned();
    return storage.listPaginated(path, options);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.options.readonly) {
      throw new Error("Git VFS is read-only");
    }
    const storage = await this.ensureCloned();
    return storage.mkdir(path, options);
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.options.readonly) {
      throw new Error("Git VFS is read-only");
    }
    const storage = await this.ensureCloned();
    return storage.rmdir(path, options);
  }

  async copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.options.readonly) {
      throw new Error("Git VFS is read-only");
    }
    const storage = await this.ensureCloned();
    return storage.copy(src, dest, options);
  }

  async move(src: string, dest: string): Promise<void> {
    if (this.options.readonly) {
      throw new Error("Git VFS is read-only");
    }
    const storage = await this.ensureCloned();
    return storage.move(src, dest);
  }

  // ============================================================================
  // Git-Specific Methods
  // ============================================================================

  /**
   * Get the commit SHA that was cloned
   */
  getClonedCommit(): string | null {
    return this.clonedCommit;
  }

  /**
   * Get repository URL
   */
  getUrl(): string {
    return this.options.url;
  }

  /**
   * Get ref (branch/tag/commit) being used
   */
  getRef(): string | undefined {
    return this.options.ref;
  }

  /**
   * Force refresh (re-clone)
   */
  async refresh(): Promise<void> {
    // Invalidate cache
    if (this.cache) {
      this.cache.delete(this.options.url, this.options.ref);
    }
    this.lastCloneTime = 0;
    this.storage = null;
    await this.ensureCloned();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Ensure repository is cloned
   */
  private async ensureCloned(): Promise<VFSBackend> {
    // Check if we have valid storage
    if (this.storage && this.isCacheValid()) {
      return this.storage;
    }

    // Check cache
    if (this.cache) {
      const cached = this.cache.get(
        this.options.url,
        this.options.ref,
        this.options.cache?.ttlMs
      );
      if (cached) {
        this.log("Using cached repository");
        this.storage = cached.vfs;
        this.clonedCommit = cached.commit;
        this.lastCloneTime = cached.createdAt;
        return this.storage;
      }
    }

    // Prevent concurrent clones
    if (this.clonePromise) {
      await this.clonePromise;
      return this.storage!;
    }

    this.clonePromise = this.performClone();
    await this.clonePromise;
    this.clonePromise = null;

    return this.storage!;
  }

  /**
   * Check if current clone is still valid
   */
  private isCacheValid(): boolean {
    if (!this.options.cache?.enabled) return false;
    if (!this.lastCloneTime) return false;

    const ttl = this.options.cache?.ttlMs ?? 5 * 60 * 1000;
    return Date.now() - this.lastCloneTime < ttl;
  }

  /**
   * Perform the clone operation
   */
  private async performClone(): Promise<void> {
    const strategy = await this.detectStrategy();
    this.log(`Cloning with strategy: ${strategy}`);

    switch (strategy) {
      case "native":
        await this.cloneWithNativeGit();
        break;
      case "isomorphic":
        await this.cloneWithIsomorphicGit();
        break;
      case "container":
        await this.cloneWithContainer();
        break;
    }

    this.lastCloneTime = Date.now();

    // Store in cache
    if (this.cache && this.storage instanceof MemoryVFSBackend) {
      this.cache.set(
        this.options.url,
        this.options.ref,
        this.storage as MemoryVFSBackend,
        this.clonedCommit!
      );
    }
  }

  /**
   * Detect which clone strategy to use
   */
  private async detectStrategy(): Promise<"native" | "isomorphic" | "container"> {
    if (this.options.strategy && this.options.strategy !== "auto") {
      return this.options.strategy as "native" | "isomorphic" | "container";
    }

    // Check for Node.js with git available
    if (typeof process !== "undefined" && process.versions?.node) {
      try {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        await promisify(exec)("git --version");
        return "native";
      } catch {
        // Git not available, fall through
      }
    }

    // Default to isomorphic-git (works everywhere)
    return "isomorphic";
  }

  /**
   * Clone using native git CLI
   */
  private async cloneWithNativeGit(): Promise<void> {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const execAsync = promisify(exec);

    // Create temp directory
    const tempDir = await mkdtemp(join(tmpdir(), "git-clone-"));

    try {
      // Build authenticated URL
      const url = this.buildAuthenticatedUrl();

      // Build clone command
      const cloneCmd = [
        "git clone",
        `--depth ${this.options.depth ?? 1}`,
        "--single-branch",
      ];

      if (this.options.ref && this.options.ref !== "HEAD") {
        cloneCmd.push(`--branch ${this.options.ref}`);
      }

      cloneCmd.push(`"${url}"`, `"${tempDir}"`);

      this.log(`Running: ${cloneCmd.join(" ").replace(url, "[REDACTED]")}`);
      await execAsync(cloneCmd.join(" "));

      // Get commit SHA
      const { stdout: commitSha } = await execAsync("git rev-parse HEAD", {
        cwd: tempDir,
      });
      this.clonedCommit = commitSha.trim();

      // Load files into memory VFS
      const { createLocalVFS } = await import("./local.js");
      const localVFS = await createLocalVFS({
        baseDir: tempDir,
        readonly: true,
      });

      // Copy to memory VFS
      const memoryVFS = createMemoryVFS();
      await this.copyVFS(localVFS, memoryVFS, "/");
      await localVFS.close?.();

      this.storage = memoryVFS;
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Clone using isomorphic-git
   */
  private async cloneWithIsomorphicGit(): Promise<void> {
    const memoryVFS = createMemoryVFS();

    const result = await cloneWithIsomorphicGit({
      url: this.options.url,
      ref: this.options.ref,
      depth: this.options.depth,
      credentials: this.options.credentials,
      vfs: memoryVFS,
      corsProxy: this.options.corsProxy,
    });

    this.storage = memoryVFS;
    this.clonedCommit = result.commit;
  }

  /**
   * Clone using container backend
   */
  private async cloneWithContainer(): Promise<void> {
    const { createContainerBackend } = await import("../execution/container.js");

    const container = await createContainerBackend({
      runtime: "docker",
      image: "alpine/git:latest",
      networkEnabled: true, // Need network for git clone
    });

    try {
      const result = await container.gitClone(
        this.buildAuthenticatedUrl(),
        "/repo",
        {
          branch: this.options.ref,
          depth: this.options.depth,
        }
      );

      if (result.exitCode !== 0) {
        throw new Error(`Git clone failed: ${result.stderr}`);
      }

      // Copy files from container result to memory VFS
      const memoryVFS = createMemoryVFS();

      if (result.files) {
        for (const [path, content] of Object.entries(result.files)) {
          // Remove /repo prefix
          const vfsPath = path.replace(/^\/repo/, "") || "/";
          if (vfsPath === "/") continue;

          // Ensure parent directories exist
          const parentPath = vfsPath.slice(0, vfsPath.lastIndexOf("/")) || "/";
          if (parentPath !== "/") {
            try {
              await memoryVFS.mkdir(parentPath, { recursive: true });
            } catch {
              // May already exist
            }
          }

          await memoryVFS.write(vfsPath, content);
        }
      }

      // Get commit from stdout or generate placeholder
      const commitMatch = result.stdout.match(/HEAD is now at ([a-f0-9]+)/);
      this.clonedCommit = commitMatch?.[1] ?? "unknown";

      this.storage = memoryVFS;
    } finally {
      await container.dispose();
    }
  }

  /**
   * Build authenticated URL with credentials
   */
  private buildAuthenticatedUrl(): string {
    const creds = this.options.credentials;
    if (!creds) return this.options.url;

    try {
      const url = new URL(this.options.url);

      if (creds.accessToken) {
        url.username = creds.username || "oauth2";
        url.password = creds.accessToken;
      } else if (creds.username && creds.password) {
        url.username = creds.username;
        url.password = creds.password;
      }

      return url.toString();
    } catch {
      // Not a valid URL, return as-is
      return this.options.url;
    }
  }

  /**
   * Copy all files from one VFS to another
   */
  private async copyVFS(
    src: VFSBackend,
    dest: VFSBackend,
    path: string
  ): Promise<void> {
    const entries = await src.list(path);

    for (const entry of entries) {
      // Skip .git directory
      if (entry === ".git") continue;

      const fullPath = path === "/" ? `/${entry}` : `${path}/${entry}`;

      try {
        const info = await src.stat(fullPath);

        if (info.isDirectory) {
          await dest.mkdir(fullPath, { recursive: true });
          await this.copyVFS(src, dest, fullPath);
        } else {
          const content = await src.read(fullPath);
          await dest.write(fullPath, content);
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  /**
   * Log message if verbose
   */
  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[GitVFS] ${message}`);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Git VFS backend
 */
export async function createGitVFS(options: GitVFSOptions): Promise<GitVFSBackend> {
  const backend = new GitVFSBackend(options);
  return backend;
}

/**
 * Create a Git VFS backend with caching enabled
 */
export async function createCachedGitVFS(
  options: GitVFSOptions
): Promise<GitVFSBackend> {
  return createGitVFS({
    ...options,
    cache: {
      enabled: true,
      ttlMs: options.cache?.ttlMs ?? 5 * 60 * 1000,
      ...options.cache,
    },
  });
}
