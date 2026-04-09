/**
 * QuickJS execution backend for Browser
 *
 * Uses quickjs-emscripten running inside a Web Worker for non-blocking
 * sandboxed JavaScript execution in browsers.
 */

import type {
  ExecutionBackend,
  ExecutionCapabilities,
  ExecuteOptions,
  ExecuteResult,
} from "./interface.js";
import type { VFSBackend } from "../vfs/interface.js";
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  SerializedExecuteOptions,
} from "./browser/worker-messages.js";
import { encodeBase64, decodeBase64 } from "./browser/worker-messages.js";

/**
 * Options for the browser QuickJS backend
 */
export interface QuickJSBrowserOptions {
  /** Optional name for logging/debugging */
  name?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Custom Worker script URL (for pre-built worker) */
  workerUrl?: string;
  /** Inline worker code (generated if not provided) */
  workerCode?: string;
}

/**
 * Pending request state
 */
interface PendingRequest {
  resolve: (result: ExecuteResult) => void;
  reject: (error: Error) => void;
  options?: ExecuteOptions;
  stdout: string;
  stderr: string;
  startTime: number;
}

/**
 * QuickJS execution backend for Browser
 *
 * Runs QuickJS WASM inside a Web Worker for non-blocking execution.
 * All VFS, fetch, and MCP operations are proxied back to the main thread.
 */
export class QuickJSBrowserBackend implements ExecutionBackend {
  readonly name: string;
  readonly capabilities: ExecutionCapabilities = {
    network: true, // Via main thread fetch proxy
    filesystem: true, // Via VFS adapter
    containers: false, // No container support in browser
    asyncAwait: true,
    maxConcurrency: 4, // Browser tab limits
  };

  private worker: Worker | null = null;
  private initialized = false;
  private verbose: boolean;
  private workerUrl?: string;
  private workerCode?: string;
  private requestId = 0;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(options?: QuickJSBrowserOptions) {
    this.name = options?.name ?? "quickjs-browser";
    this.verbose = options?.verbose ?? false;
    this.workerUrl = options?.workerUrl;
    this.workerCode = options?.workerCode;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create the worker
    if (this.workerUrl) {
      // Use provided worker URL
      this.worker = new Worker(this.workerUrl, { type: "module" });
    } else if (this.workerCode) {
      // Use provided inline code
      const blob = new Blob([this.workerCode], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url, { type: "module" });
    } else {
      // In a real implementation, you'd bundle the worker code
      // For now, throw an error indicating worker needs to be provided
      throw new Error(
        "QuickJSBrowserBackend requires either workerUrl or workerCode option. " +
        "The worker code should be the bundled quickjs-browser-worker.ts module."
      );
    }

    // Set up message handler
    this.worker.onmessage = (event) => this.handleWorkerMessage(event.data);
    this.worker.onerror = (error) => this.handleWorkerError(error);

    // Wait for worker to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Worker initialization timeout")),
        30000
      );

