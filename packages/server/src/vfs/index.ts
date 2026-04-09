/**
 * Virtual Filesystem module exports
 *
 * Provides unified VFS backends for:
 * - Memory (all platforms)
 * - Local filesystem (Node.js)
 * - Cloudflare R2
 * - AWS S3 / S3-compatible
 * - Git repository
 * - Google Drive
 * - Composite (multi-mount)
 */

// Core interface
export type {
  VFSBackend,
  VFSCapabilities,
  FileInfo,
  ListOptions,
  ListResult,
  WriteOptions,
  MountConfig,
  MountType,
  MountCredentials,
  VFSBackendFactory,
} from "./interface.js";

// Memory backend (universal)
export { MemoryVFSBackend, createMemoryVFS } from "./memory.js";

// Local filesystem backend (Node.js)
export { LocalVFSBackend, createLocalVFS } from "./local.js";
export type { LocalVFSOptions } from "./local.js";

// R2 backend (Cloudflare)
export { R2VFSBackend, createR2VFS } from "./r2.js";
export type { R2VFSOptions, R2Bucket } from "./r2.js";

// S3 backend (AWS / S3-compatible)
export { S3VFSBackend, createS3VFS } from "./s3.js";
export type { S3VFSOptions } from "./s3.js";

// Git backend
export { GitVFSBackend, createGitVFS, createCachedGitVFS } from "./git.js";
export type { GitVFSOptions, GitCloneStrategy, GitCacheOptions } from "./git.js";

// Git utilities
export { GitCache, getGitCache, setGitCache } from "./git-cache.js";
export type { GitCacheEntry, GitCacheStats, GitCacheOptions as GitCacheInstanceOptions } from "./git-cache.js";

export {
  cloneWithIsomorphicGit,
  fetchWithIsomorphicGit,
  isRepositoryCloned,
  getCurrentCommit,
  VFSAdapter,
} from "./git-cloner-isomorphic.js";
export type {
  GitCredentials,
  IsomorphicGitCloneOptions,
  IsomorphicGitCloneResult,
} from "./git-cloner-isomorphic.js";

// Google Drive backend
export { GoogleDriveVFSBackend, createGoogleDriveVFS } from "./gdrive.js";
export type { GoogleDriveVFSOptions } from "./gdrive.js";

// Google Drive utilities
export { GoogleDriveAuth, createGoogleDriveAuth } from "./gdrive-auth.js";
export type { GoogleDriveAuthOptions, TokenRefreshResult } from "./gdrive-auth.js";

export { GoogleDrivePathCache } from "./gdrive-path-cache.js";
export type { PathCacheEntry, PathCacheOptions } from "./gdrive-path-cache.js";

// Composite backend (multi-mount)
export {
  CompositeVFSBackend,
  createCompositeVFS,
  createCompositeVFSWithMounts,
} from "./composite.js";
