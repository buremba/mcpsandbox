import { z } from "zod";
import { tool } from "ai";
import type { MCPServerConfig } from "@onemcp/shared";
import type { MCPToolWithMeta, UIResourceContent, ToolUIMetadata } from "./types.js";

/**
 * MCP Tool definition from server
 */
interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  _meta?: ToolUIMetadata;
}

/**
 * Tool metadata map (tool name -> UI resource URI)
 */
export interface ToolMetaMap {
  [toolName: string]: {
    resourceUri?: string;
  };
}

/**
 * MCP connection state
 */
export interface MCPConnection {
  endpoint: string;
  tools: Record<string, any>;
  toolMeta: ToolMetaMap;
  isConnected: boolean;
}

/**
 * Convert JSON Schema to Zod schema (simplified, top-level only)
 */
function jsonSchemaToZod(jsonSchema: MCPToolDefinition["inputSchema"]): z.ZodObject<any> {
  if (!jsonSchema || jsonSchema.type !== "object") {
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  const properties = jsonSchema.properties || {};
  const required = jsonSchema.required || [];

  for (const [key, prop] of Object.entries(properties)) {
    const propSchema = prop as Record<string, unknown>;
    let zodType: z.ZodTypeAny;

    switch (propSchema.type) {
      case "string":
        zodType = z.string();
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      case "number":
        zodType = z.number();
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      case "boolean":
        zodType = z.boolean();
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      case "array":
        zodType = z.array(z.string());
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      case "object":
        // For nested objects, use z.any() to avoid schema issues
        zodType = z.any();
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      default:
        zodType = z.any();
    }

    // Make optional if not required
    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return z.object(shape);
}

/**
 * Connect to an MCP server via HTTP
 */
export async function connectToMCP(
  config: MCPServerConfig
): Promise<MCPConnection> {
  if (config.transport !== "http" || !config.endpoint) {
    throw new Error("Only HTTP transport with endpoint is supported");
  }

  const endpoint = config.endpoint;

  // Initialize MCP session
  const initResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "onemcp-widget",
          version: "1.0.0",
        },
      },
    }),
  });

  if (!initResponse.ok) {
    throw new Error(`MCP initialization failed: ${initResponse.status}`);
  }

  await initResponse.json();

  // Fetch tools list
  const toolsResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    }),
  });

  if (!toolsResponse.ok) {
    throw new Error(`MCP tools/list failed: ${toolsResponse.status}`);
  }

  const toolsResult = await toolsResponse.json();
  const mcpToolsList: MCPToolDefinition[] = toolsResult.result?.tools || [];

  // Convert MCP tools to AI SDK tools
  const convertedTools: Record<string, any> = {};
  const toolMeta: ToolMetaMap = {};

  for (const mcpTool of mcpToolsList) {
    const zodSchema = jsonSchemaToZod(mcpTool.inputSchema);

    // Extract UI resource metadata if present
    const resourceUri = mcpTool._meta?.['ui/resourceUri'];
    if (resourceUri) {
      toolMeta[mcpTool.name] = { resourceUri };
    }

    convertedTools[mcpTool.name] = tool({
      description: mcpTool.description,
      inputSchema: zodSchema,
      execute: async (args: any) => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: {
              name: mcpTool.name,
              arguments: args,
            },
          }),
        });

        const result = await response.json();

        if (result.error) {
          throw new Error(result.error.message);
        }

        // Extract text content from MCP response
        if (result.result?.content?.[0]?.text) {
          return result.result.content[0].text;
        }

        return JSON.stringify(result.result);
      },
    });
  }

  return {
    endpoint,
    tools: convertedTools,
    toolMeta,
    isConnected: true,
  };
}

/**
 * Read a UI resource from an MCP server
 */
export async function readResource(
  endpoint: string,
  uri: string
): Promise<UIResourceContent> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "resources/read",
      params: { uri },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP resources/read failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message);
  }

  const contents = result.result?.contents?.[0];
  if (!contents) {
    throw new Error(`No content returned for resource: ${uri}`);
  }

  // Handle different content formats
  let content: string;
  if (contents.blob) {
    // Base64 encoded content
    content = atob(contents.blob);
  } else if (contents.text) {
    content = contents.text;
  } else {
    throw new Error(`Unknown content format for resource: ${uri}`);
  }

  return {
    content,
    mimeType: contents.mimeType || 'text/html',
    encoding: contents.blob ? 'base64' : 'utf-8',
    meta: contents._meta?.ui,
  };
}

/**
 * Call an MCP tool directly (for use by UI components)
 */
export async function callMCPTool(
  endpoint: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message);
  }

  // Extract text content from MCP response
  if (result.result?.content?.[0]?.text) {
    return result.result.content[0].text;
  }

  return result.result;
}

/**
 * Result of connecting to multiple MCP servers
 */
export interface MCPServersConnection {
  tools: Record<string, any>;
  toolMeta: ToolMetaMap;
  endpoints: Record<string, string>; // tool name -> endpoint
}

/**
 * Connect to multiple MCP servers
 */
export async function connectToMCPServers(
  configs: MCPServerConfig[]
): Promise<MCPServersConnection> {
  const allTools: Record<string, any> = {};
  const allToolMeta: ToolMetaMap = {};
  const endpoints: Record<string, string> = {};

  for (const config of configs) {
    if (config.transport !== "http" || !config.endpoint) {
      console.warn(`Skipping MCP server ${config.name}: only HTTP transport supported`);
      continue;
    }

    try {
      console.log(`[Widget] Connecting to MCP server: ${config.name} at ${config.endpoint}`);
      const connection = await connectToMCP(config);
      // Prefix tool names with server name to avoid collisions
      for (const [name, toolDef] of Object.entries(connection.tools)) {
        const prefixedName = `${config.name}_${name}`;
        allTools[prefixedName] = toolDef;
        endpoints[prefixedName] = config.endpoint;

        // Copy tool metadata with prefixed name
        if (connection.toolMeta[name]) {
          allToolMeta[prefixedName] = connection.toolMeta[name];
        }
      }
      console.log(`[Widget] Successfully connected to MCP server: ${config.name}, tools:`, Object.keys(connection.tools));
    } catch (error) {
      console.warn(`[Widget] Failed to connect to MCP server ${config.name}:`, error);
      // Continue with other servers even if one fails
    }
  }

  return { tools: allTools, toolMeta: allToolMeta, endpoints };
}
