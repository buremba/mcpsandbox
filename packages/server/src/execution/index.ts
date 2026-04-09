/**
 * Execution module exports
 *
 * Provides unified execution backends for:
 * - QuickJS WASM (Node.js, Workers, Browser)
 * - Container (Docker, Cloudflare Containers)
 */

// Core interface
export type {
  ExecutionBackend,
  ExecutionCapabilities,
  ExecuteOptions,
  ExecuteResult,
  NetworkPolicy,
  LimitsPolicy,
  ExecutionBackendFactory,
} from "./interface.js";

export { EXIT_CODES } from "./interface.js";

// Base class
export { QuickJSBase } from "./quickjs-base.js";
export type { QuickJSBaseOptions, QuickJSVM, QuickJSHandle } from "./quickjs-base.js";

// Node.js backend
export { QuickJSNodeBackend, createQuickJSNodeBackend } from "./quickjs-node.js";

// Cloudflare Workers backend
export { QuickJSWorkerBackend, createQuickJSWorkerBackend } from "./quickjs-worker.js";

// Browser backend
export {
  QuickJSBrowserBackend,
  createQuickJSBrowserBackend,
} from "./quickjs-browser.js";
export type { QuickJSBrowserOptions } from "./quickjs-browser.js";

// Browser worker message types
export type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  SerializedExecuteOptions,
} from "./browser/worker-messages.js";
export {
  encodeBase64,
  decodeBase64,
  getByteLength,
} from "./browser/worker-messages.js";

// Container backend
export {
  ContainerBackend,
  createContainerBackend,
} from "./container.js";
export type {
  ContainerRuntime,
  ContainerBackendOptions,
  ContainerRequest,
  ContainerResponse,
  ContainerExecutor,
} from "./container.js";

/**
 * Detect runtime and create appropriate execution backend
 */
export async function createExecutionBackend(): Promise<import("./interface.js").ExecutionBackend> {
  // Check for Cloudflare Workers (has caches but no navigator)
  if (
    typeof globalThis !== "undefined" &&
    "caches" in globalThis &&
    !("navigator" in globalThis)
  ) {
    const { createQuickJSWorkerBackend } = await import("./quickjs-worker.js");
    return createQuickJSWorkerBackend();
  }

  // Check for Node.js
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    const { createQuickJSNodeBackend } = await import("./quickjs-node.js");
    return createQuickJSNodeBackend();
  }

  // Check for Browser (has navigator and window)
  if (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined"
  ) {
    // Browser backend requires workerUrl or workerCode to be provided
    // Cannot auto-create without bundled worker code
    throw new Error(
      "Browser execution backend requires workerUrl or workerCode. " +
      "Use createQuickJSBrowserBackend() directly with appropriate options."
    );
  }

  throw new Error("Unknown execution environment");
}