      const originalHandler = this.worker!.onmessage;
      this.worker!.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
        if (event.data.type === "ready") {
          clearTimeout(timeout);
          this.worker!.onmessage = originalHandler;
          resolve();
        } else if (event.data.type === "error" && event.data.id === "init") {
          clearTimeout(timeout);
          reject(new Error(event.data.error));
        }
      };

      this.postToWorker({ type: "init" });
    });

    this.initialized = true;
    this.log("Browser QuickJS backend initialized");
  }

  async dispose(): Promise<void> {
    if (!this.initialized || !this.worker) return;

    this.postToWorker({ type: "dispose" });
    this.worker.terminate();
    this.worker = null;
    this.initialized = false;
    this.pendingRequests.clear();

    this.log("Browser QuickJS backend disposed");
  }

  isReady(): boolean {
    return this.initialized && this.worker !== null;
  }

  async execute(code: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.initialized || !this.worker) {
      await this.initialize();
    }

    const id = String(++this.requestId);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve,
        reject,
        options,
        stdout: "",
        stderr: "",
        startTime,
      });

      // Serialize options for worker
      const serializedOptions = this.serializeOptions(options);

      this.postToWorker({
        type: "execute",
        id,
        code,
        options: serializedOptions,
      });
    });
  }

  async executeFromVFS(
    options: ExecuteOptions & { vfs: VFSBackend; entryPath: string }
  ): Promise<ExecuteResult> {
    // Read entry file from VFS
    const entryData = await options.vfs.read(options.entryPath);
    const code = new TextDecoder().decode(entryData);

    return this.execute(code, options);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Post a typed message to the worker
   */
  private postToWorker(message: MainToWorkerMessage): void {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }
    this.worker.postMessage(message);
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(message: WorkerToMainMessage): void {
    this.log(`Worker message: ${message.type}`);

    switch (message.type) {
      case "ready":
        // Handled in initialize()
        break;

      case "result":
        this.handleResult(message.id, message.result);
        break;

      case "error":
        this.handleError(message.id, message.error);
        break;

      case "stdout":
        this.handleStdout(message.id, message.chunk);
        break;

      case "stderr":
        this.handleStderr(message.id, message.chunk);
        break;

      case "vfs-read":
        this.handleVfsRead(message.id, message.execId, message.path);
        break;

      case "vfs-write":
        this.handleVfsWrite(message.id, message.execId, message.path, message.data);
        break;

      case "vfs-list":
        this.handleVfsList(message.id, message.execId, message.path);
        break;

      case "vfs-stat":
        this.handleVfsStat(message.id, message.execId, message.path);
        break;

      case "vfs-mkdir":
        this.handleVfsMkdir(message.id, message.execId, message.path);
        break;

      case "vfs-delete":
        this.handleVfsDelete(message.id, message.execId, message.path);
        break;

      case "fetch":
        this.handleFetch(message.id, message.execId, message.url, message.options);
        break;

      case "mcp-call":
        this.handleMcpCall(
          message.id,
          message.execId,
          message.serverName,
          message.toolName,
          message.args
        );
        break;
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    this.log(`Worker error: ${error.message}`);

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      pending.reject(new Error(`Worker error: ${error.message}`));
    }
    this.pendingRequests.clear();
  }

  /**
   * Handle execution result
   */
  private handleResult(
    id: string,
    result: { exitCode: number; stdout: string; stderr: string; wallMs: number; lastValue?: string }
  ): void {
    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    this.pendingRequests.delete(id);

    // Combine stdout/stderr from streaming and final result
    pending.resolve({
      exitCode: result.exitCode,
      stdout: pending.stdout + result.stdout,
      stderr: pending.stderr + result.stderr,
      wallMs: result.wallMs,
      lastValue: result.lastValue,
    });
  }

  /**
   * Handle execution error
   */
  private handleError(id: string, error: string): void {
    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    this.pendingRequests.delete(id);
    pending.reject(new Error(error));
  }

  /**
   * Handle stdout chunk
   */
  private handleStdout(id: string, chunk: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      pending.stdout += chunk;
    }
  }

  /**
   * Handle stderr chunk
   */
  private handleStderr(id: string, chunk: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      pending.stderr += chunk;
    }
  }

  // ============================================================================
  // VFS Proxy Handlers
  // ============================================================================

  private async handleVfsRead(reqId: string, execId: string, path: string): Promise<void> {
    const pending = this.pendingRequests.get(execId);
    if (!pending?.options?.vfs) {
      this.postToWorker({
        type: "vfs-read-response",
        id: reqId,
        error: "VFS not available",
      });
      return;
    }

    try {
      const data = await pending.options.vfs.read(path);
      this.postToWorker({
        type: "vfs-read-response",
        id: reqId,
        data: encodeBase64(data),
      });
    } catch (error) {
      this.postToWorker({
        type: "vfs-read-response",
        id: reqId,
        error: String(error),
      });
    }
  }

  private async handleVfsWrite(
    reqId: string,
    execId: string,
    path: string,
    data: string
  ): Promise<void> {
    const pending = this.pendingRequests.get(execId);
    if (!pending?.options?.vfs) {
      this.postToWorker({
        type: "vfs-write-response",
        id: reqId,
        error: "VFS not available",
      });
      return;
    }

    try {
      await pending.options.vfs.write(path, decodeBase64(data));
      this.postToWorker({
        type: "vfs-write-response",
        id: reqId,
      });
    } catch (error) {
      this.postToWorker({
        type: "vfs-write-response",
        id: reqId,
        error: String(error),
      });
    }
  }

  private async handleVfsList(reqId: string, execId: string, path: string): Promise<void> {
    const pending = this.pendingRequests.get(execId);
    if (!pending?.options?.vfs) {
      this.postToWorker({
        type: "vfs-list-response",
        id: reqId,
        error: "VFS not available",
      });
      return;
    }

    try {
      const entries = await pending.options.vfs.list(path);
      this.postToWorker({
        type: "vfs-list-response",
        id: reqId,
        entries,
      });
    } catch (error) {
      this.postToWorker({
        type: "vfs-list-response",
        id: reqId,
        error: String(error),
      });
    }
  }

  private async handleVfsStat(reqId: string, execId: string, path: string): Promise<void> {
    const pending = this.pendingRequests.get(execId);
    if (!pending?.options?.vfs) {
      this.postToWorker({
        type: "vfs-stat-response",
        id: reqId,
        error: "VFS not available",
      });
      return;
    }

    try {
      const info = await pending.options.vfs.stat(path);
      this.postToWorker({
        type: "vfs-stat-response",
        id: reqId,
        info: {
          isDirectory: info.isDirectory,
          isFile: info.isFile,
          size: info.size,
          modifiedAt: info.modifiedAt,
          createdAt: info.createdAt,
        },
      });
    } catch (error) {
      this.postToWorker({
        type: "vfs-stat-response",
        id: reqId,
        error: String(error),
      });
    }
  }

  private async handleVfsMkdir(reqId: string, execId: string, path: string): Promise<void> {
    const pending = this.pendingRequests.get(execId);
    if (!pending?.options?.vfs) {
      this.postToWorker({
        type: "vfs-write-response", // Reuse write response for mkdir
        id: reqId,
        error: "VFS not available",
      });
      return;
    }

    try {
      await pending.options.vfs.mkdir(path);
      this.postToWorker({
        type: "vfs-write-response",
        id: reqId,
      });
    } catch (error) {
      this.postToWorker({
        type: "vfs-write-response",
        id: reqId,
        error: String(error),
      });
    }
  }

  private async handleVfsDelete(reqId: string, execId: string, path: string): Promise<void> {
    const pending = this.pendingRequests.get(execId);
    if (!pending?.options?.vfs) {
      this.postToWorker({
        type: "vfs-write-response",
        id: reqId,
        error: "VFS not available",
      });
      return;
    }

    try {
      await pending.options.vfs.delete(path);
      this.postToWorker({
        type: "vfs-write-response",
        id: reqId,
      });
    } catch (error) {
      this.postToWorker({
        type: "vfs-write-response",
        id: reqId,
        error: String(error),
      });
    }
  }

  // ============================================================================
  // Fetch Proxy Handler
  // ============================================================================

  private async handleFetch(
    reqId: string,
    execId: string,
    url: string,
    options: RequestInit
  ): Promise<void> {
    const pending = this.pendingRequests.get(execId);
    const network = pending?.options?.network;

    // Check network policy
    if (network && !this.isUrlAllowed(url, network)) {
      this.postToWorker({
        type: "fetch-response",
        id: reqId,
        error: `Network policy violation: URL not allowed: ${url}`,
      });
      return;
    }

    try {
      const response = await fetch(url, options);
      const body = await response.arrayBuffer();

      // Convert headers to plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      this.postToWorker({
        type: "fetch-response",
        id: reqId,
        response: {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers,
          body: encodeBase64(new Uint8Array(body)),
        },
      });
    } catch (error) {
      this.postToWorker({
        type: "fetch-response",
        id: reqId,
        error: String(error),
      });
    }
  }

  /**
   * Check if URL is allowed by network policy
   */
  private isUrlAllowed(
    url: string,
    policy: { allow?: string[]; block?: string[] }
  ): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;

      // Check block list first
      if (policy.block) {
        for (const pattern of policy.block) {
          if (this.matchesPattern(hostname, pattern)) {
            return false;
          }
        }
      }

      // Check allow list
      if (policy.allow && policy.allow.length > 0) {
        for (const pattern of policy.allow) {
          if (this.matchesPattern(hostname, pattern)) {
            return true;
          }
        }
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Simple glob pattern matching
   */
  private matchesPattern(hostname: string, pattern: string): boolean {
    const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(hostname);
  }

  // ============================================================================
  // MCP Proxy Handler
  // ============================================================================

  private async handleMcpCall(
    reqId: string,
    execId: string,
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<void> {
    const pending = this.pendingRequests.get(execId);
    const mcpCallTool = pending?.options?.mcpCallTool;

    if (!mcpCallTool) {
      this.postToWorker({
        type: "mcp-call-response",
        id: reqId,
        error: "MCP call tool not available",
      });
      return;
    }

    try {
      const result = await mcpCallTool(serverName, toolName, args);
      this.postToWorker({
        type: "mcp-call-response",
        id: reqId,
        result,
      });
    } catch (error) {
      this.postToWorker({
        type: "mcp-call-response",
        id: reqId,
        error: String(error),
      });
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Serialize execution options for worker
   */
  private serializeOptions(options?: ExecuteOptions): SerializedExecuteOptions {
    if (!options) return {};

    return {
      limits: options.limits,
      env: options.env,
      entryPath: options.entryPath,
      hasVfs: !!options.vfs,
      network: options.network,
      mcpConfigs: options.mcpConfigs,
      hasMcpCallTool: !!options.mcpCallTool,
    };
  }

  /**
   * Log message if verbose
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(`[${this.name}] ${message}`);
    }
  }
}

/**
 * Create a Browser QuickJS execution backend
 *
 * @param options Backend options (workerUrl or workerCode required)
 * @returns Initialized backend
 */
export async function createQuickJSBrowserBackend(
  options?: QuickJSBrowserOptions
): Promise<QuickJSBrowserBackend> {
  const backend = new QuickJSBrowserBackend(options);
  await backend.initialize();
  return backend;
}
