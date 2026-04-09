/**
 * Message types for Browser QuickJS Web Worker communication
 *
 * This module defines the protocol for communication between:
 * - Main thread (QuickJSBrowserBackend)
 * - Web Worker (quickjs-browser-worker.ts)
 */

import type { LimitsPolicy, NetworkPolicy } from "../interface.js";

/**
 * Serialized execution options (safe for postMessage)
 */
export interface SerializedExecuteOptions {
  /** Resource limits */
  limits?: LimitsPolicy;
  /** Environment variables */
  env?: Record<string, string>;
  /** Entry point path for VFS execution */
  entryPath?: string;
  /** Whether VFS is available (operations proxied to main thread) */
  hasVfs?: boolean;
  /** Network policy for guarded fetch */
  network?: NetworkPolicy;
  /** Available MCP server configurations */
  mcpConfigs?: Array<{
    name: string;
    tools?: Array<{ name: string; inputSchema?: unknown }>;
  }>;
  /** Whether MCP call tool is available */
  hasMcpCallTool?: boolean;
}

// ============================================================================
// Main Thread → Worker Messages
// ============================================================================

/** Initialize QuickJS WASM in the worker */
export interface InitMessage {
  type: "init";
  /** Optional custom WASM URL */
  wasmUrl?: string;
}

/** Execute code in the worker */
export interface ExecuteMessage {
  type: "execute";
  /** Unique request ID for matching responses */
  id: string;
  /** JavaScript code to execute */
  code: string;
  /** Serialized execution options */
  options: SerializedExecuteOptions;
}

/** Dispose the worker and cleanup resources */
export interface DisposeMessage {
  type: "dispose";
}

/** Response to VFS read request from worker */
export interface VfsReadResponseMessage {
  type: "vfs-read-response";
  /** Request ID from the original vfs-read message */
  id: string;
  /** File data as base64 (if successful) */
  data?: string;
  /** Error message (if failed) */
  error?: string;
}

/** Response to VFS write request from worker */
export interface VfsWriteResponseMessage {
  type: "vfs-write-response";
  /** Request ID from the original vfs-write message */
  id: string;
  /** Error message (if failed) */
  error?: string;
}

/** Response to VFS list request from worker */
export interface VfsListResponseMessage {
  type: "vfs-list-response";
  /** Request ID from the original vfs-list message */
  id: string;
  /** Directory entries (if successful) */
  entries?: string[];
  /** Error message (if failed) */
  error?: string;
}

/** Response to VFS stat request from worker */
export interface VfsStatResponseMessage {
  type: "vfs-stat-response";
  /** Request ID from the original vfs-stat message */
  id: string;
  /** File info (if successful) */
  info?: {
    isDirectory: boolean;
    isFile: boolean;
    size: number;
    modifiedAt: number;
    createdAt?: number;
  };
  /** Error message (if failed) */
  error?: string;
}

/** Response to fetch request from worker */
export interface FetchResponseMessage {
  type: "fetch-response";
  /** Request ID from the original fetch message */
  id: string;
  /** Serialized response (if successful) */
  response?: {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string; // base64 encoded
  };
  /** Error message (if failed) */
  error?: string;
}

/** Response to MCP call from worker */
export interface McpCallResponseMessage {
  type: "mcp-call-response";
  /** Request ID from the original mcp-call message */
  id: string;
  /** Result (if successful) */
  result?: unknown;
  /** Error message (if failed) */
  error?: string;
}

/** All messages from main thread to worker */
export type MainToWorkerMessage =
  | InitMessage
  | ExecuteMessage
  | DisposeMessage
  | VfsReadResponseMessage
  | VfsWriteResponseMessage
  | VfsListResponseMessage
  | VfsStatResponseMessage
  | FetchResponseMessage
  | McpCallResponseMessage;

// ============================================================================
// Worker → Main Thread Messages
// ============================================================================

/** Worker is ready after initialization */
export interface ReadyMessage {
  type: "ready";
}

/** Execution result */
export interface ResultMessage {
  type: "result";
  /** Request ID matching the execute message */
  id: string;
  /** Execution result */
  result: {
    exitCode: number;
    stdout: string;
    stderr: string;
    wallMs: number;
    lastValue?: string;
  };
}

/** Execution error */
export interface ErrorMessage {
  type: "error";
  /** Request ID (or "init" for initialization errors) */
  id: string;
  /** Error message */
  error: string;
}

/** Stdout chunk from execution */
export interface StdoutMessage {
  type: "stdout";
  /** Request ID for the execution */
  id: string;
  /** Stdout chunk */
  chunk: string;
}

/** Stderr chunk from execution */
export interface StderrMessage {
  type: "stderr";
  /** Request ID for the execution */
  id: string;
  /** Stderr chunk */
  chunk: string;
}

/** VFS read request from worker */
export interface VfsReadMessage {
  type: "vfs-read";
  /** Unique request ID */
  id: string;
  /** Execution request ID */
  execId: string;
  /** File path to read */
  path: string;
}

/** VFS write request from worker */
export interface VfsWriteMessage {
  type: "vfs-write";
  /** Unique request ID */
  id: string;
  /** Execution request ID */
  execId: string;
  /** File path to write */
  path: string;
  /** File data as base64 */
  data: string;
}

/** VFS list request from worker */
export interface VfsListMessage {
  type: "vfs-list";
  /** Unique request ID */
  id: string;
  /** Execution request ID */
  execId: string;
  /** Directory path to list */
  path: string;
}

/** VFS stat request from worker */
export interface VfsStatMessage {
  type: "vfs-stat";
  /** Unique request ID */
  id: string;
  /** Execution request ID */
  execId: string;
  /** File path to stat */
  path: string;
}

/** VFS mkdir request from worker */
export interface VfsMkdirMessage {
  type: "vfs-mkdir";
  /** Unique request ID */
  id: string;
  /** Execution request ID */
  execId: string;
  /** Directory path to create */
  path: string;
}

/** VFS delete request from worker */
export interface VfsDeleteMessage {
  type: "vfs-delete";
  /** Unique request ID */
  id: string;
  /** Execution request ID */
  execId: string;
  /** File path to delete */
  path: string;
}

/** Fetch request from worker */
export interface FetchMessage {
  type: "fetch";
  /** Unique request ID */
  id: string;
  /** Execution request ID */
  execId: string;
  /** URL to fetch */
  url: string;
  /** Fetch options */
  options: RequestInit;
}

/** MCP tool call request from worker */
export interface McpCallMessage {
  type: "mcp-call";
  /** Unique request ID */
  id: string;
  /** Execution request ID */
  execId: string;
  /** MCP server name */
  serverName: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  args: Record<string, unknown>;
}

/** All messages from worker to main thread */
export type WorkerToMainMessage =
  | ReadyMessage
  | ResultMessage
  | ErrorMessage
  | StdoutMessage
  | StderrMessage
  | VfsReadMessage
  | VfsWriteMessage
  | VfsListMessage
  | VfsStatMessage
  | VfsMkdirMessage
  | VfsDeleteMessage
  | FetchMessage
  | McpCallMessage;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Encode Uint8Array to base64 string (browser-compatible)
 */
export function encodeBase64(data: Uint8Array): string {
  const binaryString = Array.from(data, (byte) =>
    String.fromCharCode(byte)
  ).join("");
  return btoa(binaryString);
}

/**
 * Decode base64 string to Uint8Array (browser-compatible)
 */
export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Get byte length of a string (browser-compatible replacement for Buffer.byteLength)
 */
export function getByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}
