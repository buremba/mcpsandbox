/**
 * Execution backend interface for cross-platform code execution
 *
 * Implementations:
 * - QuickJSNodeBackend: Node.js (quickjs-emscripten)
 * - QuickJSWorkerBackend: Cloudflare Workers (quickjs-emscripten)
 * - QuickJSBrowserBackend: Browser (Web Worker + quickjs-emscripten)
 * - ContainerBackend: Docker/CF Containers for git, stdio MCP, native binaries
 */

import type { VFSBackend } from "../vfs/interface.js";

/**
 * Capabilities of an execution backend
 */
export interface ExecutionCapabilities {
  /** Can make network requests */
  network: boolean;
  /** Has filesystem access (via VFS) */
  filesystem: boolean;
  /** Can spawn containers/processes */
  containers: boolean;
  /** Supports async/await */
  asyncAwait: boolean;
  /** Maximum concurrent executions */
  maxConcurrency: number;
}

/**
 * Network policy for execution
 */
export interface NetworkPolicy {
  /** Allowed domains/patterns (glob patterns supported) */
  allow?: string[];
  /** Blocked domains/patterns (glob patterns supported) */
  block?: string[];
  /** Maximum response body size in bytes */
  maxBodyBytes?: number;
  /** Maximum number of redirects to follow */
  maxRedirects?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Resource limits for execution
 */
export interface LimitsPolicy {
  /** Maximum execution time in milliseconds */
  timeoutMs?: number;
  /** Maximum memory usage in megabytes */
  memMb?: number;
  /** Maximum stdout size in bytes */
  stdoutBytes?: number;
  /** Maximum number of files that can be created */
  maxFiles?: number;
  /** Maximum total file size in bytes */
  maxTotalFileSize?: number;
}

/**
 * Options for code execution
 */
export interface ExecuteOptions {
  /** Virtual filesystem backend (optional) */
  vfs?: VFSBackend;
  /** Network policy (optional) */
  network?: NetworkPolicy;
  /** Resource limits (optional) */
  limits?: LimitsPolicy;
  /** Environment variables to inject */
  env?: Record<string, string>;
  /** Entry point file path (default: /index.js) */
  entryPath?: string;
  /** Arguments to pass to the script */
  args?: string[];
  /** MCP tool call handler (for proxying MCP calls) */
  mcpCallTool?: (
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<unknown>;
  /** Available MCP server configurations */
  mcpConfigs?: Array<{ name: string; tools?: Array<{ name: string; inputSchema?: unknown }> }>;
}

/**
 * Result of code execution
 */
export interface ExecuteResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Wall clock time in milliseconds */
  wallMs: number;
  /** Last expression value (REPL-style) */
  lastValue?: string;
  /** Files created/modified during execution */
  modifiedFiles?: string[];
  /** Memory usage at peak (if available) */
  peakMemoryBytes?: number;
}

/**
 * Execution backend interface
 * All implementations must support the execute() method
 */
export interface ExecutionBackend {
  /** Unique name for this backend */
  readonly name: string;

  /** Capabilities of this backend */
  readonly capabilities: ExecutionCapabilities;

  /**
   * Initialize the backend (load WASM, connect to container runtime, etc.)
   * Must be called before execute()
   */
  initialize(): Promise<void>;

  /**
   * Execute code in the sandboxed environment
   *
   * @param code JavaScript code to execute
   * @param options Execution options
   * @returns Execution result
   */
  execute(code: string, options?: ExecuteOptions): Promise<ExecuteResult>;

  /**
   * Execute code from a VFS filesystem
   * Reads the entry file from VFS and executes it
   *
   * @param options Execution options (must include vfs and entryPath)
   * @returns Execution result
   */
  executeFromVFS(options: ExecuteOptions & { vfs: VFSBackend; entryPath: string }): Promise<ExecuteResult>;

  /**
   * Check if the backend is ready to execute code
   */
  isReady(): boolean;

  /**
   * Dispose of resources (WASM contexts, connections, etc.)
   */
  dispose(): Promise<void>;
}

/**
 * Factory function type for creating execution backends
 */
export type ExecutionBackendFactory = () => Promise<ExecutionBackend>;

/**
 * Standard exit codes
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  TIMEOUT: 124,
  OUT_OF_MEMORY: 137,
  POLICY_VIOLATION: 126,
} as const;
