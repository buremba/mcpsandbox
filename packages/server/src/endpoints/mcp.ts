/**
 * MCP protocol endpoint (spec §2.1)
 */

import type { Context } from "hono";
import { nanoid } from "nanoid";
import type { RunJsParams, BackchannelEvent, RelayConfig } from "@onemcp/shared";
import { CapsuleBuilder } from "../capsule/builder.js";
import { NodeExecutor } from "../harness/executor.js";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join, relative, normalize } from "node:path";

/**
 * Validate that a file path is allowed according to the filesystem policy
 * @param filePath - The requested file path
 * @param allowedPaths - List of allowed path prefixes
 * @param operation - 'read' or 'write'
 * @returns Object with isAllowed flag and resolvedPath
 */
function validateFilePath(
  filePath: string,
  allowedPaths: string[],
  _operation: 'read' | 'write'
): { isAllowed: boolean; resolvedPath: string; error?: string } {
  try {
    // Resolve to absolute path
    const resolvedPath = resolve(process.cwd(), filePath);
    const normalizedPath = normalize(resolvedPath);

    // Check for path traversal attempts
    if (normalizedPath.includes('..')) {
      return {
        isAllowed: false,
        resolvedPath: normalizedPath,
        error: 'Path traversal detected'
      };
    }

    // Check against allowed paths
    const isAllowed = allowedPaths.some(allowedPath => {
      const normalizedAllowed = normalize(resolve(allowedPath));
      // Path must start with one of the allowed paths
      return normalizedPath.startsWith(normalizedAllowed);
    });

    if (!isAllowed) {
      return {
        isAllowed: false,
        resolvedPath: normalizedPath,
        error: `Access denied - path outside allowed directories: ${normalizedPath} not in ${allowedPaths.join(', ')}`
      };
    }

    return { isAllowed: true, resolvedPath: normalizedPath };
  } catch (error) {
    return {
      isAllowed: false,
      resolvedPath: '',
      error: `Path validation error: ${error}`
    };
  }
}

