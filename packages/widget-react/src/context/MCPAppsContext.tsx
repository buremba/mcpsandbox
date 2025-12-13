/**
 * MCP Apps Context
 *
 * Provides tool metadata and callbacks to components that need to render MCP Apps
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { ToolMetaMap } from '../mcp/http-client.js';
import type { MCPAppsCallbacks } from '../config/types.js';

/**
 * Context value for MCP Apps
 */
export interface MCPAppsContextValue {
  /** Tool metadata (UI resource URIs) */
  toolMeta: ToolMetaMap;
  /** Map of tool names to their MCP endpoints */
  toolEndpoints: Record<string, string>;
  /** Callbacks for MCP Apps events */
  callbacks?: MCPAppsCallbacks;
}

const MCPAppsContext = createContext<MCPAppsContextValue | null>(null);

/**
 * Provider for MCP Apps context
 */
export const MCPAppsProvider: React.FC<{
  toolMeta: ToolMetaMap;
  toolEndpoints: Record<string, string>;
  callbacks?: MCPAppsCallbacks;
  children: React.ReactNode;
}> = ({ toolMeta, toolEndpoints, callbacks, children }) => {
  const value = useMemo(
    () => ({ toolMeta, toolEndpoints, callbacks }),
    [toolMeta, toolEndpoints, callbacks]
  );

  return (
    <MCPAppsContext.Provider value={value}>
      {children}
    </MCPAppsContext.Provider>
  );
};

/**
 * Hook to access MCP Apps context
 */
export function useMCPApps(): MCPAppsContextValue | null {
  return useContext(MCPAppsContext);
}
