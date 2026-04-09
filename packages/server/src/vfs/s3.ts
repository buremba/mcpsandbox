/**
 * AWS S3 VFS Backend
 *
 * Uses the S3 API for object storage.
 * Compatible with AWS S3 and S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
 *
 * Uses fetch-based API calls (no AWS SDK dependency) for universal compatibility.
 */

/// <reference lib="dom" />

import type {
  VFSBackend,
  VFSCapabilities,
  FileInfo,
  ListOptions,
  ListResult,
  WriteOptions,
} from "./interface.js";

/**
 * Options for S3VFSBackend
 */
export interface S3VFSOptions {
  /** S3 bucket name */
  bucket: string;
  /** S3 region */
  region: string;
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Custom endpoint for S3-compatible services (optional) */
  endpoint?: string;
  /** Prefix for all keys (optional) */
  prefix?: string;
  /** Read-only mode */
  readonly?: boolean;
  /** Force path-style URLs (required for some S3-compatible services) */
  forcePathStyle?: boolean;
}

/**
 * S3 VFS Backend
 */
export class S3VFSBackend implements VFSBackend {
  readonly name = "s3";
  readonly capabilities: VFSCapabilities;

  private bucket: string;
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private endpoint: string;
  private prefix: string;
  private readonly: boolean;
  private forcePathStyle: boolean;

  constructor(options: S3VFSOptions) {
    this.bucket = options.bucket;
    this.region = options.region;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.endpoint = options.endpoint ?? `https://s3.${options.region}.amazonaws.com`;
    this.prefix = options.prefix ?? "";
    this.readonly = options.readonly ?? false;
    this.forcePathStyle = options.forcePathStyle ?? false;

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

  private toS3Key(vfsPath: string): string {
    let path = vfsPath;
    if (path.startsWith("/")) {
      path = path.slice(1);
    }

    if (this.prefix) {
      return `${this.prefix}/${path}`;
    }
    return path;
  }


  private getUrl(key: string): string {
    if (this.forcePathStyle) {
      return `${this.endpoint}/${this.bucket}/${key}`;
    }
    // Virtual-hosted style
    const url = new URL(this.endpoint);
    url.hostname = `${this.bucket}.${url.hostname}`;
    url.pathname = `/${key}`;
    return url.toString();
  }

  /**
   * Sign a request using AWS Signature Version 4
   */
  private async signRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: Uint8Array | string
  ): Promise<Record<string, string>> {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 8);
    const timeStr = now.toISOString().replace(/[:-]|\.\d{3}/g, "");

    const parsedUrl = new URL(url);
    const host = parsedUrl.host;
    const path = parsedUrl.pathname;
    const query = parsedUrl.search.slice(1);

    // Add required headers
    const signHeaders: Record<string, string> = {
      ...headers,
      host,
      "x-amz-date": timeStr,
    };

    // Calculate payload hash
    let payloadHash: string;
    if (body) {
      const data = typeof body === "string" ? new TextEncoder().encode(body) : body;
      payloadHash = await this.sha256Hex(data);
    } else {
      payloadHash = await this.sha256Hex(new Uint8Array(0));
    }
    signHeaders["x-amz-content-sha256"] = payloadHash;

    // Create canonical request
    const signedHeaderNames = Object.keys(signHeaders)
      .map((k) => k.toLowerCase())
      .sort()
      .join(";");

    const canonicalHeaders = Object.entries(signHeaders)
      .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
      .sort()
      .join("\n");

    const canonicalRequest = [
      method,
      path || "/",
      query,
      canonicalHeaders + "\n",
      signedHeaderNames,
      payloadHash,
    ].join("\n");

