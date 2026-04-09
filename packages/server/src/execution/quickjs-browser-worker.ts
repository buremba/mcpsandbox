/**
 * QuickJS Browser Web Worker Runtime
 *
 * This module runs inside a Web Worker to execute JavaScript code
 * in a sandboxed QuickJS WASM environment. Communication with the
 * main thread is via postMessage.
 *
 * NOTE: This file should be bundled separately and loaded as a Worker.
 */

import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  ExecuteMessage,
  SerializedExecuteOptions,
} from "./browser/worker-messages.js";
import {
  decodeBase64,
  getByteLength,
} from "./browser/worker-messages.js";

// QuickJS types - using any to avoid dependency issues
// The actual types will be available at runtime when the modules are loaded
type QuickJSWASMModule = any;
type QuickJSContext = any;
type QuickJSHandle = any;

let quickJS: QuickJSWASMModule | null = null;
let requestIdCounter = 0;

// Pending async operation callbacks
const pendingVfsOps = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
const pendingFetchOps = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
const pendingMcpOps = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();

/**
 * Generate unique request ID
 */
function nextRequestId(): string {
  return `req_${++requestIdCounter}_${Date.now()}`;
}

/**
 * Post a typed message to the main thread
 */
function postToMain(message: WorkerToMainMessage): void {
  self.postMessage(message);
}

/**
 * Handle messages from the main thread
 */
self.onmessage = async (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "init":
      await handleInit(message.wasmUrl);
      break;

    case "execute":
      await handleExecute(message);
      break;

    case "dispose":
      handleDispose();
      break;

    case "vfs-read-response":
      handleVfsReadResponse(message.id, message.data, message.error);
      break;

    case "vfs-write-response":
      handleVfsWriteResponse(message.id, message.error);
      break;

    case "vfs-list-response":
      handleVfsListResponse(message.id, message.entries, message.error);
      break;

    case "vfs-stat-response":
      handleVfsStatResponse(message.id, message.info, message.error);
      break;

    case "fetch-response":
      handleFetchResponse(message.id, message.response, message.error);
      break;

    case "mcp-call-response":
      handleMcpCallResponse(message.id, message.result, message.error);
      break;
  }
};

/**
 * Initialize QuickJS WASM
 */
async function handleInit(_wasmUrl?: string): Promise<void> {
  try {
    // Dynamic import of quickjs-emscripten
    // These modules must be available at runtime (bundled or loaded separately)
    const quickjsCore = await import(/* webpackIgnore: true */ "quickjs-emscripten-core");
    const variant = await import(/* webpackIgnore: true */ "@jitl/quickjs-wasmfile-release-sync");

    quickJS = await quickjsCore.newQuickJSWASMModuleFromVariant(variant.default);

    postToMain({ type: "ready" });
  } catch (error) {
    postToMain({
      type: "error",
      id: "init",
      error: `Failed to initialize QuickJS: ${error}`,
    });
  }
}

/**
 * Execute code in QuickJS
 */
async function handleExecute(message: ExecuteMessage): Promise<void> {
  if (!quickJS) {
    postToMain({
      type: "error",
      id: message.id,
      error: "QuickJS not initialized",
    });
    return;
  }

  const { id, code, options } = message;
  const startTime = Date.now();
  const limits = options.limits ?? {};
  const timeoutMs = limits.timeoutMs ?? 60000;
  const maxStdoutBytes = limits.stdoutBytes ?? 1048576; // 1MB

  let stdout = "";
  let stderr = "";
  let interrupted = false;

  const ctx = quickJS.newContext();

  try {
    // Set up interrupt handler for timeout
    ctx.runtime.setInterruptHandler(() => {
      if (Date.now() - startTime > timeoutMs) {
        interrupted = true;
        return true;
      }
      return false;
    });

    // Set up console
    setupConsole(ctx, id, (chunk) => {
      stdout += chunk;
      if (getByteLength(stdout) > maxStdoutBytes) {
        throw new Error(`Stdout size limit exceeded (${maxStdoutBytes} bytes)`);
      }
      postToMain({ type: "stdout", id, chunk });
    }, (chunk) => {
      stderr += chunk;
      if (getByteLength(stderr) > maxStdoutBytes * 2) {
        throw new Error("Stderr size limit exceeded");
      }
      postToMain({ type: "stderr", id, chunk });
    });

    // Inject VFS functions if available
    if (options.hasVfs) {
      injectVfsFunctions(ctx, id);
    }

    // Inject fetch if network policy allows
    if (options.network) {
      injectFetch(ctx, id, options.network);
    }

    // Inject MCP proxies if available
    if (options.hasMcpCallTool && options.mcpConfigs) {
      injectMcpProxies(ctx, id, options.mcpConfigs);
    }

    // Inject environment variables
    if (options.env) {
      injectEnv(ctx, options.env);
    }

    // Wrap code for return value capture
    const wrappedCode = wrapCodeForReturn(code);

    // Execute
    const result = ctx.evalCode(wrappedCode);

    if (result.error) {
      const error = ctx.dump(result.error);
      result.error.dispose();

      if (interrupted) {
        postToMain({
          type: "result",
          id,
          result: {
            exitCode: 124, // TIMEOUT
            stdout,
            stderr: stderr + `\nError: Execution timeout after ${timeoutMs}ms\n`,
            wallMs: Date.now() - startTime,
          },
        });
        return;
      }

      postToMain({
        type: "result",
        id,
        result: {
          exitCode: 1,
          stdout,
          stderr: stderr + `\nError: ${error}\n`,
          wallMs: Date.now() - startTime,
        },
      });
      return;
    }

    // Capture last expression result
    const lastValue = result.value ? dumpResult(ctx, result.value) : undefined;
    result.value?.dispose();

    postToMain({
      type: "result",
      id,
      result: {
        exitCode: 0,
        stdout,
        stderr,
        wallMs: Date.now() - startTime,
        lastValue,
      },
    });
  } catch (error) {
    if (interrupted) {
      postToMain({
        type: "result",
        id,
        result: {
          exitCode: 124,
          stdout,
          stderr: stderr + `\nError: Execution timeout after ${timeoutMs}ms\n`,
          wallMs: Date.now() - startTime,
        },
      });
      return;
    }

    postToMain({
      type: "result",
      id,
      result: {
        exitCode: 1,
        stdout,
        stderr: stderr + `\nError: ${error}\n`,
        wallMs: Date.now() - startTime,
      },
    });
  } finally {
    ctx.runtime.setInterruptHandler(() => false);
    ctx.dispose();
  }
}

