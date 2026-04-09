/**
 * Local Filesystem VFS Backend (Node.js)
 *
 * Wraps Node.js fs/promises for use with the VFS interface.
 * Includes security features:
 * - Path traversal protection
 * - Base directory sandboxing
 * - Optional policy enforcement
 */

import type {
  VFSBackend,
  VFSCapabilities,
  FileInfo,
  ListOptions,
  ListResult,
  WriteOptions,
} from "./interface.js";

/**
 * Options for LocalVFSBackend
 */
export interface LocalVFSOptions {
  /** Base directory (all paths are relative to this) */
  baseDir: string;
  /** Create base directory if it doesn't exist */
  createBaseDir?: boolean;
  /** Read-only mode */
  readonly?: boolean;
}

/**
 * Local Filesystem VFS Backend
 */
export class LocalVFSBackend implements VFSBackend {
  readonly name = "local";
  readonly capabilities: VFSCapabilities;

  private baseDir: string;
  private readonly: boolean;
  private fs: typeof import("node:fs/promises") | null = null;
  private path: typeof import("node:path") | null = null;

  constructor(private options: LocalVFSOptions) {
    this.baseDir = options.baseDir;
    this.readonly = options.readonly ?? false;

    this.capabilities = {
      read: true,
      write: !this.readonly,
      delete: !this.readonly,
      directories: true,
      symlinks: true,
      watch: true,
      maxFileSize: 0, // No limit
    };
  }

  async initialize(): Promise<void> {
    // Dynamic imports for Node.js modules
    this.fs = await import("node:fs/promises");
    this.path = await import("node:path");

    // Resolve base directory to absolute path
    this.baseDir = this.path.resolve(this.options.baseDir);

    // Create base directory if needed
    if (this.options.createBaseDir) {
      await this.fs.mkdir(this.baseDir, { recursive: true });
    }
  }

  private ensureInitialized(): void {
    if (!this.fs || !this.path) {
      throw new Error("LocalVFSBackend not initialized. Call initialize() first.");
    }
  }

  private resolvePath(vfsPath: string): string {
    this.ensureInitialized();
    const path = this.path!;

    // Normalize VFS path
    let normalized = vfsPath;
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }

    // Resolve to absolute path within baseDir
    const resolved = path.resolve(this.baseDir, "." + normalized);

