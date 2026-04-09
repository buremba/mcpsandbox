/**
 * In-memory VFS Backend
 *
 * Pure JavaScript implementation that works everywhere:
 * - Browser
 * - Node.js
 * - Cloudflare Workers
 * - Deno/Bun
 *
 * Data is stored in a Map and is lost when the process ends.
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
 * Internal file entry
 */
interface FileEntry {
  data: Uint8Array;
  contentType?: string;
  metadata?: Record<string, string>;
  createdAt: number;
  modifiedAt: number;
}

/**
 * Directory marker
 */
interface DirEntry {
  isDir: true;
  createdAt: number;
  modifiedAt: number;
}

type Entry = FileEntry | DirEntry;

function isFileEntry(entry: Entry): entry is FileEntry {
  return !("isDir" in entry);
}

/**
 * In-memory VFS Backend
 */
export class MemoryVFSBackend implements VFSBackend {
  readonly name = "memory";
  readonly capabilities: VFSCapabilities = {
    read: true,
    write: true,
    delete: true,
    directories: true,
    symlinks: false,
    watch: false,
    maxFileSize: 100 * 1024 * 1024, // 100MB
  };

  private entries: Map<string, Entry> = new Map();

  constructor() {
    // Create root directory
    this.entries.set("/", {
      isDir: true,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    });
  }

  private normalizePath(path: string): string {
    // Ensure path starts with /
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    // Remove trailing slash (except for root)
    if (path !== "/" && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    // Normalize .. and .
    const parts = path.split("/").filter(Boolean);
    const normalized: string[] = [];
    for (const part of parts) {
      if (part === "..") {
        normalized.pop();
      } else if (part !== ".") {
        normalized.push(part);
      }
    }
    return "/" + normalized.join("/");
  }

  private getParentPath(path: string): string {
    const normalized = this.normalizePath(path);
    if (normalized === "/") return "/";
    const lastSlash = normalized.lastIndexOf("/");
    return lastSlash === 0 ? "/" : normalized.slice(0, lastSlash);
  }


  async read(path: string): Promise<Uint8Array> {
    const normalized = this.normalizePath(path);
    const entry = this.entries.get(normalized);

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    if (!isFileEntry(entry)) {
      throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
    }

    return entry.data;
  }

  async readText(path: string): Promise<string> {
    const data = await this.read(path);
    return new TextDecoder().decode(data);
  }

  async write(path: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    const normalized = this.normalizePath(path);
    const parentPath = this.getParentPath(normalized);

    // Check parent exists
    const parentEntry = this.entries.get(parentPath);
    if (!parentEntry) {
      if (options?.createParents) {
        await this.mkdir(parentPath, { recursive: true });
      } else {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
    } else if (isFileEntry(parentEntry)) {
      throw new Error(`ENOTDIR: not a directory, open '${path}'`);
    }

    // Check size limit
    if (data.length > this.capabilities.maxFileSize) {
      throw new Error(
        `File size ${data.length} exceeds limit ${this.capabilities.maxFileSize}`
      );
    }

    const now = Date.now();
    const existing = this.entries.get(normalized);

    this.entries.set(normalized, {
      data,
      contentType: options?.contentType,
      metadata: options?.metadata,
      createdAt: existing && isFileEntry(existing) ? existing.createdAt : now,
      modifiedAt: now,
    });

    // Update parent directory mtime
    const parent = this.entries.get(parentPath);
    if (parent && !isFileEntry(parent)) {
      parent.modifiedAt = now;
    }
  }

  async writeText(path: string, text: string, options?: WriteOptions): Promise<void> {
    const data = new TextEncoder().encode(text);
    await this.write(path, data, {
      ...options,
      contentType: options?.contentType ?? "text/plain; charset=utf-8",
    });
  }

  async delete(path: string): Promise<void> {
    const normalized = this.normalizePath(path);

    if (normalized === "/") {
      throw new Error("EPERM: operation not permitted, unlink '/'");
    }

    const entry = this.entries.get(normalized);
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }
    if (!isFileEntry(entry)) {
      throw new Error(`EISDIR: illegal operation on a directory, unlink '${path}'`);
    }

    this.entries.delete(normalized);

    // Update parent directory mtime
    const parentPath = this.getParentPath(normalized);
    const parent = this.entries.get(parentPath);
    if (parent && !isFileEntry(parent)) {
      parent.modifiedAt = Date.now();
    }
  }

  async stat(path: string): Promise<FileInfo> {
    const normalized = this.normalizePath(path);
    const entry = this.entries.get(normalized);

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }

    if (isFileEntry(entry)) {
      return {
        path: normalized,
        size: entry.data.length,
        isDirectory: false,
        isFile: true,
        createdAt: entry.createdAt,
        modifiedAt: entry.modifiedAt,
        contentType: entry.contentType,
        metadata: entry.metadata,
      };
    } else {
      return {
        path: normalized,
        size: 0,
        isDirectory: true,
        isFile: false,
        createdAt: entry.createdAt,
        modifiedAt: entry.modifiedAt,
      };
    }
  }

