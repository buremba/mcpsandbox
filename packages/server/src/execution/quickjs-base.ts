/**
 * Base QuickJS execution backend with shared logic
 *
 * This module provides the common implementation used by:
 * - QuickJSNodeBackend (Node.js)
 * - QuickJSWorkerBackend (Cloudflare Workers)
 * - QuickJSBrowserBackend (Browser Web Worker)
 */

import type {
  ExecutionBackend,
  ExecutionCapabilities,
  ExecuteOptions,
  ExecuteResult,
  NetworkPolicy,
} from "./interface.js";
import { EXIT_CODES } from "./interface.js";
import type { VFSBackend } from "../vfs/interface.js";
import {
  setupConsole,
  wrapCodeForReturn,
  dumpResult,
  injectVFSFunctions,
  injectMCPProxies,
} from "@onemcp/shared";
import { getByteLength } from "./browser/worker-messages.js";

/**
 * QuickJS VM context interface
 * Matches quickjs-emscripten's QuickJSContext
 */
export interface QuickJSVM {
  newFunction(name: string, fn: (...args: unknown[]) => unknown): QuickJSHandle;
  newString(value: string): QuickJSHandle;
  newNumber(value: number): QuickJSHandle;
  newObject(): QuickJSHandle;
  newPromise(executor: (resolve: (value: QuickJSHandle) => void, reject: (value: QuickJSHandle) => void) => void): QuickJSHandle;
  setProp(target: QuickJSHandle, key: string, value: QuickJSHandle): void;
  getProp(target: QuickJSHandle, key: string): QuickJSHandle;
  global: QuickJSHandle;
  dump(handle: QuickJSHandle): unknown;
  evalCode(code: string): { error?: QuickJSHandle; value?: QuickJSHandle };
  runtime: {
    setInterruptHandler(handler: () => boolean): void;
  };
  dispose(): void;
}

export interface QuickJSHandle {
  dispose(): void;
}

/**
 * Options for the base QuickJS backend
 */
export interface QuickJSBaseOptions {
  /** Optional name for logging/debugging */
  name?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Abstract base class for QuickJS execution backends
 */
export abstract class QuickJSBase implements ExecutionBackend {
  readonly name: string;
  protected verbose: boolean;
  protected initialized: boolean = false;

  abstract readonly capabilities: ExecutionCapabilities;

  constructor(options?: QuickJSBaseOptions) {
    this.name = options?.name ?? "quickjs";
    this.verbose = options?.verbose ?? false;
  }

  /**
   * Create a new QuickJS VM context
   * Must be implemented by subclasses
   */
  protected abstract createVM(): Promise<QuickJSVM>;

  /**
   * Perform platform-specific initialization
   * Override in subclasses if needed
   */
  protected abstract doInitialize(): Promise<void>;

  /**
   * Perform platform-specific cleanup
   * Override in subclasses if needed
   */
  protected abstract doDispose(): Promise<void>;

  /**
   * Perform platform-specific fetch (for network policy)
   * Override in subclasses to provide native fetch
   */
  protected abstract doFetch(
    url: string,
    options: RequestInit,
    policy: NetworkPolicy
  ): Promise<Response>;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.doInitialize();
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    if (!this.initialized) return;
    await this.doDispose();
    this.initialized = false;
  }

  isReady(): boolean {
    return this.initialized;
  }