    // Security check: ensure path is within baseDir
    const relative = path.relative(this.baseDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Path escape attempt detected: ${vfsPath}`);
    }

    return resolved;
  }

  async read(vfsPath: string): Promise<Uint8Array> {
    this.ensureInitialized();
    const realPath = this.resolvePath(vfsPath);
    const buffer = await this.fs!.readFile(realPath);
    return new Uint8Array(buffer);
  }

  async readText(vfsPath: string): Promise<string> {
    this.ensureInitialized();
    const realPath = this.resolvePath(vfsPath);
    return this.fs!.readFile(realPath, "utf-8");
  }

  async write(vfsPath: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    this.ensureInitialized();

    if (this.readonly) {
      throw new Error("Filesystem is read-only");
    }

    const realPath = this.resolvePath(vfsPath);

    // Create parent directories if needed
    if (options?.createParents) {
      const parentDir = this.path!.dirname(realPath);
      await this.fs!.mkdir(parentDir, { recursive: true });
    }

    await this.fs!.writeFile(realPath, data);
  }

  async writeText(vfsPath: string, text: string, options?: WriteOptions): Promise<void> {
    this.ensureInitialized();

    if (this.readonly) {
      throw new Error("Filesystem is read-only");
    }

    const realPath = this.resolvePath(vfsPath);

    // Create parent directories if needed
    if (options?.createParents) {
      const parentDir = this.path!.dirname(realPath);
      await this.fs!.mkdir(parentDir, { recursive: true });
    }

    await this.fs!.writeFile(realPath, text, "utf-8");
  }

  async delete(vfsPath: string): Promise<void> {
    this.ensureInitialized();

    if (this.readonly) {
      throw new Error("Filesystem is read-only");
    }

    const realPath = this.resolvePath(vfsPath);
    await this.fs!.unlink(realPath);
  }

  async stat(vfsPath: string): Promise<FileInfo> {
    this.ensureInitialized();

    const realPath = this.resolvePath(vfsPath);
    const stats = await this.fs!.stat(realPath);

    return {
      path: vfsPath,
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      createdAt: stats.birthtime.getTime(),
      modifiedAt: stats.mtime.getTime(),
    };
  }

  async exists(vfsPath: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const realPath = this.resolvePath(vfsPath);
      await this.fs!.access(realPath);
      return true;
    } catch {
      return false;
    }
  }

  async list(vfsPath: string, options?: ListOptions): Promise<string[]> {
    const result = await this.listPaginated(vfsPath, options);
    return result.entries;
  }

  async listPaginated(vfsPath: string, options?: ListOptions): Promise<ListResult> {
    this.ensureInitialized();

    const realPath = this.resolvePath(vfsPath);

    if (options?.recursive) {
      // Recursive listing using fs.readdir with recursive option (Node.js 18.17+)
      const entries = await this.fs!.readdir(realPath, {
        recursive: true,
        withFileTypes: true,
      });

      const names = entries.map((entry) => {
        // Handle different Node.js versions
        const name = typeof entry === "string" ? entry : entry.name;
        const parentPath = typeof entry === "string" ? "" : (entry as { parentPath?: string }).parentPath ?? "";
        return parentPath ? `${parentPath}/${name}` : name;
      });

      // Apply pagination
      const limit = options?.limit ?? names.length;
      const startIndex = options?.cursor ? parseInt(options.cursor) : 0;
      const sliced = names.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < names.length;

      return {
        entries: sliced,
        hasMore,
        cursor: hasMore ? String(startIndex + limit) : undefined,
      };
    } else {
      const entries = await this.fs!.readdir(realPath);

      // Apply pagination
      const limit = options?.limit ?? entries.length;
      const startIndex = options?.cursor ? parseInt(options.cursor) : 0;
      const sliced = entries.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < entries.length;

      return {
        entries: sliced,
        hasMore,
        cursor: hasMore ? String(startIndex + limit) : undefined,
      };
    }
  }

  async mkdir(vfsPath: string, options?: { recursive?: boolean }): Promise<void> {
    this.ensureInitialized();

    if (this.readonly) {
      throw new Error("Filesystem is read-only");
    }

    const realPath = this.resolvePath(vfsPath);
    await this.fs!.mkdir(realPath, { recursive: options?.recursive });
  }

  async rmdir(vfsPath: string, options?: { recursive?: boolean }): Promise<void> {
    this.ensureInitialized();

    if (this.readonly) {
      throw new Error("Filesystem is read-only");
    }

    const realPath = this.resolvePath(vfsPath);

    if (options?.recursive) {
      await this.fs!.rm(realPath, { recursive: true, force: false });
    } else {
      await this.fs!.rmdir(realPath);
    }
  }

  async copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    this.ensureInitialized();

    if (this.readonly) {
      throw new Error("Filesystem is read-only");
    }

    const srcPath = this.resolvePath(src);
    const destPath = this.resolvePath(dest);

    // Node.js 16.7+ has fs.cp
    await this.fs!.cp(srcPath, destPath, { recursive: options?.recursive });
  }

  async move(src: string, dest: string): Promise<void> {
    this.ensureInitialized();

    if (this.readonly) {
      throw new Error("Filesystem is read-only");
    }

    const srcPath = this.resolvePath(src);
    const destPath = this.resolvePath(dest);

    await this.fs!.rename(srcPath, destPath);
  }

  async close(): Promise<void> {
    // No cleanup needed for local filesystem
  }
}

/**
 * Create a local filesystem VFS backend
 */
export async function createLocalVFS(options: LocalVFSOptions): Promise<LocalVFSBackend> {
  const backend = new LocalVFSBackend(options);
  await backend.initialize();
  return backend;
}
