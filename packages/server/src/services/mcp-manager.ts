/**
 * MCP Process Manager - spawns and manages upstream MCP servers
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { MCPServerConfig } from "@onemcp/shared";
import { fetch } from "undici";

interface MCPProcess {
  config: MCPServerConfig;
  process?: ChildProcess;
  ready: boolean;
  messageId: number;
  pendingRequests: Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >;
  buffer: string;
}

export class MCPManager {
  private processes: Map<string, MCPProcess> = new Map();
  private logger: any;

  constructor(configs: MCPServerConfig[], logger: any) {
    this.logger = logger;

    for (const config of configs) {
      if (config.transport === "stdio") {
        this.initStdioMcp(config);
      } else if (config.transport === "http") {
        this.initHttpMcp(config);
      }
    }
  }

  private initHttpMcp(config: MCPServerConfig) {
    if (!config.endpoint) {
      this.logger.warn(`MCP '${config.name}' has no endpoint, skipping`);
      return;
    }

    const mcpProcess: MCPProcess = {
      config,
      ready: true, // HTTP MCPs are always ready
      messageId: 0,
      pendingRequests: new Map(),
      buffer: "",
    };

    this.processes.set(config.name, mcpProcess);
    this.logger.info(
      `Initialized HTTP MCP '${config.name}' at ${config.endpoint}`
    );
  }

  private initStdioMcp(config: MCPServerConfig) {
    if (!config.command) {
      this.logger.warn(`MCP '${config.name}' has no command, skipping`);
      return;
    }

    const mcpProcess: MCPProcess = {
      config,
      ready: false,
      messageId: 0,
      pendingRequests: new Map(),
      buffer: "",
    };

    this.processes.set(config.name, mcpProcess);
    this.logger.info(`Initialized MCP process manager for '${config.name}'`);
  }

  private async ensureProcessRunning(name: string): Promise<MCPProcess> {
    const mcp = this.processes.get(name);
    if (!mcp) {
      throw new Error(`MCP '${name}' not found in configuration`);
    }

    // If process already running, return it
    if (mcp.process && !mcp.process.killed) {
      return mcp;
    }

    // Spawn new process
    const args = mcp.config.args || [];
    this.logger.info(
      `Spawning MCP '${name}': ${mcp.config.command} ${args.join(" ")}`
    );

    const proc = spawn(mcp.config.command!, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    mcp.process = proc;
    mcp.buffer = "";

    // Handle stdout (JSON-RPC responses)
    proc.stdout?.on("data", (data: Buffer) => {
      mcp.buffer += data.toString();

      // Process complete JSON-RPC messages (newline delimited)
      const lines = mcp.buffer.split("\n");
      mcp.buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const message = JSON.parse(line);
          this.handleMessage(name, message);
        } catch (err) {
          this.logger.error(
            `Failed to parse JSON from MCP '${name}': ${line}`,
            err
          );
        }
      }
    });

    // Handle stderr (logs)
    proc.stderr?.on("data", (data: Buffer) => {
      this.logger.debug(`MCP '${name}' stderr:`, data.toString().trim());
    });

    // Handle process exit
    proc.on("exit", (code) => {
      this.logger.info(`MCP '${name}' exited with code ${code}`);
      mcp.ready = false;

      // Reject all pending requests
      for (const [, req] of mcp.pendingRequests.entries()) {
        clearTimeout(req.timeout);
        req.reject(new Error(`MCP process exited with code ${code}`));
      }
      mcp.pendingRequests.clear();
    });

    // Send initialize request (ignore response, just need handshake)
    try {
      await this.sendRequest(name, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "relay-mcp",
          version: "0.1.0",
        },
      });
      mcp.ready = true;
    } catch (err) {
      this.logger.warn(
        `MCP '${name}' initialize failed, but continuing anyway:`,
        err
      );
      mcp.ready = true; // Continue anyway
    }

    return mcp;
  }

  private handleMessage(name: string, message: any) {
    const mcp = this.processes.get(name);
    if (!mcp) return;

    // Handle JSON-RPC response
    if (message.id !== undefined) {
      const pending = mcp.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        mcp.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(
            new Error(message.error.message || JSON.stringify(message.error))
          );
        } else {
          pending.resolve(message.result);
        }
      }
    }

    // Handle JSON-RPC notification (no id)
    else {
      this.logger.debug(`MCP '${name}' notification:`, message);
    }
  }

  private async sendRequest(
    name: string,
    method: string,
    params: any,
    timeoutMs = 30000
  ): Promise<any> {
    const mcp = await this.ensureProcessRunning(name);

    if (!mcp.process || !mcp.process.stdin) {
      throw new Error(`MCP '${name}' process not ready`);
    }

    const id = ++mcp.messageId;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        mcp.pendingRequests.delete(id);
        reject(new Error(`MCP '${name}' request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      mcp.pendingRequests.set(id, { resolve, reject, timeout });

      // Send request
      const requestLine = JSON.stringify(request) + "\n";
      mcp.process!.stdin!.write(requestLine, (err) => {
        if (err) {
          clearTimeout(timeout);
          mcp.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(
    mcpName: string,
    toolName: string,
    params: any
  ): Promise<any> {
    const mcp = this.processes.get(mcpName);
    if (!mcp) {
      throw new Error(`MCP '${mcpName}' not found`);
    }

    if (mcp.config.transport === "stdio") {
      // For stdio, use tools/call method
      return this.sendRequest(mcpName, "tools/call", {
        name: toolName,
        arguments: params,
      });
    } else if (mcp.config.transport === "http") {
      // For HTTP, make a direct request
      if (!mcp.config.endpoint) {
        throw new Error(`MCP '${mcpName}' has no endpoint configured`);
      }

      const response = await fetch(mcp.config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: toolName,
            arguments: params,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP MCP '${mcpName}' returned ${response.status}: ${await response.text()}`
        );
      }

      const result = (await response.json()) as any;
      if (result.error) {
        throw new Error(result.error.message || JSON.stringify(result.error));
      }

      return result.result;
    }

    throw new Error(`Unsupported transport: ${mcp.config.transport}`);
  }

  /**
   * List available tools from an MCP server
   */
  async listTools(mcpName: string): Promise<any> {
    const mcp = this.processes.get(mcpName);
    if (!mcp) {
      throw new Error(`MCP '${mcpName}' not found`);
    }

    if (mcp.config.transport === "stdio") {
      return this.sendRequest(mcpName, "tools/list", {});
    } else if (mcp.config.transport === "http") {
      if (!mcp.config.endpoint) {
        throw new Error(`MCP '${mcpName}' has no endpoint configured`);
      }

      const response = await fetch(mcp.config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/list",
          params: {},
        }),
      });

      const result = (await response.json()) as any;
      return result.result;
    }

    throw new Error(`Unsupported transport: ${mcp.config.transport}`);
  }

  /**
   * Shutdown all MCP processes
   */
  async shutdown() {
    this.logger.info("Shutting down all MCP processes...");

    for (const [name, mcp] of this.processes.entries()) {
      if (mcp.process && !mcp.process.killed) {
        this.logger.info(`Killing MCP '${name}'`);
        mcp.process.kill("SIGTERM");

        // Force kill after 5s
        setTimeout(() => {
          if (mcp.process && !mcp.process.killed) {
            mcp.process.kill("SIGKILL");
          }
        }, 5000);
      }
    }
  }
}
