/**
 * Google Drive VFS Backend
 *
 * Mounts Google Drive folders as virtual filesystems.
 * Uses Google Drive API v3 via fetch (no SDK dependencies).
 *
 * Features:
 * - OAuth2 with automatic token refresh
 * - Path-to-fileId caching
 * - Google Docs export
 * - Read/write/delete operations
 */

import type {
  VFSBackend,
  VFSCapabilities,
  FileInfo,
  ListOptions,
  ListResult,
  WriteOptions,
} from "./interface.js";
import { GoogleDriveAuth, type GoogleDriveAuthOptions } from "./gdrive-auth.js";
import {
  GoogleDrivePathCache,
  type PathCacheEntry,
} from "./gdrive-path-cache.js";

/**
 * Google Drive API endpoints
 */
const API_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

/**
 * Google Drive folder MIME type
 */
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/**
 * Options for GoogleDriveVFSBackend
 */
export interface GoogleDriveVFSOptions extends GoogleDriveAuthOptions {
  /** Google Drive folder ID to mount as root (default: "root" = My Drive) */
  rootFolderId?: string;
  /** Mount as read-only */
  readonly?: boolean;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number;
  /** Maximum cache entries (default: 10000) */
  maxCacheEntries?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Google Drive file metadata from API
 */
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
}

/**
 * Google Drive API list response
 */
interface DriveListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

/**
 * Google Drive VFS Backend
 *
 * Implements the VFSBackend interface for Google Drive storage.
 * Uses path-to-fileId caching for efficient lookups.
 */
export class GoogleDriveVFSBackend implements VFSBackend {
  readonly name = "gdrive";
  readonly capabilities: VFSCapabilities;

  private auth: GoogleDriveAuth;
  private cache: GoogleDrivePathCache;
  private rootFolderId: string;
  private readonly: boolean;

  constructor(options: GoogleDriveVFSOptions) {
    // Initialize auth
    this.auth = new GoogleDriveAuth({
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      expiresAt: options.expiresAt,
      onTokenRefresh: options.onTokenRefresh,
    });

    // Initialize cache
    this.cache = new GoogleDrivePathCache({
      ttlMs: options.cacheTtlMs ?? 5 * 60 * 1000,
      maxEntries: options.maxCacheEntries ?? 10000,
    });

    this.rootFolderId = options.rootFolderId ?? "root";
    this.readonly = options.readonly ?? false;

    // Set capabilities
    this.capabilities = {
      read: true,
      write: !this.readonly,
      delete: !this.readonly,
      directories: true,
      symlinks: false,
      watch: false,
      maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
    };
  }

  // ============================================================================
  // VFSBackend Implementation
  // ============================================================================