export function setupMcpEndpoint(
  app: any,
  capsuleBuilder: CapsuleBuilder,
  sessionManager: any,
  nodeExecutor: NodeExecutor,
  config: RelayConfig
) {
  app.post("/mcp", async (c: Context) => {
    try {
      const body = await c.req.json();

      // MCP JSON-RPC handling
      const { id, method, params } = body;

      // Handle MCP protocol methods
      if (method === "initialize") {
        // Create MCP session
        const { sessionId } = await sessionManager.createSession("mcp");

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "1mcp",
              version: "0.1.0",
              upstreamServers: config.mcps.map(m => m.name),
              policy: config.policy,
              notes: "Sandboxed JavaScript execution (QuickJS WASM + V8 Isolates) with upstream MCP proxy. Policy enforcement partially implemented - see SECURITY.md",
            },
            // Return session ID for subsequent requests
            sessionId,
          },
        });
      }

      if (method === "notifications/initialized") {
        // Client notification, no response needed
        return c.json({ jsonrpc: "2.0" });
      }

      if (method === "tools/list") {
        // Build the list of built-in tools
        const builtInTools = [
              {
                name: "run_js",
                description: `Execute JavaScript code in a sandboxed QuickJS WASM environment. Has access to upstream MCP servers: ${config.mcps.map(m => m.name).join(', ')}. Network policy allows: ${config.policy.network.allowedDomains.join(', ')}. Resource limits: timeout ${config.policy.limits.timeoutMs}ms, memory ${config.policy.limits.memMb}MB. Use QuickJS 'os' module for filesystem (starts empty). To access host files or call upstream MCPs, use HTTP fetch to /mcps-rpc endpoint.`,
                inputSchema: {
                  type: "object",
                  properties: {
                    code: {
                      type: "string",
                      description: "JavaScript code to execute",
                    },
                    stdin: {
                      type: "string",
                      description: "Standard input (optional)",
                    },
                    args: {
                      type: "array",
                      items: { type: "string" },
                      description: "Command-line arguments (optional)",
                    },
                    env: {
                      type: "object",
                      additionalProperties: { type: "string" },
                      description: "Environment variables (optional)",
                    },
                    cwd: {
                      type: "string",
                      description: "Working directory (optional)",
                    },
                    npm: {
                      type: "object",
                      properties: {
                        dependencies: {
                          type: "object",
                          additionalProperties: { type: "string" },
                          description: "NPM dependencies to install (e.g., {'lodash': '^4.17.21'})",
                        },
                      },
                      description: "NPM package configuration (optional)",
                    },
                  },
                  required: ["code"],
                },
              },
              {
                name: "read",
                description: `Read file contents from the workspace. Filesystem policy restricts access to: readonly=[${config.policy.filesystem.readonly.join(', ')}], writable=[${config.policy.filesystem.writable.join(', ')}]. Mounts: ${config.policy.filesystem.mounts?.map(m => `${m.source}→${m.target}`).join(', ') || 'none'}`,
                inputSchema: {
                  type: "object",
                  properties: {
                    path: {
                      type: "string",
                      description: "Path relative to workspace root (use paths from mounted directories)",
                    },
                  },
                  required: ["path"],
                },
              },
              {
                name: "write",
                description: `Write content to a file in writable workspace areas. Writable paths: [${config.policy.filesystem.writable.join(', ')}]`,
                inputSchema: {
                  type: "object",
                  properties: {
                    path: {
                      type: "string",
                      description: "Path relative to workspace root (must be in writable directory)",
                    },
                    content: {
                      type: "string",
                      description: "Content to write to the file",
                    },
                  },
                  required: ["path", "content"],
                },
              },
              {
                name: "search",
                description: `Search for files or content within the workspace. Search scope limited to mounted directories: ${config.policy.filesystem.mounts?.map(m => m.target).join(', ') || config.policy.filesystem.readonly.join(', ')}`,
                inputSchema: {
                  type: "object",
                  properties: {
                    path: {
                      type: "string",
                      description: "Directory path to search in (relative to workspace, defaults to workspace root)",
                    },
                    pattern: {
                      type: "string",
                      description: "Search pattern (glob for files or regex for content)",
                    },
                    type: {
                      type: "string",
                      enum: ["files", "content"],
                      description: "Search type: 'files' for filename matching, 'content' for text search",
                    },
                  },
                  required: ["pattern", "type"],
                },
              },
            ];

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: builtInTools,
          },
        });
      }

      if (method === "tools/call") {
        const { name: toolName, arguments: toolArgs } = params;

        if (toolName === "run_js") {
          const runParams = toolArgs as RunJsParams;

          // Build capsule
          const capsuleHash = await capsuleBuilder.buildJsCapsule(runParams);

          const hasBrowser = sessionManager.hasBrowserAttached();

          if (hasBrowser) {
            const sessionId = sessionManager.getAttachedSessionId()!;
            const runId = nanoid();

            // Get base URL for capsule endpoints
            const baseUrl = `${c.req.url.split("/mcp")[0]}`;

            // Send command to browser via SSE
            sessionManager.sendCommand(sessionId, {
              type: "capsule",
              capsule: {
                hash: capsuleHash,
                manifestUrl: `${baseUrl}/capsules/${capsuleHash}/capsule.json`,
                codeUrl: `${baseUrl}/capsules/${capsuleHash}/fs.code.zip`,
              },
              runId,
            });

            // Wait for completion (with timeout)
            const timeout = 60000; // 60 seconds
            const startTime = Date.now();

            while (Date.now() - startTime < timeout) {
              const results = sessionManager.getResults(sessionId, runId);
              const exitEvent = results.find(
                (r: BackchannelEvent) =>
                  r.event.type === "exit" || r.event.type === "error"
              );

              if (exitEvent) {
                sessionManager.clearResults(sessionId, runId);

                if (exitEvent.event.type === "error") {
                  return c.json({
                    success: false,
                    error: exitEvent.event.error,
                  });
                }

                // Collect stdout
                const stdoutEvents = results.filter(
                  (r: BackchannelEvent) => r.event.type === "stdout"
                );
                const output = stdoutEvents
                  .map((e: BackchannelEvent) =>
                    Buffer.from(
                      (e.event as any).chunk,
                      "base64"
                    ).toString()
                  )
                  .join("");

                return c.json({
                  success: true,
                  output,
                  exitCode: (exitEvent.event as any).exitCode,
                });
              }

              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            return c.json({
              success: false,
              error: "Execution timeout",
            });
          } else {
            // Use Node harness
            try {
              const result = await nodeExecutor.executeCapsule(capsuleHash);
              // Combine stdout and stderr for output
              const output = result.exitCode !== 0
                ? (result.stdout + result.stderr)
                : result.stdout;

              const response: any = {
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: output || "",
                    },
                  ],
                  isError: result.exitCode !== 0,
                },
              };

              // Add lastValue if present
              if (result.lastValue !== undefined) {
                response.result.lastValue = result.lastValue;
              }

              return c.json(response);
            } catch (error) {
              return c.json({
                jsonrpc: "2.0",
                id,
                error: {
                  code: -32603,
                  message: String(error),
                },
              });
            }
          }
        } else if (toolName === "read") {
          // Read file tool
          try {
            const { path: filePath } = toolArgs as { path: string };

            // Validate path against readonly policy
            const validation = validateFilePath(
              filePath,
              config.policy.filesystem.readonly,
              'read'
            );

            if (!validation.isAllowed) {
              return c.json({
                jsonrpc: "2.0",
                id,
                error: {
                  code: -32603,
                  message: validation.error || 'Access denied',
                },
              });
            }

            const content = await readFile(validation.resolvedPath, "utf-8");

            return c.json({
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: content,
                  },
                ],
              },
            });
          } catch (error) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32603,
                message: `Failed to read file: ${error}`,
              },
            });
          }
        } else if (toolName === "write") {
          // Write file tool
          try {
            const { path: filePath, content } = toolArgs as { path: string; content: string };

            // Validate path against writable policy
            const validation = validateFilePath(
              filePath,
              config.policy.filesystem.writable,
              'write'
            );

            if (!validation.isAllowed) {
              return c.json({
                jsonrpc: "2.0",
                id,
                error: {
                  code: -32603,
                  message: validation.error || 'Access denied',
                },
              });
            }

            await writeFile(validation.resolvedPath, content, "utf-8");

            return c.json({
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `Successfully wrote to ${filePath}`,
                  },
                ],
              },
            });
          } catch (error) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32603,
                message: `Failed to write file: ${error}`,
              },
            });
          }
        } else if (toolName === "search") {
          // Search tool
          try {
            const { path: searchPath, pattern, type } = toolArgs as {
              path?: string;
              pattern: string;
              type: "files" | "content"
            };
            const basePath = searchPath ? resolve(process.cwd(), searchPath) : process.cwd();

            if (type === "files") {
              // File search using glob-like pattern
              const matches: string[] = [];

              // Convert glob pattern to regex
              const globToRegex = (glob: string): RegExp => {
                const escaped = glob
                  .replace(/\./g, '\\.')
                  .replace(/\*/g, '.*')
                  .replace(/\?/g, '.');
                return new RegExp(`^${escaped}$`);
              };

              const regex = globToRegex(pattern);

              // Helper function to search files recursively
              async function searchFiles(dir: string) {
                try {
                  const entries = await readdir(dir, { withFileTypes: true });

                  for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    const relativePath = relative(basePath, fullPath);

                    // Skip node_modules and hidden directories
                    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
                      continue;
                    }

                    if (regex.test(entry.name) || regex.test(relativePath)) {
                      matches.push(fullPath);
                    }

                    if (entry.isDirectory()) {
                      await searchFiles(fullPath);
                    }
                  }
                } catch (err) {
                  // Skip directories we can't read
                }
              }

              await searchFiles(basePath);

              const results = matches.join("\n");

              return c.json({
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: results || "No matches found",
                    },
                  ],
                },
              });
            } else {
              // Content search using regex
              const matches: string[] = [];

              // Helper function to search files recursively
              async function searchDirectory(dir: string) {
                const entries = await readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                  const fullPath = join(dir, entry.name);

                  // Skip node_modules and hidden directories
                  if (entry.name === "node_modules" || entry.name.startsWith(".")) {
                    continue;
                  }

                  if (entry.isDirectory()) {
                    await searchDirectory(fullPath);
                  } else if (entry.isFile()) {
                    try {
                      const content = await readFile(fullPath, "utf-8");
                      const lines = content.split("\n");

                      for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (line !== undefined) {
                          // Create new regex for each test to avoid lastIndex issues
                          const regex = new RegExp(pattern);
                          if (regex.test(line)) {
                            const relativePath = relative(basePath, fullPath);
                            matches.push(`${relativePath}:${i + 1}: ${line.trim()}`);
                          }
                        }
                      }
                    } catch (err) {
                      // Skip files that can't be read as text
                      continue;
                    }
                  }
                }
              }

              await searchDirectory(basePath);

              const results = matches.slice(0, 100).join("\n"); // Limit to 100 results

              return c.json({
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: results || "No matches found",
                    },
                  ],
                },
              });
            }
          } catch (error) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32603,
                message: `Search failed: ${error}`,
              },
            });
          }
        }
      }

      return c.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: "Method not found",
        },
      });
    } catch (error) {
      console.error("MCP endpoint error:", error);
      return c.json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: String(error),
        },
      }, 500);
    }
  });
}
