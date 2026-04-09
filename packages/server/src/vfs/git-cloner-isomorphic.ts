/**
 * Isomorphic-git based repository cloner
 *
 * Uses isomorphic-git for pure JavaScript git operations.
 * Works in both Node.js and Cloudflare Workers environments.
 *
 * Adapts the VFS interface to isomorphic-git's filesystem interface.
 */

import type { VFSBackend } from "./interface.js";

/**
 * Git credentials for authentication
 */
export interface GitCredentials {
  /** Personal access token (GitHub, GitLab, etc.) */
  accessToken?: string;
  /** Username for basic auth */
  username?: string;
  /** Password for basic auth */
  password?: string;
}

/**
 * Options for cloning with isomorphic-git
 */
export interface IsomorphicGitCloneOptions {
  /** Repository URL (HTTPS) */
  url: string;
  /** Branch, tag, or commit to checkout */
  ref?: string;
  /** Shallow clone depth */
  depth?: number;
  /** Authentication credentials */
  credentials?: GitCredentials;
  /** VFS backend to clone into */
  vfs: VFSBackend;
  /** CORS proxy URL (for browser environments) */
  corsProxy?: string;
  /** Callback for progress updates */
  onProgress?: (progress: { phase: string; loaded: number; total: number }) => void;
}

/**
 * Result of cloning operation
 */
export interface IsomorphicGitCloneResult {
  /** Commit SHA that was checked out */
  commit: string;
}

/**
 * Filesystem adapter for isomorphic-git
 *
 * Bridges VFSBackend interface to isomorphic-git's fs interface.
 * isomorphic-git expects a Node.js fs-like interface.
 */
export class VFSAdapter {
  constructor(private vfs: VFSBackend) {}

  /**
   * Read file contents
   */
  async readFile(
    path: string,
    options?: { encoding?: string }
  ): Promise<Uint8Array | string> {
    const normalizedPath = this.normalizePath(path);

    if (options?.encoding === "utf8") {
      return this.vfs.readText(normalizedPath);
    }

    return this.vfs.read(normalizedPath);
  }

  /**
   * Write file contents
   */
  async writeFile(
    path: string,
    data: Uint8Array | string,
    _options?: { mode?: number }
  ): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const content =
      typeof data === "string" ? new TextEncoder().encode(data) : data;

    // Ensure parent directory exists
    const parentPath = this.getParentPath(normalizedPath);
    if (parentPath && parentPath !== "/") {
      try {
        await this.vfs.mkdir(parentPath, { recursive: true });
      } catch {
        // Directory may already exist
      }
    }

    await this.vfs.write(normalizedPath, content);
  }

  /**
   * Create directory
   */
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    await this.vfs.mkdir(normalizedPath, { recursive: options?.recursive });
  }

  /**
   * Remove directory
   */
  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    await this.vfs.rmdir(normalizedPath, { recursive: options?.recursive });
  }

  /**
   * Delete file
   */
  async unlink(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    await this.vfs.delete(normalizedPath);
  }

  /**
   * Get file/directory stats
   */
  async stat(
    path: string
  ): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    mode: number;
    size: number;
    mtimeMs: number;
  }> {
    const normalizedPath = this.normalizePath(path);
    const info = await this.vfs.stat(normalizedPath);

    return {
      isFile: () => info.isFile,
      isDirectory: () => info.isDirectory,
      isSymbolicLink: () => false, // VFS doesn't support symlinks
      mode: 0o644,
      size: info.size,
      mtimeMs: info.modifiedAt,
    };
  }

  /**
   * Same as stat (we don't support symlinks)
   */
  async lstat(
    path: string
  ): Promise<ReturnType<typeof this.stat>> {
    return this.stat(path);
  }

  /**
   * Read directory contents
   */
  async readdir(path: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(path);
    return this.vfs.list(normalizedPath);
  }

  /**
   * Read symbolic link (not supported)
   */
  async readlink(_path: string): Promise<string> {
    throw new Error("Symbolic links not supported by VFS");
  }

  /**
   * Create symbolic link (not supported)
   */
  async symlink(_target: string, _path: string): Promise<void> {
    throw new Error("Symbolic links not supported by VFS");
  }

  /**
   * Change file mode (no-op for VFS)
   */
  async chmod(_path: string, _mode: number): Promise<void> {
    // No-op - VFS doesn't support permissions
  }

  /**
   * Normalize path to POSIX format starting with /
   */
  private normalizePath(path: string): string {
    // Remove leading ./ if present
    if (path.startsWith("./")) {
      path = path.slice(2);
    }
    // Ensure path starts with /
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    // Normalize multiple slashes and remove trailing slash
    return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  }

  /**
   * Get parent path
   */
  private getParentPath(path: string): string {
    const normalized = this.normalizePath(path);
    const lastSlash = normalized.lastIndexOf("/");
    return lastSlash <= 0 ? "/" : normalized.slice(0, lastSlash);
  }
}

