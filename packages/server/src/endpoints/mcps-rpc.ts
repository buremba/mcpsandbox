/**
 * Upstream MCP proxy endpoint (spec §1.4)
 */

import type { Context } from "hono";
import type { McpsRpcRequest } from "@onemcp/shared";
import type { MCPManager } from "../services/mcp-manager.js";

export function setupMcpsRpcEndpoint(app: any, mcpManager: MCPManager) {
  app.post("/mcps-rpc", async (c: Context) => {
    try {
      const body: McpsRpcRequest = await c.req.json();
      const { mcp, tool, params } = body;

      if (!mcp) {
        return c.json({ error: "Missing 'mcp' field" }, 400);
      }

      if (!tool) {
        return c.json({ error: "Missing 'tool' field" }, 400);
      }

      // Call the tool via MCPManager
      const result = await mcpManager.callTool(mcp, tool, params || {});

      return c.json({
        success: true,
        result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("MCP RPC error:", errorMessage);

      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });

  // Optional: list tools endpoint
  app.get("/mcps/:name/tools", async (c: Context) => {
    try {
      const name = c.req.param("name");
      const tools = await mcpManager.listTools(name);

      return c.json({
        success: true,
        tools,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });
}
