/**
 * Cloudflare R2 VFS Backend
 *
 * Uses the R2 API for object storage.
 * Works in Cloudflare Workers via R2 bindings.
 *
 * @see https://developers.cloudflare.com/r2/
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
 * R2 Bucket binding interface (from Workers)
 */
export interface R2Bucket {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: R2PutOptions
  ): Promise<R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}

interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

interface R2GetOptions {
  range?: { offset?: number; length?: number };
}

interface R2ListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
  delimiter?: string;
}

interface R2HTTPMetadata {
  contentType?: string;
}

interface R2Object {
  key: string;
  size: number;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}

interface R2Objects {
  objects: R2Object[];
  delimitedPrefixes: string[];
  truncated: boolean;
  cursor?: string;
}

/**
 * Options for R2VFSBackend
 */
export interface R2VFSOptions {
  /** R2 bucket binding */
  bucket: R2Bucket;
  /** Prefix for all keys (optional) */
  prefix?: string;
  /** Read-only mode */
  readonly?: boolean;
}

/**
 * R2 VFS Backend for Cloudflare Workers
 */
export class R2VFSBackend implements VFSBackend {
  readonly name = "r2";
  readonly capabilities: VFSCapabilities;

  private bucket: R2Bucket;
  private prefix: string;
  private readonly: boolean;

  constructor(options: R2VFSOptions) {
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? "";
    this.readonly = options.readonly ?? false;

    // Remove trailing slash from prefix
    if (this.prefix.endsWith("/")) {
      this.prefix = this.prefix.slice(0, -1);
    }

    this.capabilities = {
      read: true,
      write: !this.readonly,
      delete: !this.readonly,
      directories: true, // Simulated via prefixes
      symlinks: false,
      watch: false,
      maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB max per object
    };
  }

  private toR2Key(vfsPath: string): string {
    // Normalize VFS path
    let path = vfsPath;
    if (path.startsWith("/")) {
      path = path.slice(1);
    }

    // Apply prefix
    if (this.prefix) {
      return `${this.prefix}/${path}`;
    }
    return path;
  }