/**
 * Clone a git repository using isomorphic-git
 *
 * @param options Clone options
 * @returns Clone result with commit SHA
 */
export async function cloneWithIsomorphicGit(
  options: IsomorphicGitCloneOptions
): Promise<IsomorphicGitCloneResult> {
  // Dynamic import of isomorphic-git
  // These modules must be installed: npm install isomorphic-git
  const git = await import(/* webpackIgnore: true */ "isomorphic-git") as any;
  const http = await import(/* webpackIgnore: true */ "isomorphic-git/http/web/index.js") as any;

  const fsAdapter = new VFSAdapter(options.vfs);

  // Build authentication callback
  const onAuth = options.credentials
    ? () => ({
        username: options.credentials!.username || "oauth2",
        password:
          options.credentials!.accessToken || options.credentials!.password || "",
      })
    : undefined;

  const onAuthFailure = () => {
    throw new Error("Authentication failed for repository");
  };

  // Perform clone
  await git.clone({
    fs: fsAdapter,
    http,
    dir: "/",
    url: options.url,
    ref: options.ref || "HEAD",
    singleBranch: true,
    depth: options.depth || 1,
    corsProxy: options.corsProxy,
    onAuth,
    onAuthFailure,
    onProgress: options.onProgress,
  });

  // Get the commit SHA
  const commit = await git.resolveRef({
    fs: fsAdapter,
    dir: "/",
    ref: "HEAD",
  });

  return { commit };
}

/**
 * Fetch updates from a git repository
 *
 * @param options Fetch options (similar to clone)
 * @returns Updated commit SHA
 */
export async function fetchWithIsomorphicGit(
  options: IsomorphicGitCloneOptions
): Promise<IsomorphicGitCloneResult> {
  const git = await import(/* webpackIgnore: true */ "isomorphic-git") as any;
  const http = await import(/* webpackIgnore: true */ "isomorphic-git/http/web/index.js") as any;

  const fsAdapter = new VFSAdapter(options.vfs);

  const onAuth = options.credentials
    ? () => ({
        username: options.credentials!.username || "oauth2",
        password:
          options.credentials!.accessToken || options.credentials!.password || "",
      })
    : undefined;

  await git.fetch({
    fs: fsAdapter,
    http,
    dir: "/",
    url: options.url,
    ref: options.ref || "HEAD",
    singleBranch: true,
    depth: options.depth || 1,
    corsProxy: options.corsProxy,
    onAuth,
  });

  // Checkout the fetched ref
  await git.checkout({
    fs: fsAdapter,
    dir: "/",
    ref: options.ref || "HEAD",
    force: true,
  });

  const commit = await git.resolveRef({
    fs: fsAdapter,
    dir: "/",
    ref: "HEAD",
  });

  return { commit };
}

/**
 * Check if a repository has been cloned
 */
export async function isRepositoryCloned(vfs: VFSBackend): Promise<boolean> {
  try {
    await vfs.stat("/.git");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current commit SHA of a cloned repository
 */
export async function getCurrentCommit(vfs: VFSBackend): Promise<string | null> {
  const git = await import(/* webpackIgnore: true */ "isomorphic-git") as any;
  const fsAdapter = new VFSAdapter(vfs);

  try {
    return await git.resolveRef({
      fs: fsAdapter,
      dir: "/",
      ref: "HEAD",
    });
  } catch {
    return null;
  }
}