  async exists(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path);
    return this.entries.has(normalized);
  }

  async list(path: string, options?: ListOptions): Promise<string[]> {
    const result = await this.listPaginated(path, options);
    return result.entries;
  }

  async listPaginated(path: string, options?: ListOptions): Promise<ListResult> {
    const normalized = this.normalizePath(path);
    const entry = this.entries.get(normalized);

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }
    if (isFileEntry(entry)) {
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
    }

    const prefix = normalized === "/" ? "/" : normalized + "/";
    const entries: string[] = [];

    for (const entryPath of this.entries.keys()) {
      if (entryPath === normalized) continue;

      if (entryPath.startsWith(prefix)) {
        const relativePath = entryPath.slice(prefix.length);

        if (options?.recursive) {
          entries.push(relativePath);
        } else {
          // Only include direct children
          if (!relativePath.includes("/")) {
            entries.push(relativePath);
          }
        }
      }
    }

    // Sort entries
    entries.sort();

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

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const normalized = this.normalizePath(path);

    if (normalized === "/") {
      return; // Root always exists
    }

    const existing = this.entries.get(normalized);
    if (existing) {
      if (isFileEntry(existing)) {
        throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
      }
      return; // Directory already exists
    }

    const parentPath = this.getParentPath(normalized);
    const parentEntry = this.entries.get(parentPath);

    if (!parentEntry) {
      if (options?.recursive) {
        await this.mkdir(parentPath, { recursive: true });
      } else {
        throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
      }
    } else if (isFileEntry(parentEntry)) {
      throw new Error(`ENOTDIR: not a directory, mkdir '${path}'`);
    }

    const now = Date.now();
    this.entries.set(normalized, {
      isDir: true,
      createdAt: now,
      modifiedAt: now,
    });

    // Update parent directory mtime
    const parent = this.entries.get(parentPath);
    if (parent && !isFileEntry(parent)) {
      parent.modifiedAt = now;
    }
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const normalized = this.normalizePath(path);

    if (normalized === "/") {
      throw new Error("EPERM: operation not permitted, rmdir '/'");
    }

    const entry = this.entries.get(normalized);
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
    }
    if (isFileEntry(entry)) {
      throw new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
    }

    // Check if directory is empty
    const prefix = normalized + "/";
    const children = Array.from(this.entries.keys()).filter((p) =>
      p.startsWith(prefix)
    );

    if (children.length > 0) {
      if (options?.recursive) {
        // Delete all children first
        for (const childPath of children.sort().reverse()) {
          this.entries.delete(childPath);
        }
      } else {
        throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
      }
    }

    this.entries.delete(normalized);

    // Update parent directory mtime
    const parentPath = this.getParentPath(normalized);
    const parent = this.entries.get(parentPath);
    if (parent && !isFileEntry(parent)) {
      parent.modifiedAt = Date.now();
    }
  }

  async copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    const srcNormalized = this.normalizePath(src);
    const destNormalized = this.normalizePath(dest);

    const srcEntry = this.entries.get(srcNormalized);
    if (!srcEntry) {
      throw new Error(`ENOENT: no such file or directory, copy '${src}'`);
    }

    if (isFileEntry(srcEntry)) {
      // Copy file
      await this.write(destNormalized, srcEntry.data, {
        contentType: srcEntry.contentType,
        metadata: srcEntry.metadata,
        createParents: true,
      });
    } else {
      // Copy directory
      if (!options?.recursive) {
        throw new Error(`EISDIR: illegal operation on a directory, copy '${src}'`);
      }

      await this.mkdir(destNormalized, { recursive: true });

      const prefix = srcNormalized === "/" ? "/" : srcNormalized + "/";
      for (const [entryPath, entry] of this.entries) {
        if (entryPath.startsWith(prefix)) {
          const relativePath = entryPath.slice(prefix.length);
          const destPath = destNormalized + "/" + relativePath;

          if (isFileEntry(entry)) {
            await this.write(destPath, entry.data, {
              contentType: entry.contentType,
              metadata: entry.metadata,
              createParents: true,
            });
          } else {
            await this.mkdir(destPath, { recursive: true });
          }
        }
      }
    }
  }

  async move(src: string, dest: string): Promise<void> {
    await this.copy(src, dest, { recursive: true });
    const srcEntry = this.entries.get(this.normalizePath(src));
    if (srcEntry && isFileEntry(srcEntry)) {
      await this.delete(src);
    } else {
      await this.rmdir(src, { recursive: true });
    }
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.entries.clear();
    this.entries.set("/", {
      isDir: true,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    });
  }

  /**
   * Get total size of all files
   */
  getTotalSize(): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      if (isFileEntry(entry)) {
        total += entry.data.length;
      }
    }
    return total;
  }

  /**
   * Get number of entries
   */
  getEntryCount(): number {
    return this.entries.size;
  }
}

/**
 * Create an in-memory VFS backend
 */
export function createMemoryVFS(): MemoryVFSBackend {
  return new MemoryVFSBackend();
}