  async execute(code: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const limits = options?.limits ?? {};
    const timeoutMs = limits.timeoutMs ?? 60000;
    const memMb = limits.memMb ?? 256;
    const maxStdoutBytes = limits.stdoutBytes ?? 1048576; // 1MB

    let stdout = "";
    let stderr = "";

    const onStdout = (chunk: string) => {
      stdout += chunk;
      if (getByteLength(stdout) > maxStdoutBytes) {
        throw new Error(`Stdout size limit exceeded (${maxStdoutBytes} bytes)`);
      }
    };

    const onStderr = (chunk: string) => {
      stderr += chunk;
      // Allow stderr to grow slightly more for error messages
      if (getByteLength(stderr) > maxStdoutBytes * 2) {
        throw new Error("Stderr size limit exceeded");
      }
    };

    const vm = await this.createVM();
    let interrupted = false;
    let memoryExceeded = false;

    try {
      // Set up interrupt handler for timeout
      vm.runtime.setInterruptHandler(() => {
        if (Date.now() - startTime > timeoutMs) {
          interrupted = true;
          return true;
        }
        return false;
      });

      // Set up console
      setupConsole(vm as unknown as Parameters<typeof setupConsole>[0], { onStdout, onStderr });

      // Inject VFS functions if provided
      if (options?.vfs) {
        await this.injectVFS(vm, options.vfs, onStderr);
      }

      // Inject MCP proxies if provided
      if (options?.mcpCallTool && options?.mcpConfigs) {
        injectMCPProxies({
          vm,
          mcpConfigs: options.mcpConfigs as Parameters<typeof injectMCPProxies>[0]["mcpConfigs"],
          callTool: options.mcpCallTool,
        });
      }

      // Inject guarded fetch if network policy is provided
      if (options?.network && this.capabilities.network) {
        await this.injectGuardedFetch(vm, options.network, onStderr);
      }

      // Inject environment variables
      if (options?.env) {
        this.injectEnv(vm, options.env);
      }

      // Wrap code for return value capture
      const codeToEval = wrapCodeForReturn(code);

      // Execute
      const result = vm.evalCode(codeToEval);

      if (result.error) {
        const error = vm.dump(result.error);
        result.error.dispose();

        if (interrupted) {
          onStderr(`Error: Execution timeout after ${timeoutMs}ms\n`);
          return this.buildResult(EXIT_CODES.TIMEOUT, stdout, stderr, startTime);
        }

        if (memoryExceeded) {
          onStderr(`Error: Memory limit exceeded (${memMb}MB limit)\n`);
          return this.buildResult(EXIT_CODES.OUT_OF_MEMORY, stdout, stderr, startTime);
        }

        onStderr(`Error: ${error}\n`);
        return this.buildResult(EXIT_CODES.ERROR, stdout, stderr, startTime);
      }

      // Capture last expression result
      const lastValue = result.value
        ? dumpResult(vm as unknown as Parameters<typeof dumpResult>[0], result.value as Parameters<typeof dumpResult>[1])
        : undefined;
      result.value?.dispose();

      return this.buildResult(EXIT_CODES.SUCCESS, stdout, stderr, startTime, lastValue);
    } catch (error) {
      if (interrupted) {
        onStderr(`Error: Execution timeout after ${timeoutMs}ms\n`);
        return this.buildResult(EXIT_CODES.TIMEOUT, stdout, stderr, startTime);
      }
      if (memoryExceeded) {
        onStderr(`Error: Memory limit exceeded (${memMb}MB limit)\n`);
        return this.buildResult(EXIT_CODES.OUT_OF_MEMORY, stdout, stderr, startTime);
      }
      onStderr(`Error: ${error}\n`);
      return this.buildResult(EXIT_CODES.ERROR, stdout, stderr, startTime);
    } finally {
      vm.runtime.setInterruptHandler(() => false);
      vm.dispose();
    }
  }

  async executeFromVFS(
    options: ExecuteOptions & { vfs: VFSBackend; entryPath: string }
  ): Promise<ExecuteResult> {
    // Read entry file from VFS
    const entryData = await options.vfs.read(options.entryPath);
    const code = new TextDecoder().decode(entryData);

    return this.execute(code, options);
  }

  /**
   * Inject VFS functions into the VM
   */
  protected async injectVFS(
    vm: QuickJSVM,
    vfs: VFSBackend,
    onError: (msg: string) => void
  ): Promise<void> {
    // Use the shared VFS injector
    injectVFSFunctions(
      vm as unknown as Parameters<typeof injectVFSFunctions>[0],
      {
        readFile: async (path: string) => {
          const data = await vfs.read(path);
          return new TextDecoder().decode(data);
        },
        writeFile: async (path: string, data: string) => {
          await vfs.write(path, new TextEncoder().encode(data));
        },
        readdir: async (path: string) => {
          const entries = await vfs.list(path);
          return entries.map(name => ({ name, type: 'file' as const }));
        },
        stat: async (path: string) => {
          const info = await vfs.stat(path);
          return {
            type: info.isDirectory ? "directory" as const : "file" as const,
            isDirectory: info.isDirectory,
            isFile: info.isFile,
            size: info.size,
            mtime: new Date(info.modifiedAt),
          };
        },
        exists: async (path: string) => {
          try {
            await vfs.stat(path);
            return true;
          } catch {
            return false;
          }
        },
        mkdir: async (path: string) => vfs.mkdir(path),
        unlink: async (path: string) => vfs.delete(path),
        rmdir: async (path: string) => vfs.rmdir(path),
        appendFile: async (path: string, data: string) => {
          // Read existing content and append
          let existing = "";
          try {
            const existingData = await vfs.read(path);
            existing = new TextDecoder().decode(existingData);
          } catch {
            // File doesn't exist, start fresh
          }
          await vfs.write(path, new TextEncoder().encode(existing + data));
        },
        realpath: async (path: string) => {
          // VFS doesn't support symlinks, just normalize the path
          return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
        },
      },
      { onError }
    );
  }

