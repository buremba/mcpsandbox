/**
 * QuickJS runtime for Node.js server-side execution
 */

import { getQuickJS } from "quickjs-emscripten";
import type { Capsule, VirtualFilesystem, MCPServerConfig } from "@onemcp/shared";
import { setupConsole, wrapCodeForReturn, dumpResult, injectVFSFunctions } from "@onemcp/shared";
import type { MCPManager } from "../services/mcp-manager.js";
import { NetworkPolicyEnforcer } from "../policy/network.js";

export class QuickJSRuntime {
  constructor(
    private vfs?: VirtualFilesystem,
    private mcpManager?: MCPManager,
    private mcpConfigs?: MCPServerConfig[]
  ) {}

  async execute(
    code: string,
    capsule: Capsule,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void
  ): Promise<{ exitCode: number; lastValue?: string }> {
    const QuickJS = await getQuickJS();
    const vm = QuickJS.newContext();
    const timeoutMs = capsule.policy?.limits?.timeoutMs || 60000;
    const memMb = capsule.policy?.limits?.memMb || 256;
    const maxMemBytes = memMb * 1024 * 1024;

    // Set up interrupt handler for timeout and memory monitoring
    const startTime = Date.now();
    let interrupted = false;
    let memoryExceeded = false;
    vm.runtime.setInterruptHandler(() => {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        interrupted = true;
        return true; // Interrupt execution
      }

      // Check memory usage
      const heapUsed = process.memoryUsage().heapUsed;
      if (heapUsed > maxMemBytes) {
        memoryExceeded = true;
        return true; // Interrupt execution
      }

      return false; // Continue execution
    });

