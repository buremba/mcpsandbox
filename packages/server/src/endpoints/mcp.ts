/**
 * MCP protocol endpoint
 */

import type { Context } from "hono";
import type { RelayConfig } from "@onemcp/shared";
import type { ExecutionBackend } from "../execution/interface.js";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join, relative, normalize } from "node:path";

/**
 * Validate that a file path is allowed according to the filesystem policy
 */
function validateFilePath(
  filePath: string,
  allowedPaths: string[],
  _operation: 'read' | 'write'
): { isAllowed: boolean; resolvedPath: string; error?: string } {
  try {
    const resolvedPath = resolve(process.cwd(), filePath);
    const normalizedPath = normalize(resolvedPath);

    if (normalizedPath.includes('..')) {
      return {
        isAllowed: false,
        resolvedPath: normalizedPath,
        error: 'Path traversal detected'
      };
    }

    const isAllowed = allowedPaths.some(allowedPath => {
      const normalizedAllowed = normalize(resolve(allowedPath));
      return normalizedPath.startsWith(normalizedAllowed);
    });

    if (!isAllowed) {
      return {
        isAllowed: false,
        resolvedPath: normalizedPath,
        error: `Access denied - path outside allowed directories`
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
  _unused: any, // Kept for backwards compatibility, will be removed
  sessionManager: any,
  executor: ExecutionBackend,
  config: RelayConfig
) {
  app.post("/mcp", async (c: Context) => {
    try {
      const body = await c.req.json();
      const { id, method, params } = body;

      if (method === "initialize") {
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
              name: "relay-mcp",
              version: "1.0.0",
              upstreamServers: config.mcps?.map(m => m.name) ?? [],
              policy: config.policy,
            },
            sessionId,
          },
        });
      }

      if (method === "notifications/initialized") {
        return c.json({ jsonrpc: "2.0" });
      }

      if (method === "tools/list") {
        const builtInTools = [
          {
            name: "run_js",
            description: `Execute JavaScript code in a sandboxed QuickJS WASM environment. Has access to upstream MCP servers: ${config.mcps?.map(m => m.name).join(', ') ?? 'none'}. Network policy allows: ${config.policy?.network?.allowedDomains?.join(', ') ?? 'none'}. Resource limits: timeout ${config.policy?.limits?.timeoutMs ?? 30000}ms, memory ${config.policy?.limits?.memMb ?? 128}MB.`,
            inputSchema: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  description: "JavaScript code to execute",
                },
                env: {
                  type: "object",
                  additionalProperties: { type: "string" },
                  description: "Environment variables (optional)",
                },
              },
              required: ["code"],
            },
          },
          {
            name: "read",
            description: `Read file contents from the workspace. Filesystem policy restricts access to: readonly=[${config.policy?.filesystem?.readonly?.join(', ') ?? '/'}], writable=[${config.policy?.filesystem?.writable?.join(', ') ?? '/tmp'}]`,
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to read",
                },
              },
              required: ["path"],
            },
          },
          {
            name: "write",
            description: `Write content to a file in writable workspace areas. Writable paths: [${config.policy?.filesystem?.writable?.join(', ') ?? '/tmp'}]`,
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to write",
                },
                content: {
                  type: "string",
                  description: "Content to write",
                },
              },
              required: ["path", "content"],
            },
          },
          {
            name: "search",
            description: `Search for files or content within the workspace.`,
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Directory path to search in",
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
          const { code, env } = toolArgs as { code: string; env?: Record<string, string> };

          try {
            const result = await executor.execute(code, {
              env,
              limits: {
                timeoutMs: config.policy?.limits?.timeoutMs ?? 30000,
                memMb: config.policy?.limits?.memMb ?? 128,
                stdoutBytes: config.policy?.limits?.stdoutBytes ?? 1048576,
              },
              network: config.policy?.network ? {
                allow: config.policy.network.allowedDomains,
                maxBodyBytes: config.policy.network.maxBodyBytes,
                maxRedirects: config.policy.network.maxRedirects,
              } : undefined,
            });

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
        } else if (toolName === "read") {
          try {
            const { path: filePath } = toolArgs as { path: string };

            const validation = validateFilePath(
              filePath,
              config.policy?.filesystem?.readonly ?? ['/'],
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
          try {
            const { path: filePath, content } = toolArgs as { path: string; content: string };

            const validation = validateFilePath(
              filePath,
              config.policy?.filesystem?.writable ?? ['/tmp'],
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
          try {
            const { path: searchPath, pattern, type } = toolArgs as {
              path?: string;
              pattern: string;
              type: "files" | "content"
            };
            const basePath = searchPath ? resolve(process.cwd(), searchPath) : process.cwd();

            if (type === "files") {
              const matches: string[] = [];

              const globToRegex = (glob: string): RegExp => {
                const escaped = glob
                  .replace(/\./g, '\\.')
                  .replace(/\*/g, '.*')
                  .replace(/\?/g, '.');
                return new RegExp(`^${escaped}$`);
              };

              const regex = globToRegex(pattern);

              async function searchFiles(dir: string) {
                try {
                  const entries = await readdir(dir, { withFileTypes: true });

                  for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    const relativePath = relative(basePath, fullPath);

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
                } catch {
                  // Skip directories we can't read
                }
              }

              await searchFiles(basePath);

              return c.json({
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: matches.join("\n") || "No matches found",
                    },
                  ],
                },
              });
            } else {
              const matches: string[] = [];

              async function searchDirectory(dir: string) {
                const entries = await readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                  const fullPath = join(dir, entry.name);

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
                          const regex = new RegExp(pattern);
                          if (regex.test(line)) {
                            const relativePath = relative(basePath, fullPath);
                            matches.push(`${relativePath}:${i + 1}: ${line.trim()}`);
                          }
                        }
                      }
                    } catch {
                      continue;
                    }
                  }
                }
              }

              await searchDirectory(basePath);

              return c.json({
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: matches.slice(0, 100).join("\n") || "No matches found",
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