    // Create string to sign
    const credentialScope = `${dateStr}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      timeStr,
      credentialScope,
      await this.sha256Hex(new TextEncoder().encode(canonicalRequest)),
    ].join("\n");

    // Calculate signature
    const kDate = await this.hmac(
      new TextEncoder().encode("AWS4" + this.secretAccessKey),
      dateStr
    );
    const kRegion = await this.hmac(kDate, this.region);
    const kService = await this.hmac(kRegion, "s3");
    const kSigning = await this.hmac(kService, "aws4_request");
    const signature = await this.hmacHex(kSigning, stringToSign);

    // Create authorization header
    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaderNames}`,
      `Signature=${signature}`,
    ].join(", ");

    return {
      ...signHeaders,
      authorization,
    };
  }

  private async sha256Hex(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data as BufferSource);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(message)
    );
    return new Uint8Array(signature);
  }

  private async hmacHex(key: Uint8Array, message: string): Promise<string> {
    const signature = await this.hmac(key, message);
    return Array.from(signature)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async read(path: string): Promise<Uint8Array> {
    const key = this.toS3Key(path);
    const url = this.getUrl(key);

    const headers = await this.signRequest("GET", url, {});

    const response = await fetch(url, { headers });

    if (response.status === 404) {
      throw new Error(`ENOENT: no such file, open '${path}'`);
    }

    if (!response.ok) {
      throw new Error(`S3 error: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async readText(path: string): Promise<string> {
    const data = await this.read(path);
    return new TextDecoder().decode(data);
  }

  async write(path: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    if (this.readonly) {
      throw new Error("S3 bucket is read-only");
    }

    const key = this.toS3Key(path);
    const url = this.getUrl(key);

    const reqHeaders: Record<string, string> = {
      "content-length": String(data.length),
    };

    if (options?.contentType) {
      reqHeaders["content-type"] = options.contentType;
    }

    const headers = await this.signRequest("PUT", url, reqHeaders, data);

    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: data as BodyInit,
    });

    if (!response.ok) {
      throw new Error(`S3 error: ${response.status} ${response.statusText}`);
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
    if (this.readonly) {
      throw new Error("S3 bucket is read-only");
    }

    const key = this.toS3Key(path);
    const url = this.getUrl(key);

    const headers = await this.signRequest("DELETE", url, {});

    const response = await fetch(url, {
      method: "DELETE",
      headers,
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`S3 error: ${response.status} ${response.statusText}`);
    }
  }

  async stat(path: string): Promise<FileInfo> {
    const key = this.toS3Key(path);
    const url = this.getUrl(key);

    const headers = await this.signRequest("HEAD", url, {});

    const response = await fetch(url, {
      method: "HEAD",
      headers,
    });

    if (response.status === 404) {
      // Check if this is a "directory" (prefix with objects)
      const entries = await this.list(path, { limit: 1 });
      if (entries.length > 0) {
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

    if (!response.ok) {
      throw new Error(`S3 error: ${response.status} ${response.statusText}`);
    }

    const size = parseInt(response.headers.get("content-length") ?? "0");
    const lastModified = response.headers.get("last-modified");
    const contentType = response.headers.get("content-type") ?? undefined;

    return {
      path,
      size,
      isDirectory: false,
      isFile: true,
      createdAt: lastModified ? new Date(lastModified).getTime() : Date.now(),
      modifiedAt: lastModified ? new Date(lastModified).getTime() : Date.now(),
      contentType,
    };
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
    let prefix = this.toS3Key(path);
    if (prefix && !prefix.endsWith("/")) {
      prefix += "/";
    }
    if (prefix === "/") {
      prefix = "";
    }

    const params = new URLSearchParams({
      "list-type": "2",
      ...(prefix && { prefix }),
      ...(options?.limit && { "max-keys": String(options.limit) }),
      ...(options?.cursor && { "continuation-token": options.cursor }),
      ...(!options?.recursive && { delimiter: "/" }),
    });

    const baseUrl = this.forcePathStyle
      ? `${this.endpoint}/${this.bucket}`
      : (() => {
          const url = new URL(this.endpoint);
          url.hostname = `${this.bucket}.${url.hostname}`;
          return url.toString();
        })();

    const url = `${baseUrl}?${params}`;
    const headers = await this.signRequest("GET", url, {});

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`S3 error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    // Parse XML response (simple parser)
    const entries: string[] = [];

    // Extract object keys
    const keyMatches = text.matchAll(/<Key>([^<]+)<\/Key>/g);
    for (const match of keyMatches) {
      const key = match[1];
      if (key) {
        const relativePath = key.slice(prefix.length);
        if (relativePath) {
          entries.push(relativePath);
        }
      }
    }

    // Extract common prefixes (directories)
    const prefixMatches = text.matchAll(/<Prefix>([^<]+)<\/Prefix>/g);
    for (const match of prefixMatches) {
      const dirPrefix = match[1];
      if (dirPrefix && dirPrefix !== prefix) {
        const relativePath = dirPrefix.slice(prefix.length);
        const dirName = relativePath.endsWith("/")
          ? relativePath.slice(0, -1)
          : relativePath;
        if (dirName) {
          entries.push(dirName);
        }
      }
    }

    // Check for truncation
    const isTruncated = text.includes("<IsTruncated>true</IsTruncated>");
    const nextToken = text.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];

    return {
      entries: [...new Set(entries)].sort(),
      hasMore: isTruncated,
      cursor: nextToken,
    };
  }

  async mkdir(_path: string, _options?: { recursive?: boolean }): Promise<void> {
    // S3 doesn't have real directories - no-op
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.readonly) {
      throw new Error("S3 bucket is read-only");
    }

    const entries = await this.list(path, { recursive: true });

    if (entries.length > 0) {
      if (!options?.recursive) {
        throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
      }

      // Delete all objects
      for (const entry of entries) {
        await this.delete(`${path}/${entry}`);
      }
    }
  }

  async copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.readonly) {
      throw new Error("S3 bucket is read-only");
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
      throw new Error("S3 bucket is read-only");
    }

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
 * Create an S3 VFS backend
 */
export function createS3VFS(options: S3VFSOptions): S3VFSBackend {
  return new S3VFSBackend(options);
}