  async read(path: string): Promise<Uint8Array> {
    const key = this.toR2Key(path);
    const object = await this.bucket.get(key);

    if (!object) {
      throw new Error(`ENOENT: no such file, open '${path}'`);
    }

    const buffer = await object.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async readText(path: string): Promise<string> {
    const key = this.toR2Key(path);
    const object = await this.bucket.get(key);

    if (!object) {
      throw new Error(`ENOENT: no such file, open '${path}'`);
    }

    return object.text();
  }

  async write(path: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    if (this.readonly) {
      throw new Error("R2 bucket is read-only");
    }

    const key = this.toR2Key(path);

    await this.bucket.put(key, data, {
      httpMetadata: options?.contentType
        ? { contentType: options.contentType }
        : undefined,
      customMetadata: options?.metadata,
    });
  }

  async writeText(path: string, text: string, options?: WriteOptions): Promise<void> {
    if (this.readonly) {
      throw new Error("R2 bucket is read-only");
    }

    const key = this.toR2Key(path);

    await this.bucket.put(key, text, {
      httpMetadata: {
        contentType: options?.contentType ?? "text/plain; charset=utf-8",
      },
      customMetadata: options?.metadata,
    });
  }

  async delete(path: string): Promise<void> {
    if (this.readonly) {
      throw new Error("R2 bucket is read-only");
    }

    const key = this.toR2Key(path);

    // Check if object exists
    const object = await this.bucket.head(key);
    if (!object) {
      throw new Error(`ENOENT: no such file, unlink '${path}'`);
    }

    await this.bucket.delete(key);
  }

  async stat(path: string): Promise<FileInfo> {
    const key = this.toR2Key(path);

    // Check for exact object match
    const object = await this.bucket.head(key);

    if (object) {
      return {
        path,
        size: object.size,
        isDirectory: false,
        isFile: true,
        createdAt: object.uploaded.getTime(),
        modifiedAt: object.uploaded.getTime(),
        contentType: object.httpMetadata?.contentType,
        metadata: object.customMetadata,
      };
    }

    // Check if this is a "directory" (prefix with objects)
    const prefix = key.endsWith("/") ? key : key + "/";
    const result = await this.bucket.list({ prefix, limit: 1 });

    if (result.objects.length > 0 || result.delimitedPrefixes.length > 0) {
      return {
        path,
        size: 0,
        isDirectory: true,
        isFile: false,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      };
    }

    throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async list(path: string, options?: ListOptions): Promise<string[]> {
    const result = await this.listPaginated(path, options);
    return result.entries;
  }

  async listPaginated(path: string, options?: ListOptions): Promise<ListResult> {
    let prefix = this.toR2Key(path);
    if (prefix && !prefix.endsWith("/")) {
      prefix += "/";
    }
    if (prefix === "/") {
      prefix = "";
    }

    const r2Options: R2ListOptions = {
      prefix: prefix || undefined,
      cursor: options?.cursor,
      limit: options?.limit ?? 1000,
    };

    // Use delimiter unless recursive
    if (!options?.recursive) {
      r2Options.delimiter = "/";
    }

    const result = await this.bucket.list(r2Options);

    const entries: string[] = [];

    // Add objects
    for (const object of result.objects) {
      const relativePath = object.key.slice(prefix.length);
      if (relativePath) {
        entries.push(relativePath);
      }
    }

    // Add directories (delimited prefixes)
    for (const dirPrefix of result.delimitedPrefixes) {
      const relativePath = dirPrefix.slice(prefix.length);
      // Remove trailing slash from directory names
      const dirName = relativePath.endsWith("/")
        ? relativePath.slice(0, -1)
        : relativePath;
      if (dirName) {
        entries.push(dirName);
      }
    }

    return {
      entries: entries.sort(),
      hasMore: result.truncated,
      cursor: result.cursor,
    };
  }

  async mkdir(_path: string, _options?: { recursive?: boolean }): Promise<void> {
    // R2 doesn't have real directories - they're just key prefixes
    // We can optionally create a placeholder file
    // For now, this is a no-op since directories are implicit
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.readonly) {
      throw new Error("R2 bucket is read-only");
    }

    // List all objects under this prefix
    const entries = await this.list(path, { recursive: true });

    if (entries.length > 0) {
      if (!options?.recursive) {
        throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
      }

      // Delete all objects
      const prefix = this.toR2Key(path);
      const keys = entries.map((entry) => `${prefix}/${entry}`);
      await this.bucket.delete(keys);
    }
  }

  async copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.readonly) {
      throw new Error("R2 bucket is read-only");
    }

    const srcInfo = await this.stat(src);

    if (srcInfo.isFile) {
      const data = await this.read(src);
      await this.write(dest, data);
    } else {
      if (!options?.recursive) {
        throw new Error("Cannot copy directory without recursive option");
      }

      const entries = await this.list(src, { recursive: true });
      for (const entry of entries) {
        const srcPath = `${src}/${entry}`;
        const destPath = `${dest}/${entry}`;
        const data = await this.read(srcPath);
        await this.write(destPath, data);
      }
    }
  }

  async move(src: string, dest: string): Promise<void> {
    if (this.readonly) {
      throw new Error("R2 bucket is read-only");
    }

    // R2 doesn't have native move - copy then delete
    await this.copy(src, dest, { recursive: true });

    const srcInfo = await this.stat(src);
    if (srcInfo.isFile) {
      await this.delete(src);
    } else {
      await this.rmdir(src, { recursive: true });
    }
  }
}

/**
 * Create an R2 VFS backend
 */
export function createR2VFS(options: R2VFSOptions): R2VFSBackend {
  return new R2VFSBackend(options);
}