  async read(path: string): Promise<Uint8Array> {
    const fileId = await this.resolvePathToFileId(path);
    const entry = this.cache.getEntry(path);

    // Check if it's a Google Docs file (requires export)
    if (entry && this.isGoogleDoc(entry.mimeType)) {
      return this.exportGoogleDoc(fileId, entry.mimeType);
    }

    // Regular file download
    const url = `${API_BASE}/files/${fileId}?alt=media`;
    const response = await this.fetchWithAuth(url);

    if (response.status === 404) {
      throw new Error(`ENOENT: no such file, open '${path}'`);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Drive error: ${response.status} - ${error}`);
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
      throw new Error("Google Drive is read-only");
    }

    const normalized = this.normalizePath(path);
    const fileName = this.getFileName(normalized);
    const parentPath = this.getParentPath(normalized);

    // Ensure parent exists
    if (options?.createParents) {
      await this.mkdir(parentPath, { recursive: true });
    }

    const parentId = await this.resolvePathToFileId(parentPath);

    // Check if file exists
    let existingFileId: string | null = null;
    try {
      existingFileId = await this.resolvePathToFileId(normalized);
    } catch {
      // File doesn't exist, will create
    }

    const contentType = options?.contentType ?? "application/octet-stream";

    if (existingFileId) {
      await this.updateFile(existingFileId, data, contentType);
    } else {
      await this.createFile(fileName, parentId, data, contentType, options?.metadata);
    }

    // Invalidate cache
    this.cache.invalidate(normalized);
  }

  async writeText(path: string, text: string, options?: WriteOptions): Promise<void> {
    const data = new TextEncoder().encode(text);
    await this.write(path, data, {
      ...options,
      contentType: options?.contentType ?? "text/plain",
    });
  }

  async delete(path: string): Promise<void> {
    if (this.readonly) {
      throw new Error("Google Drive is read-only");
    }

    const fileId = await this.resolvePathToFileId(path);
    const entry = this.cache.getEntry(path);

    if (entry?.isFolder) {
      throw new Error(`EISDIR: illegal operation on a directory, unlink '${path}'`);
    }

    await this.trashFile(fileId);
    this.cache.invalidate(path);
  }

  async stat(path: string): Promise<FileInfo> {
    const normalized = this.normalizePath(path);

    // Root always exists
    if (normalized === "/") {
      return {
        path: "/",
        size: 0,
        isDirectory: true,
        isFile: false,
        createdAt: 0,
        modifiedAt: 0,
      };
    }

    // Check cache first
    const cached = this.cache.getEntry(normalized);
    if (cached) {
      return this.entryToFileInfo(normalized, cached);
    }

    // Resolve and fetch metadata
    const fileId = await this.resolvePathToFileId(normalized);

    // Fetch file metadata
    const url = `${API_BASE}/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime`;
    const response = await this.fetchWithAuth(url);

    if (response.status === 404) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }

    if (!response.ok) {
      throw new Error(`Google Drive stat failed: ${response.status}`);
    }

    const file = (await response.json()) as DriveFile;
    const isFolder = file.mimeType === FOLDER_MIME_TYPE;

    return {
      path: normalized,
      size: parseInt(file.size || "0"),
      isDirectory: isFolder,
      isFile: !isFolder,
      createdAt: file.createdTime ? new Date(file.createdTime).getTime() : 0,
      modifiedAt: file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0,
      contentType: isFolder ? undefined : file.mimeType,
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
    const folderId = await this.resolvePathToFileId(path);
    const normalized = this.normalizePath(path);

    // Build query
    const query = `'${folderId}' in parents and trashed = false`;

    const params = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents)",
      pageSize: String(options?.limit ?? 1000),
      orderBy: "name",
    });

    if (options?.cursor) {
      params.set("pageToken", options.cursor);
    }

    const url = `${API_BASE}/files?${params}`;
    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Google Drive list failed: ${response.status}`);
    }

    const data = (await response.json()) as DriveListResponse;
    const entries: string[] = [];

    for (const file of data.files || []) {
      entries.push(file.name);

      // Cache the entry
      const entryPath = normalized === "/" ? `/${file.name}` : `${normalized}/${file.name}`;
      this.cache.set(entryPath, {
        fileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        isFolder: file.mimeType === FOLDER_MIME_TYPE,
        parentId: folderId,
        size: parseInt(file.size || "0"),
        createdTime: file.createdTime ? new Date(file.createdTime).getTime() : 0,
        modifiedTime: file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0,
        cachedAt: Date.now(),
      });
    }

    // Handle recursive listing
    if (options?.recursive) {
      for (const file of data.files || []) {
        if (file.mimeType === FOLDER_MIME_TYPE) {
          const childPath = normalized === "/" ? `/${file.name}` : `${normalized}/${file.name}`;
          const childEntries = await this.list(childPath, { recursive: true });
          for (const child of childEntries) {
            entries.push(`${file.name}/${child}`);
          }
        }
      }
    }