    try {
      // Set up console using shared utility
      setupConsole(vm as any, { onStdout, onStderr });

      // Inject VFS functions if available (using shared utility)
      if (this.vfs) {
        injectVFSFunctions(vm as any, this.vfs, { onError: onStderr });
      }

      // Inject MCP proxy functions if available
      if (this.mcpManager && this.mcpConfigs) {
        this.injectMCPProxies(vm);
      }

      // Inject guarded fetch with network policy enforcement
      if (capsule.policy?.network) {
        this.injectGuardedFetch(vm, capsule.policy.network, onStderr);
      }

      // Wrap code to capture the last expression value (using shared utility)
      const codeToEval = wrapCodeForReturn(code);

      const result = vm.evalCode(codeToEval);

      if (result.error) {
        const error = vm.dump(result.error);
        result.error.dispose();

        if (interrupted) {
          onStderr(`Error: Execution timeout after ${timeoutMs}ms\n`);
          return { exitCode: 124 }; // Timeout exit code
        }

        if (memoryExceeded) {
          const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
          onStderr(`Error: Memory limit exceeded (${memMb}MB limit, using ${heapMb}MB)\n`);
          return { exitCode: 137 }; // Memory limit exit code
        }

        onStderr(`Error: ${error}\n`);
        return { exitCode: 1 };
      }

      // Capture last expression result (using shared utility to handle objects)
      const lastValue = result.value ? dumpResult(vm as any, result.value) : undefined;
      result.value.dispose();

      return { exitCode: 0, lastValue };
    } catch (error) {
      if (interrupted) {
        onStderr(`Error: Execution timeout after ${timeoutMs}ms\n`);
        return { exitCode: 124 }; // Timeout exit code
      }
      if (memoryExceeded) {
        const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        onStderr(`Error: Memory limit exceeded (${memMb}MB limit, using ${heapMb}MB)\n`);
        return { exitCode: 137 }; // Memory limit exit code
      }
      onStderr(`Error: ${error}\n`);
      return { exitCode: 1 };
    } finally {
      vm.runtime.setInterruptHandler(() => false); // Clear handler
      vm.dispose();
    }
  }

  /**
   * Inject MCP proxy objects into QuickJS global scope
   *
   * Dynamically generates proxy objects based on mcpConfigs:
   * const result = await github.getUser({ username: 'foo' });
   * const issues = await github.listIssues({ repo: 'bar' });
   */
  private injectMCPProxies(vm: any) {
    const mcpManager = this.mcpManager!;
    const mcpConfigs = this.mcpConfigs!;

    // Create low-level __mcp_call function that bridges to MCPManager
    const mcpCallHandle = vm.newFunction("__mcp_call", (mcpNameHandle: any, methodHandle: any, paramsHandle: any) => {
      const mcpName = vm.dump(mcpNameHandle);
      const method = vm.dump(methodHandle);
      const params = JSON.parse(vm.dump(paramsHandle) || '{}');

      // Call MCPManager to proxy the request
      const promise = mcpManager.callTool(mcpName, method, params);

      return vm.newPromise((resolve: any, reject: any) => {
        promise.then(
          (result) => {
            // Return result as JSON string
            resolve(vm.newString(JSON.stringify(result)));
          },
          (error) => {
            reject(vm.newString(String(error)));
          }
        );
      });
    });

    vm.setProp(vm.global, "__mcp_call", mcpCallHandle);

    // Generate proxy code for each MCP server
    const proxyCode = mcpConfigs.map((mcpConfig) => {
      const mcpName = mcpConfig.name;

      return `
        // MCP proxy for '${mcpName}'
        globalThis.${mcpName} = new Proxy({}, {
          get: (target, method) => {
            return async function(params = {}) {
              const resultJson = await __mcp_call('${mcpName}', method, JSON.stringify(params));
              return JSON.parse(resultJson);
            };
          }
        });
      `;
    }).join('\n');

    // Execute the proxy generation code
    const result = vm.evalCode(proxyCode);
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(`Failed to inject MCP proxies: ${error}`);
    }
    result.value.dispose();

    // Clean up
    mcpCallHandle.dispose();
  }

  /**
   * Inject guarded fetch with network policy enforcement
   */
  private injectGuardedFetch(vm: any, networkPolicy: any, onStderr: (chunk: string) => void) {
    const enforcer = new NetworkPolicyEnforcer(networkPolicy);

    // Create the native fetch wrapper
    const fetchHandle = vm.newFunction("__native_fetch", (urlHandle: any, optionsHandle: any) => {
      const url = vm.dump(urlHandle);
      const options = optionsHandle ? JSON.parse(vm.dump(optionsHandle) || '{}') : {};

      // Pre-flight policy check
      const check = enforcer.canFetch(url);
      if (!check.allowed) {
        return vm.newPromise((_resolve: any, reject: any) => {
          reject(vm.newString(`Network policy violation: ${check.reason}`));
        });
      }

      // Execute fetch with policy enforcement
      const fetchPromise = this.guardedFetch(url, options, networkPolicy, onStderr);

      return vm.newPromise((resolve: any, reject: any) => {
        fetchPromise.then(
          (response) => {
            // Convert response to QuickJS object
            const responseObj = vm.newObject();
            vm.setProp(responseObj, "ok", vm.newNumber(response.ok ? 1 : 0));
            vm.setProp(responseObj, "status", vm.newNumber(response.status));
            vm.setProp(responseObj, "statusText", vm.newString(response.statusText));

            // Add text() method
            const textHandle = vm.newFunction("text", () => {
              return vm.newPromise((resolveText: any, rejectText: any) => {
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
              return vm.newPromise((resolveJson: any, rejectJson: any) => {
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
    });

    vm.setProp(vm.global, "__native_fetch", fetchHandle);
    fetchHandle.dispose();

    // Inject JavaScript wrapper for fetch
    const fetchWrapperCode = `
      globalThis.fetch = async function(url, options = {}) {
        const response = await __native_fetch(url, JSON.stringify(options));

        // Wrap response methods to parse JSON strings
        const originalJson = response.json;
        response.json = async function() {
          const jsonStr = await originalJson.call(this);
          return JSON.parse(jsonStr);
        };

        return response;
      };
    `;

    const wrapperResult = vm.evalCode(fetchWrapperCode);
    if (wrapperResult.error) {
      const error = vm.dump(wrapperResult.error);
      wrapperResult.error.dispose();
      onStderr(`Warning: Failed to inject fetch wrapper: ${error}\n`);
    } else {
      wrapperResult.value.dispose();
    }
  }

  /**
   * Execute guarded fetch with network policy enforcement
   */
  private async guardedFetch(
    url: string,
    options: RequestInit,
    networkPolicy: any,
    _onStderr: (chunk: string) => void
  ): Promise<Response> {
    const maxBodyBytes = networkPolicy.maxBodyBytes || 5 * 1024 * 1024; // 5MB default
    const maxRedirects = networkPolicy.maxRedirects || 5;

    // Execute fetch with manual redirect handling
    let redirectCount = 0;
    let currentUrl = url;

    while (redirectCount <= maxRedirects) {
      const response = await fetch(currentUrl, {
        ...options,
        redirect: 'manual',
      });

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect without Location header');
        }

        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error(`Too many redirects (max: ${maxRedirects})`);
        }

        // Validate redirect URL against policy
        const enforcer = new NetworkPolicyEnforcer(networkPolicy);
        const check = enforcer.canFetch(location);
        if (!check.allowed) {
          throw new Error(`Redirect blocked by policy: ${check.reason}`);
        }

        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      // Check response size
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > maxBodyBytes) {
        throw new Error(`Response too large: ${contentLength} bytes (max: ${maxBodyBytes})`);
      }

      return response;
    }

    throw new Error(`Maximum redirects exceeded: ${maxRedirects}`);
  }
}