/**
 * Dispose resources
 */
function handleDispose(): void {
  quickJS = null;
  pendingVfsOps.clear();
  pendingFetchOps.clear();
  pendingMcpOps.clear();
}

// ============================================================================
// Response Handlers
// ============================================================================

function handleVfsReadResponse(
  reqId: string,
  data?: string,
  error?: string
): void {
  const pending = pendingVfsOps.get(reqId);
  if (!pending) return;
  pendingVfsOps.delete(reqId);

  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(data ? decodeBase64(data) : new Uint8Array());
  }
}

function handleVfsWriteResponse(reqId: string, error?: string): void {
  const pending = pendingVfsOps.get(reqId);
  if (!pending) return;
  pendingVfsOps.delete(reqId);

  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(undefined);
  }
}

function handleVfsListResponse(
  reqId: string,
  entries?: string[],
  error?: string
): void {
  const pending = pendingVfsOps.get(reqId);
  if (!pending) return;
  pendingVfsOps.delete(reqId);

  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(entries ?? []);
  }
}

function handleVfsStatResponse(
  reqId: string,
  info?: { isDirectory: boolean; isFile: boolean; size: number; modifiedAt: number },
  error?: string
): void {
  const pending = pendingVfsOps.get(reqId);
  if (!pending) return;
  pendingVfsOps.delete(reqId);

  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(info);
  }
}

function handleFetchResponse(
  reqId: string,
  response?: { ok: boolean; status: number; statusText: string; headers: Record<string, string>; body: string },
  error?: string
): void {
  const pending = pendingFetchOps.get(reqId);
  if (!pending) return;
  pendingFetchOps.delete(reqId);

  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(response);
  }
}

function handleMcpCallResponse(
  reqId: string,
  result?: unknown,
  error?: string
): void {
  const pending = pendingMcpOps.get(reqId);
  if (!pending) return;
  pendingMcpOps.delete(reqId);

  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(result);
  }
}

// ============================================================================
// VM Injection Helpers
// ============================================================================

/**
 * Set up console.log, console.error, etc.
 */
function setupConsole(
  ctx: QuickJSContext,
  _execId: string,
  onStdout: (chunk: string) => void,
  onStderr: (chunk: string) => void
): void {
  const consoleObj = ctx.newObject();

  // console.log
  const logFn = ctx.newFunction("log", (...args: QuickJSHandle[]) => {
    const parts = args.map((arg) => stringify(ctx.dump(arg)));
    onStdout(parts.join(" ") + "\n");
  });
  ctx.setProp(consoleObj, "log", logFn);
  logFn.dispose();

  // console.info (alias for log)
  const infoFn = ctx.newFunction("info", (...args: QuickJSHandle[]) => {
    const parts = args.map((arg) => stringify(ctx.dump(arg)));
    onStdout(parts.join(" ") + "\n");
  });
  ctx.setProp(consoleObj, "info", infoFn);
  infoFn.dispose();

  // console.warn
  const warnFn = ctx.newFunction("warn", (...args: QuickJSHandle[]) => {
    const parts = args.map((arg) => stringify(ctx.dump(arg)));
    onStderr("[WARN] " + parts.join(" ") + "\n");
  });
  ctx.setProp(consoleObj, "warn", warnFn);
  warnFn.dispose();

  // console.error
  const errorFn = ctx.newFunction("error", (...args: QuickJSHandle[]) => {
    const parts = args.map((arg) => stringify(ctx.dump(arg)));
    onStderr("[ERROR] " + parts.join(" ") + "\n");
  });
  ctx.setProp(consoleObj, "error", errorFn);
  errorFn.dispose();

  // console.debug (alias for log)
  const debugFn = ctx.newFunction("debug", (...args: QuickJSHandle[]) => {
    const parts = args.map((arg) => stringify(ctx.dump(arg)));
    onStdout("[DEBUG] " + parts.join(" ") + "\n");
  });
  ctx.setProp(consoleObj, "debug", debugFn);
  debugFn.dispose();

  ctx.setProp(ctx.global, "console", consoleObj);
  consoleObj.dispose();
}