    return {
      entries: entries.sort(),
      hasMore: !!data.nextPageToken,
      cursor: data.nextPageToken,
    };
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.readonly) {
      throw new Error("Google Drive is read-only");
    }

    const normalized = this.normalizePath(path);

    if (normalized === "/") {
      return; // Root always exists
    }

    // Check if already exists
    try {
      await this.resolvePathToFileId(normalized);
      const entry = this.cache.getEntry(normalized);
      if (entry && !entry.isFolder) {
        throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
      }
      return; // Directory already exists
    } catch (e) {
      if (!String(e).includes("ENOENT")) {
        throw e;
      }
    }

    const segments = normalized.split("/").filter(Boolean);
    let currentPath = "";
    let parentId = this.rootFolderId;

    for (const segment of segments) {
      currentPath += "/" + segment;

      try {
        parentId = await this.resolvePathToFileId(currentPath);
      } catch (e) {
        if (!String(e).includes("ENOENT")) {
          throw e;
        }

        if (!options?.recursive && currentPath !== normalized) {
          throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
        }

        // Create folder
        parentId = await this.createFolder(segment, parentId);

        // Cache it
        this.cache.set(currentPath, {
          fileId: parentId,
          name: segment,
          mimeType: FOLDER_MIME_TYPE,
          isFolder: true,
          parentId: parentId,
          size: 0,
          createdTime: Date.now(),
          modifiedTime: Date.now(),
          cachedAt: Date.now(),
        });
      }
    }
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.readonly) {
      throw new Error("Google Drive is read-only");
    }

    const fileId = await this.resolvePathToFileId(path);
    const entry = this.cache.getEntry(path);

    if (entry && !entry.isFolder) {
      throw new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
    }

    // Check if empty
    const children = await this.list(path, { limit: 1 });
    if (children.length > 0 && !options?.recursive) {
      throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
    }

    if (options?.recursive && children.length > 0) {
      // Delete all children first
      const allChildren = await this.list(path);
      for (const child of allChildren) {
        const childPath = `${path}/${child}`;
        const childInfo = await this.stat(childPath);
        if (childInfo.isDirectory) {
          await this.rmdir(childPath, { recursive: true });
        } else {
          await this.delete(childPath);
        }
      }
    }

    await this.trashFile(fileId);
    this.cache.invalidate(path);
  }

  async copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.readonly) {
      throw new Error("Google Drive is read-only");
    }

    const srcInfo = await this.stat(src);

    if (srcInfo.isFile) {
      const srcFileId = await this.resolvePathToFileId(src);
      const destParentPath = this.getParentPath(dest);
      const destParentId = await this.resolvePathToFileId(destParentPath);
      const destName = this.getFileName(dest);

      // Use Google Drive copy API
      const url = `${API_BASE}/files/${srcFileId}/copy?fields=id`;

      const response = await this.fetchWithAuth(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: destName,
          parents: [destParentId],
        }),
      });

      if (!response.ok) {
        throw new Error(`Google Drive copy failed: ${response.status}`);
      }

      this.cache.invalidate(dest);
    } else {
      if (!options?.recursive) {
        throw new Error("Cannot copy directory without recursive option");
      }

      await this.mkdir(dest, { recursive: true });

      const entries = await this.list(src);
      for (const entry of entries) {
        const srcPath = `${src}/${entry}`;
        const destPath = `${dest}/${entry}`;
        await this.copy(srcPath, destPath, { recursive: true });
      }
    }
  }

  async move(src: string, dest: string): Promise<void> {
    if (this.readonly) {
      throw new Error("Google Drive is read-only");
    }

    const srcFileId = await this.resolvePathToFileId(src);
    const srcEntry = this.cache.getEntry(src);
    const destParentPath = this.getParentPath(dest);
    const destParentId = await this.resolvePathToFileId(destParentPath);
    const destName = this.getFileName(dest);

    // Use Google Drive update API to move
    const params = new URLSearchParams({
      addParents: destParentId,
      removeParents: srcEntry?.parentId || "",
      fields: "id",
    });

    const url = `${API_BASE}/files/${srcFileId}?${params}`;

    const response = await this.fetchWithAuth(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: destName }),
    });

    if (!response.ok) {
      throw new Error(`Google Drive move failed: ${response.status}`);
    }

    this.cache.invalidate(src);
    this.cache.invalidate(dest);
  }

  async initialize(): Promise<void> {
    // Verify access by listing root
    try {
      await this.list("/", { limit: 1 });
    } catch (error) {
      throw new Error(`Google Drive initialization failed: ${error}`);
    }
  }

  async close(): Promise<void> {
    this.cache.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Resolve VFS path to Google Drive file ID
   */
  private async resolvePathToFileId(path: string): Promise<string> {
    const normalized = this.normalizePath(path);

    // Root path
    if (normalized === "/") {
      return this.rootFolderId;
    }

    // Check cache
    const cached = this.cache.getFileId(normalized);
    if (cached) {
      return cached;
    }

    // Resolve path segments iteratively
    const segments = normalized.split("/").filter(Boolean);
    let currentId = this.rootFolderId;
    let currentPath = "";

    for (const segment of segments) {
      currentPath += "/" + segment;

      // Check cache for this segment
      const segmentCached = this.cache.getFileId(currentPath);
      if (segmentCached) {
        currentId = segmentCached;
        continue;
      }

      // Query Google Drive
      const query = `'${currentId}' in parents and name = '${this.escapeQueryString(segment)}' and trashed = false`;
      const params = new URLSearchParams({
        q: query,
        fields: "files(id,name,mimeType,size,createdTime,modifiedTime,parents)",
        pageSize: "1",
      });

      const url = `${API_BASE}/files?${params}`;
      const response = await this.fetchWithAuth(url);

      if (!response.ok) {
        throw new Error(`Failed to resolve path: ${response.status}`);
      }

      const data = (await response.json()) as DriveListResponse;
      const file = data.files?.[0];
      if (!file) {
        throw new Error(`ENOENT: no such file or directory, '${path}'`);
      }

      const entry: PathCacheEntry = {
        fileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        isFolder: file.mimeType === FOLDER_MIME_TYPE,
        parentId: currentId,
        size: parseInt(file.size || "0"),
        createdTime: file.createdTime ? new Date(file.createdTime).getTime() : 0,
        modifiedTime: file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0,
        cachedAt: Date.now(),
      };

      this.cache.set(currentPath, entry);
      currentId = file.id;
    }

    return currentId;
  }

  /**
   * Fetch with authentication
   */
  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.auth.getAccessToken();

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(url, {
      ...options,
      headers,
    });
  }

  /**
   * Create a file
   */
  private async createFile(
    name: string,
    parentId: string,
    data: Uint8Array,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    const boundary = "-------" + crypto.randomUUID();

    const fileMetadata = {
      name,
      parents: [parentId],
      properties: metadata || {},
    };

    const multipartBody = this.buildMultipartBody(boundary, fileMetadata, data, contentType);

    const url = `${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType`;

    const response = await this.fetchWithAuth(url, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody as unknown as BodyInit,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`File create failed: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as { id: string };
    return result.id;
  }

  /**
   * Update existing file
   */
  private async updateFile(fileId: string, data: Uint8Array, contentType: string): Promise<void> {
    const url = `${UPLOAD_BASE}/files/${fileId}?uploadType=media`;

    const response = await this.fetchWithAuth(url, {
      method: "PATCH",
      headers: {
        "Content-Type": contentType,
      },
      body: data as unknown as BodyInit,
    });

    if (!response.ok) {
      throw new Error(`File update failed: ${response.status}`);
    }
  }

  /**
   * Create a folder
   */
  private async createFolder(name: string, parentId: string): Promise<string> {
    const metadata = {
      name,
      mimeType: FOLDER_MIME_TYPE,
      parents: [parentId],
    };

    const url = `${API_BASE}/files?fields=id`;

    const response = await this.fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      throw new Error(`Folder create failed: ${response.status}`);
    }

    const result = (await response.json()) as { id: string };
    return result.id;
  }

  /**
   * Move file to trash
   */
  private async trashFile(fileId: string): Promise<void> {
    const url = `${API_BASE}/files/${fileId}`;

    const response = await this.fetchWithAuth(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Delete failed: ${response.status}`);
    }
  }

  /**
   * Export Google Docs file
   */
  private async exportGoogleDoc(fileId: string, mimeType: string): Promise<Uint8Array> {
    const exportMimeType = this.getExportMimeType(mimeType);
    const url = `${API_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Check if MIME type is a Google Docs type
   */
  private isGoogleDoc(mimeType: string): boolean {
    return mimeType.startsWith("application/vnd.google-apps.");
  }

  /**
   * Get export MIME type for Google Docs
   */
  private getExportMimeType(googleMimeType: string): string {
    const exportMap: Record<string, string> = {
      "application/vnd.google-apps.document": "text/plain",
      "application/vnd.google-apps.spreadsheet": "text/csv",
      "application/vnd.google-apps.presentation": "application/pdf",
      "application/vnd.google-apps.drawing": "image/png",
    };
    return exportMap[googleMimeType] || "application/pdf";
  }

  /**
   * Build multipart body for file upload
   */
  private buildMultipartBody(
    boundary: string,
    metadata: object,
    data: Uint8Array,
    contentType: string
  ): Uint8Array {
    const encoder = new TextEncoder();

    const metadataPart = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      "",
    ].join("\r\n");

    const contentPart = [
      `--${boundary}`,
      `Content-Type: ${contentType}`,
      "",
      "",
    ].join("\r\n");

    const ending = `\r\n--${boundary}--`;

    const metadataBytes = encoder.encode(metadataPart);
    const contentHeaderBytes = encoder.encode(contentPart);
    const endingBytes = encoder.encode(ending);

    const combined = new Uint8Array(
      metadataBytes.length + contentHeaderBytes.length + data.length + endingBytes.length
    );
    combined.set(metadataBytes, 0);
    combined.set(contentHeaderBytes, metadataBytes.length);
    combined.set(data, metadataBytes.length + contentHeaderBytes.length);
    combined.set(endingBytes, metadataBytes.length + contentHeaderBytes.length + data.length);

    return combined;
  }

  /**
   * Normalize path
   */
  private normalizePath(path: string): string {
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    if (path !== "/" && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return path.replace(/\/+/g, "/");
  }

  /**
   * Get file name from path
   */
  private getFileName(path: string): string {
    const normalized = this.normalizePath(path);
    const lastSlash = normalized.lastIndexOf("/");
    return normalized.slice(lastSlash + 1);
  }

  /**
   * Get parent path
   */
  private getParentPath(path: string): string {
    const normalized = this.normalizePath(path);
    if (normalized === "/") return "/";
    const lastSlash = normalized.lastIndexOf("/");
    return lastSlash === 0 ? "/" : normalized.slice(0, lastSlash);
  }

  /**
   * Escape string for Drive query
   */
  private escapeQueryString(str: string): string {
    return str.replace(/'/g, "\\'");
  }

  /**
   * Convert cache entry to FileInfo
   */
  private entryToFileInfo(path: string, entry: PathCacheEntry): FileInfo {
    return {
      path,
      size: entry.size,
      isDirectory: entry.isFolder,
      isFile: !entry.isFolder,
      createdAt: entry.createdTime,
      modifiedAt: entry.modifiedTime,
      contentType: entry.isFolder ? undefined : entry.mimeType,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Google Drive VFS backend
 */
export async function createGoogleDriveVFS(
  options: GoogleDriveVFSOptions
): Promise<GoogleDriveVFSBackend> {
  const backend = new GoogleDriveVFSBackend(options);
  await backend.initialize?.();
  return backend;
}