  /**
   * Inject guarded fetch with network policy
   */
  protected async injectGuardedFetch(
    vm: QuickJSVM,
    policy: NetworkPolicy,
    onError: (msg: string) => void
  ): Promise<void> {
    const self = this;

    // Create native fetch wrapper
    const fetchHandle = vm.newFunction(
      "__native_fetch",
      (...args: unknown[]) => {
        const urlHandle = args[0] as QuickJSHandle;
        const optionsHandle = args[1] as QuickJSHandle | undefined;
        const url = vm.dump(urlHandle) as string;
        const optionsStr = optionsHandle ? (vm.dump(optionsHandle) as string) : "{}";
        const options = JSON.parse(optionsStr || "{}");

        // Check policy
        if (!self.isUrlAllowed(url, policy)) {
          return vm.newPromise((_resolve, reject) => {
            reject(vm.newString(`Network policy violation: URL not allowed: ${url}`));
          });
        }

        // Execute fetch
        const fetchPromise = self.doFetch(url, options, policy);

        return vm.newPromise((resolve, reject) => {
          fetchPromise.then(
            (response) => {
              const responseObj = vm.newObject();
              vm.setProp(responseObj, "ok", vm.newNumber(response.ok ? 1 : 0));
              vm.setProp(responseObj, "status", vm.newNumber(response.status));
              vm.setProp(responseObj, "statusText", vm.newString(response.statusText));

              // Add text() method
              const textHandle = vm.newFunction("text", () => {
                return vm.newPromise((resolveText, rejectText) => {
                  response.text().then(
                    (text) => resolveText(vm.newString(text)),
                    (err) => rejectText(vm.newString(String(err)))
                  );
                });
              });
              vm.setProp(responseObj, "text", textHandle);
              textHandle.dispose();

              // Add json() method
              const jsonHandle = vm.newFunction("json", () => {
                return vm.newPromise((resolveJson, rejectJson) => {
                  response.json().then(
                    (data) => resolveJson(vm.newString(JSON.stringify(data))),
                    (err) => rejectJson(vm.newString(String(err)))
                  );
                });
              });
              vm.setProp(responseObj, "json", jsonHandle);
              jsonHandle.dispose();

              resolve(responseObj);
            },
            (error) => {
              reject(vm.newString(String(error)));
            }
          );
        });
      }
    );

    vm.setProp(vm.global, "__native_fetch", fetchHandle);
    fetchHandle.dispose();

    // Inject JavaScript wrapper
    const wrapperCode = `
      globalThis.fetch = async function(url, options = {}) {
        const response = await __native_fetch(url, JSON.stringify(options));
        const originalJson = response.json;
        response.json = async function() {
          const jsonStr = await originalJson.call(this);
          return JSON.parse(jsonStr);
        };
        return response;
      };
    `;

    const result = vm.evalCode(wrapperCode);
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      onError(`Warning: Failed to inject fetch wrapper: ${error}\n`);
    } else {
      result.value?.dispose();
    }
  }

  /**
   * Inject environment variables
   */
  protected injectEnv(vm: QuickJSVM, env: Record<string, string>): void {
    const envCode = `globalThis.process = { env: ${JSON.stringify(env)} };`;
    const result = vm.evalCode(envCode);
    if (result.error) {
      result.error.dispose();
    } else {
      result.value?.dispose();
    }
  }

  /**
   * Check if a URL is allowed by the network policy
   */
  protected isUrlAllowed(url: string, policy: NetworkPolicy): boolean {
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

      // Check allow list (if specified, only allowed domains are permitted)
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
   * Simple glob pattern matching for domain patterns
   */
  protected matchesPattern(hostname: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*");
    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(hostname);
  }

  /**
   * Build execution result
   */
  protected buildResult(
    exitCode: number,
    stdout: string,
    stderr: string,
    startTime: number,
    lastValue?: string
  ): ExecuteResult {
    return {
      exitCode,
      stdout,
      stderr,
      wallMs: Date.now() - startTime,
      lastValue,
    };
  }
}
