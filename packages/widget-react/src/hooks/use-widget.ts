import { useState, useEffect, useCallback } from "react";
import { connectToMCPServers, type ToolMetaMap } from "../mcp/index.js";
import { useWidgetRuntime } from "./use-runtime.js";
import type { WidgetConfig, WidgetProps } from "../config/types.js";

/**
 * Widget state
 */
export interface WidgetState {
  isOpen: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  error: Error | null;
  mcpTools: Record<string, any>;
  /** Tool metadata (UI resource URIs) */
  toolMeta: ToolMetaMap;
  /** Map of tool names to their MCP endpoints */
  toolEndpoints: Record<string, string>;
}

/**
 * Widget controller
 */
export interface WidgetController {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Hook to manage widget state and behavior
 */
export function useWidget(props: WidgetProps) {
  const { config, onOpen, onClose, onMessage, onToolCall, onError } = props;

  // Widget state
  const [isOpen, setIsOpen] = useState(config.widget?.defaultOpen ?? false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [mcpTools, setMcpTools] = useState<Record<string, any>>({});
  const [toolMeta, setToolMeta] = useState<ToolMetaMap>({});
  const [toolEndpoints, setToolEndpoints] = useState<Record<string, string>>({});
  const [error, setError] = useState<Error | null>(null);

  // Connect to MCP servers
  useEffect(() => {
    if (!config.mcps || config.mcps.length === 0) {
      setIsConnected(true);
      return;
    }

    let mounted = true;

    const connect = async () => {
      setIsConnecting(true);
      setError(null);

      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("MCP connection timeout")), 10000);
        });

        const connectionPromise = connectToMCPServers(config.mcps!);
        const connection = await Promise.race([connectionPromise, timeoutPromise]) as Awaited<ReturnType<typeof connectToMCPServers>>;

        if (mounted) {
          setMcpTools(connection.tools);
          setToolMeta(connection.toolMeta);
          setToolEndpoints(connection.endpoints);
          setIsConnected(true);
          setIsConnecting(false);
          console.log("[Widget] MCP connection successful, tools:", Object.keys(connection.tools));

          // Log any tools with UI resources
          const uiTools = Object.entries(connection.toolMeta).filter(([, meta]) => meta.resourceUri);
          if (uiTools.length > 0) {
            console.log("[Widget] Tools with UI resources:", uiTools.map(([name]) => name));
          }
        }
      } catch (err) {
        if (mounted) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.warn("[Widget] MCP connection failed, continuing without MCP tools:", error);
          setError(error);
          // Don't block - allow chat to work without MCP tools
          setIsConnected(false);
          setIsConnecting(false);
          // Set empty tools so runtime can still work
          setMcpTools({});
          onError?.(error);
        }
      }
    };

    connect();

    return () => {
      mounted = false;
    };
  }, [config.mcps, onError]);

  // Create runtime with MCP tools
  const runtime = useWidgetRuntime({
    config,
    tools: mcpTools,
  });

  // Widget controls
  const open = useCallback(() => {
    setIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        onOpen?.();
      } else {
        onClose?.();
      }
      return next;
    });
  }, [onOpen, onClose]);

  // Return state and controls
  const state: WidgetState = {
    isOpen,
    isConnecting,
    isConnected,
    error,
    mcpTools,
    toolMeta,
    toolEndpoints,
  };

  const controller: WidgetController = {
    open,
    close,
    toggle,
  };

  return {
    state,
    controller,
    runtime,
  };
}
