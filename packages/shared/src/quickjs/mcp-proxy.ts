/**
 * Shared MCP proxy injection logic for QuickJS runtimes
 */

import type { MCPServerConfig } from "../types/config.js";

export interface MCPProxyOptions {
    vm: any; // QuickJSContext
    mcpConfigs: MCPServerConfig[];
    /**
     * Function to handle the actual MCP call.
     * Should return a Promise that resolves to the result object.
     */
    callTool: (mcpName: string, method: string, params: any) => Promise<any>;
}

/**
 * Inject MCP proxy objects into QuickJS global scope
 *
 * Dynamically generates proxy objects based on mcpConfigs:
 * const result = await github.getUser({ username: 'foo' });
 */
export function injectMCPProxies({ vm, mcpConfigs, callTool }: MCPProxyOptions) {
    // Create low-level __mcp_call function that bridges to the handler
    const mcpCallHandle = vm.newFunction("__mcp_call", (mcpNameHandle: any, methodHandle: any, paramsHandle: any) => {
        const mcpName = vm.dump(mcpNameHandle);
        const method = vm.dump(methodHandle);
        const params = JSON.parse(vm.dump(paramsHandle) || '{}');

        // Call the handler
        const promise = callTool(mcpName, method, params);

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