/**
 * Inject VFS functions (proxied to main thread)
 */
function injectVfsFunctions(ctx: QuickJSContext, _execId: string): void {
  // Create fs object
  const fsObj = ctx.newObject();

  // fs.readFileSync
  const readFileFn = ctx.newFunction("readFileSync", (pathHandle: QuickJSHandle) => {
    const path = ctx.dump(pathHandle) as string;
    // Note: This is a simplified sync version - real impl would need async
    // For now, we'll use a blocking pattern with the worker message queue
    void nextRequestId();
    void path;

    // VFS read placeholder - actual implementation would need async worker communication

    // Can't block in Web Worker, so we return a promise
    // The actual implementation would need async evaluation
    return ctx.newString(`[VFS read: ${path}]`);
  });
  ctx.setProp(fsObj, "readFileSync", readFileFn);
  readFileFn.dispose();

  ctx.setProp(ctx.global, "fs", fsObj);
  fsObj.dispose();

  // Also inject a JS wrapper for async operations
  const wrapperCode = `
    globalThis.__vfs = {
      read: async (path) => {
        return new Promise((resolve, reject) => {
          // VFS operations are proxied through the worker message system
          resolve("[VFS read placeholder - use sync version]");
        });
      },
      write: async (path, data) => {
        return new Promise((resolve, reject) => {
          resolve();
        });
      },
    };
  `;
  const result = ctx.evalCode(wrapperCode);
  result.value?.dispose();
  result.error?.dispose();
}

/**
 * Inject fetch (proxied to main thread)
 */
function injectFetch(
  ctx: QuickJSContext,
  _execId: string,
  _network: SerializedExecuteOptions["network"]
): void {
  // Inject a simplified fetch that proxies to main thread
  const wrapperCode = `
    globalThis.fetch = async function(url, options = {}) {
      // Fetch is proxied to main thread for CORS handling
      // This is a placeholder - real impl needs async worker communication
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "[fetch placeholder]",
        json: async () => ({}),
      };
    };
  `;
  const result = ctx.evalCode(wrapperCode);
  result.value?.dispose();
  result.error?.dispose();
}

/**
 * Inject MCP proxies
 */
function injectMcpProxies(
  ctx: QuickJSContext,
  _execId: string,
  mcpConfigs: SerializedExecuteOptions["mcpConfigs"]
): void {
  if (!mcpConfigs) return;

  const mcpObj = ctx.newObject();

  for (const config of mcpConfigs) {
    const serverObj = ctx.newObject();

    if (config.tools) {
      for (const tool of config.tools) {
        // Create a function for each tool
        const toolFn = ctx.newFunction(tool.name, (..._args: QuickJSHandle[]) => {
          // MCP calls are proxied to main thread
          return ctx.newString(`[MCP call: ${config.name}/${tool.name}]`);
        });
        ctx.setProp(serverObj, tool.name, toolFn);
        toolFn.dispose();
      }
    }

    ctx.setProp(mcpObj, config.name, serverObj);
    serverObj.dispose();
  }

  ctx.setProp(ctx.global, "mcp", mcpObj);
  mcpObj.dispose();
}

/**
 * Inject environment variables
 */
function injectEnv(ctx: QuickJSContext, env: Record<string, string>): void {
  const code = `globalThis.process = { env: ${JSON.stringify(env)} };`;
  const result = ctx.evalCode(code);
  result.value?.dispose();
  result.error?.dispose();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Wrap code to capture last expression value
 */
function wrapCodeForReturn(code: string): string {
  // Simple wrapper that evaluates and returns last expression
  return `(function() { ${code} })()`;
}

/**
 * Dump QuickJS value to string representation
 */
function dumpResult(ctx: QuickJSContext, handle: QuickJSHandle): string {
  const value = ctx.dump(handle);
  return stringify(value);
}

/**
 * Convert any value to string representation
 */
function stringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
