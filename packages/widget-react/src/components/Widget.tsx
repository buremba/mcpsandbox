import React, { useEffect, useState, useCallback, FormEvent, FC, forwardRef, useImperativeHandle } from "react";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  useAssistantRuntime,
} from "@assistant-ui/react";
import { useWidget, type WidgetController } from "../hooks/use-widget.js";
import { useThreadStorage } from "../hooks/use-thread-storage.js";
import { FloatingButton } from "./FloatingButton.js";
import { ThreadList } from "./ThreadList.js";
import { DEFAULT_WIDGET_CONFIG, type WidgetProps } from "../config/types.js";
import { MarkdownText } from "./MarkdownText.js";
import { PluginProvider } from "../plugins/index.js";
import { MCPAppsProvider, useMCPApps } from "../context/MCPAppsContext.js";
import { MCPAppRenderer } from "./MCPAppRenderer.js";
import { callMCPTool } from "../mcp/http-client.js";

export interface WidgetRef extends WidgetController {
  /** Show the thread list */
  showThreadList: () => void;
  /** Hide the thread list and show chat */
  hideThreadList: () => void;
}

export const Widget = forwardRef<WidgetRef, WidgetProps>(function Widget(props, ref) {
  const { config } = props;
  const { state, controller, runtime } = useWidget(props);

  // Thread support - simple boolean
  const threadsEnabled = config.threads === true;
  const hasInitialPrompt = Boolean(config.initialPrompt);

  // Detect relay server endpoint from MCP config (for remote storage)
  const relayEndpoint = config.mcps?.[0]?.endpoint?.replace(/\/mcp$/, "");

  // Thread storage (only initialize if threads are enabled)
  const threadStorage = useThreadStorage({
    enabled: threadsEnabled,
    relayEndpoint,
  });

  // View state: 'chat' or 'threads'
  // Show threads first if enabled, no initial prompt, and we have threads
  const [view, setView] = useState<"chat" | "threads">(
    threadsEnabled && !hasInitialPrompt ? "threads" : "chat"
  );

  // Show thread list
  const showThreadList = useCallback(() => {
    setView("threads");
  }, []);

  // Hide thread list
  const hideThreadList = useCallback(() => {
    setView("chat");
  }, []);

  // Expose controller methods via ref
  useImperativeHandle(
    ref,
    () => ({
      ...controller,
      showThreadList,
      hideThreadList,
    }),
    [controller, showThreadList, hideThreadList]
  );

  const widgetConfig = {
    ...DEFAULT_WIDGET_CONFIG,
    ...config.widget,
  };

  useEffect(() => {
    const root = document.documentElement;
    const theme = widgetConfig.theme;

    if (theme?.preset === "dark") {
      root.style.setProperty("--onemcp-bg-primary", "#1a1a1a");
      root.style.setProperty("--onemcp-bg-secondary", "#2d2d2d");
      root.style.setProperty("--onemcp-bg-tertiary", "#3d3d3d");
      root.style.setProperty("--onemcp-text-primary", "#ffffff");
      root.style.setProperty("--onemcp-text-secondary", "#b3b3b3");
      root.style.setProperty("--onemcp-text-muted", "#808080");
      root.style.setProperty("--onemcp-border", "#404040");
      root.style.setProperty("--onemcp-accent", "#3b82f6");
      root.style.setProperty("--onemcp-accent-hover", "#2563eb");
    }

    if (theme?.variables) {
      for (const [key, value] of Object.entries(theme.variables)) {
        root.style.setProperty(key, value);
      }
    }

    if (theme?.customCss) {
      const style = document.createElement("style");
      style.textContent = theme.customCss;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, [widgetConfig.theme]);

  return (
    <PluginProvider config={widgetConfig.plugins}>
      <MCPAppsProvider
        toolMeta={state.toolMeta}
        toolEndpoints={state.toolEndpoints}
        callbacks={config.mcpApps}
      >
        <AssistantRuntimeProvider runtime={runtime}>
          <FloatingButton position={widgetConfig.position} onClick={controller.toggle} />

      {state.isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: 90,
            right: 20,
            width: 400,
            height: 600,
            maxHeight: "calc(100vh - 120px)",
            backgroundColor: "var(--onemcp-bg-primary, #ffffff)",
            borderRadius: "var(--onemcp-radius, 12px)",
            boxShadow: "var(--onemcp-shadow, 0 8px 32px rgba(0,0,0,0.15))",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 999998,
            fontFamily:
              "var(--onemcp-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
          }}
        >
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid var(--onemcp-border, #e5e5e5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Thread icon button (only when threads are enabled) */}
              {threadsEnabled && (
                <button
                  onClick={view === "threads" ? hideThreadList : showThreadList}
                  style={{
                    background: view === "threads"
                      ? "var(--onemcp-accent-light, rgba(0, 102, 255, 0.1))"
                      : "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 6,
                    borderRadius: 6,
                    color: view === "threads"
                      ? "var(--onemcp-accent, #0066ff)"
                      : "var(--onemcp-text-secondary, #666)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-label={view === "threads" ? "Back to chat" : "View conversations"}
                  title={view === "threads" ? "Back to chat" : "View conversations"}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <path d="M8 9h8M8 13h6" />
                  </svg>
                </button>
              )}
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--onemcp-text-primary, #1a1a1a)",
                }}
              >
                {view === "threads" ? "Conversations" : widgetConfig.title}
              </h2>
            </div>
            <button
              onClick={controller.close}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--onemcp-text-secondary, #666)",
              }}
              aria-label="Close"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Thread List View */}
          {view === "threads" && threadsEnabled && (
            <ThreadList
              threads={threadStorage.threads}
              activeThreadId={threadStorage.activeThreadId}
              isLoading={threadStorage.isLoading}
              onThreadSelect={async (threadId) => {
                await threadStorage.switchThread(threadId);
                setView("chat");
              }}
              onNewThread={async () => {
                await threadStorage.createThread();
                setView("chat");
              }}
              onDeleteThread={threadStorage.deleteThread}
              onArchiveThread={threadStorage.archiveThread}
              onStartChat={() => setView("chat")}
            />
          )}

          {/* Chat View */}
          {view === "chat" && (
            <ThreadPrimitive.Root style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <ThreadPrimitive.Viewport style={{ flex: 1, overflow: "auto", padding: "16px" }}>
                {/* Welcome Message */}
                <WelcomeMessage
                  isConnecting={state.isConnecting}
                  isConnected={state.isConnected}
                  mcpConfigs={config.mcps || []}
                  mcpTools={state.mcpTools}
                  error={state.error}
                  modelConfig={config.model}
                  policyConfig={config.policy}
                />

                <ThreadPrimitive.Messages
                  components={{
                    UserMessage: UserMessage,
                    AssistantMessage: AssistantMessage,
                  }}
                />
              </ThreadPrimitive.Viewport>

              {/* Custom Composer with direct runtime API */}
              <CustomComposer placeholder={widgetConfig.placeholder} />
            </ThreadPrimitive.Root>
          )}

          </div>
        )}
        </AssistantRuntimeProvider>
      </MCPAppsProvider>
    </PluginProvider>
  );
});

/**
 * User message component
 */
function UserMessage() {
  return (
    <MessagePrimitive.Root
      style={{
        display: "flex",
        justifyContent: "flex-end",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "10px 14px",
          borderRadius: 12,
          backgroundColor: "var(--onemcp-accent, #0066ff)",
          color: "var(--onemcp-accent-text, #ffffff)",
          fontSize: 14,
        }}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * Tool Fallback component for displaying tool calls inline
 * This renders when no specific tool UI component is provided
 * If the tool has a UI resource, renders MCPAppRenderer instead
 *
 * Props from assistant-ui MessagePrimitive.Parts:
 * - toolName: string
 * - argsText: string (JSON stringified args)
 * - args: object (parsed args)
 * - result: unknown
 * - status: { type: "running" | "complete" | "incomplete", ... }
 */
const ToolFallbackComponent: FC<any> = (props) => {
  const [showDetails, setShowDetails] = useState(false);
  const mcpApps = useMCPApps();

  // Props come directly from assistant-ui, not nested in 'part'
  const { toolName: propsToolName, argsText, args: propsArgs, result: propsResult, status, part } = props;

  // Handle both direct props (from MessagePrimitive.Parts) and nested props (from part)
  const toolName = propsToolName || part?.toolName || "Unknown Tool";
  const args = propsArgs || part?.args;
  const result = propsResult !== undefined ? propsResult : part?.result;

  const isRunning = status?.type === "running" || status?.type === "requires-action";
  const isComplete = status?.type === "complete" || result !== undefined;
  const isError = status?.type === "incomplete" && status?.reason === "error";

  // Check if this tool has a UI resource
  const toolMeta = mcpApps?.toolMeta?.[toolName];
  const resourceUri = toolMeta?.resourceUri;
  const endpoint = mcpApps?.toolEndpoints?.[toolName];

  // Debug logging
  console.log('[ToolFallback] props:', props);
  console.log('[ToolFallback] toolName:', toolName);
  console.log('[ToolFallback] toolMeta:', toolMeta);
  console.log('[ToolFallback] resourceUri:', resourceUri);
  console.log('[ToolFallback] endpoint:', endpoint);

  // Handle tool call from UI
  const handleToolCall = useCallback(async (name: string, toolArgs: Record<string, unknown>) => {
    const toolEndpoint = mcpApps?.toolEndpoints?.[name] || endpoint;
    if (!toolEndpoint) {
      throw new Error(`No endpoint found for tool: ${name}`);
    }
    const toolResult = await callMCPTool(toolEndpoint, name, toolArgs);
    // Notify parent via callback if configured
    mcpApps?.callbacks?.onToolCall?.(name, toolArgs, toolResult);
    return toolResult;
  }, [mcpApps?.toolEndpoints, mcpApps?.callbacks, endpoint]);

  // Handle intent from UI
  const handleIntent = useCallback((intent: string, params: Record<string, unknown>) => {
    mcpApps?.callbacks?.onIntent?.(intent, params);
  }, [mcpApps?.callbacks]);

  // Handle message from UI
  const handleMessage = useCallback((content: string) => {
    mcpApps?.callbacks?.onMessage?.(content);
  }, [mcpApps?.callbacks]);

  // Handle open link from UI
  const handleOpenLink = useCallback((url: string) => {
    if (mcpApps?.callbacks?.onOpenLink) {
      mcpApps.callbacks.onOpenLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [mcpApps?.callbacks]);

  // If tool has UI resource and we have an endpoint, render MCPAppRenderer
  if (resourceUri && endpoint) {
    return (
      <MCPAppRenderer
        resourceUri={resourceUri}
        endpoint={endpoint}
        toolArgs={args}
        toolResult={result}
        onToolCall={handleToolCall}
        onIntent={handleIntent}
        onMessage={handleMessage}
        onOpenLink={handleOpenLink}
      />
    );
  }

  // Default: render JSON tool call display
  return (
    <div className={`onemcp-tool-call onemcp-tool-call-${isRunning ? "running" : isComplete ? "complete" : isError ? "error" : "pending"}`}>
      <div className="onemcp-tool-call-header">
        <span className="onemcp-tool-call-status">
          {isRunning && <span className="onemcp-tool-call-spinner" />}
          {isComplete && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
          {isError && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          )}
        </span>
        <span className="onemcp-tool-call-name">{toolName}</span>
        <button
          type="button"
          className="onemcp-tool-call-toggle"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? "Hide" : "Show"} details
        </button>
      </div>
      {showDetails && (
        <div className="onemcp-tool-call-details">
          {args && (
            <div className="onemcp-tool-call-args">
              <div className="onemcp-tool-call-section-label">Arguments:</div>
              <pre className="onemcp-tool-call-json">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div className="onemcp-tool-call-result">
              <div className="onemcp-tool-call-section-label">Result:</div>
              <pre className="onemcp-tool-call-json">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Assistant message component with markdown support
 */
function AssistantMessage() {
  return (
    <MessagePrimitive.Root
      style={{
        display: "flex",
        justifyContent: "flex-start",
        marginBottom: 12,
      }}
    >
      <div
        className="onemcp-assistant-message"
        style={{
          maxWidth: "85%",
          padding: "10px 14px",
          borderRadius: 12,
          backgroundColor: "var(--onemcp-bg-secondary, #f5f5f5)",
          color: "var(--onemcp-text-primary, #1a1a1a)",
          fontSize: 14,
        }}
      >
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: {
              Fallback: ToolFallbackComponent,
            },
          } as any}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * Custom composer component that uses runtime API directly
 * Uses uncontrolled input pattern for better automation compatibility
 */
function CustomComposer({ placeholder }: { placeholder?: string }) {
  const runtime = useAssistantRuntime();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Subscribe to thread state changes
  useEffect(() => {
    const unsubscribe = runtime.thread.subscribe(() => {
      const state = runtime.thread.getState();
      setIsRunning(state.isRunning);
    });
    return unsubscribe;
  }, [runtime]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const text = inputRef.current?.value?.trim() || "";
      if (!text || isRunning) return;

      console.log("[Widget] Sending message via runtime API:", text);

      // Use the runtime API to send the message
      runtime.thread.composer.setText(text);
      runtime.thread.composer.send();

      // Clear the input
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [isRunning, runtime]
  );

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: "16px",
        borderTop: "1px solid var(--onemcp-border, #e5e5e5)",
        display: "flex",
        gap: 8,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder || "Ask me anything..."}
        disabled={isRunning}
        style={{
          flex: 1,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid var(--onemcp-border, #e5e5e5)",
          fontSize: 14,
          outline: "none",
          backgroundColor: "var(--onemcp-bg-secondary, #f5f5f5)",
          color: "var(--onemcp-text-primary, #1a1a1a)",
        }}
      />
      <button
        type="submit"
        disabled={isRunning}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "none",
          backgroundColor: isRunning 
            ? "var(--onemcp-border, #e5e5e5)" 
            : "var(--onemcp-accent, #0066ff)",
          color: "var(--onemcp-accent-text, #ffffff)",
          cursor: isRunning ? "not-allowed" : "pointer",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {isRunning ? "..." : "Send"}
      </button>
    </form>
  );
}

/**
 * Welcome message component showing config summary, connected MCPs and tools
 */
interface WelcomeMessageProps {
  isConnecting: boolean;
  isConnected: boolean;
  mcpConfigs: Array<{ name: string; endpoint?: string }>;
  mcpTools: Record<string, any>;
  error: Error | null;
  modelConfig?: { provider: string; name?: string };
  policyConfig?: { limits?: { timeoutMs?: number; memMb?: number } };
}

function WelcomeMessage({
  isConnecting,
  isConnected,
  mcpConfigs,
  mcpTools,
  error,
  modelConfig,
  policyConfig,
}: WelcomeMessageProps) {
  const [expandedMcps, setExpandedMcps] = useState<Set<string>>(new Set());
  const hasMcps = mcpConfigs.length > 0;

  // Group tools by MCP server (tools are prefixed with server name)
  const toolsByMcp: Record<string, string[]> = {};
  for (const toolName of Object.keys(mcpTools)) {
    const [mcpName, ...rest] = toolName.split('_');
    if (!toolsByMcp[mcpName]) {
      toolsByMcp[mcpName] = [];
    }
    toolsByMcp[mcpName].push(rest.join('_'));
  }

  // Format provider name for display
  const providerDisplayName = modelConfig?.provider === 'chrome'
    ? 'Chrome AI'
    : modelConfig?.provider === 'openai'
    ? 'OpenAI'
    : modelConfig?.provider === 'anthropic'
    ? 'Anthropic'
    : modelConfig?.provider || 'Unknown';

  const toggleMcp = (mcpName: string) => {
    setExpandedMcps(prev => {
      const next = new Set(prev);
      if (next.has(mcpName)) {
        next.delete(mcpName);
      } else {
        next.add(mcpName);
      }
      return next;
    });
  };

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        borderRadius: 12,
        backgroundColor: "var(--onemcp-bg-secondary, #f5f5f5)",
        color: "var(--onemcp-text-primary, #1a1a1a)",
        fontSize: 14,
      }}
    >
      <div style={{ marginBottom: 8, fontWeight: 500 }}>
        👋 Welcome! How can I help you today?
      </div>

      {/* Config Summary */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        marginBottom: 10,
        padding: "6px 10px",
        borderRadius: 6,
        backgroundColor: "var(--onemcp-bg-tertiary, #eeeeee)",
        fontSize: 12,
        color: "var(--onemcp-text-secondary, #666)",
      }}>
        <span>
          <strong>Model:</strong> {providerDisplayName}{modelConfig?.name ? ` / ${modelConfig.name}` : ''}
        </span>
        {policyConfig?.limits?.timeoutMs && (
          <>
            <span style={{ color: "var(--onemcp-border, #e5e5e5)" }}>•</span>
            <span><strong>Timeout:</strong> {policyConfig.limits.timeoutMs / 1000}s</span>
          </>
        )}
        {policyConfig?.limits?.memMb && (
          <>
            <span style={{ color: "var(--onemcp-border, #e5e5e5)" }}>•</span>
            <span><strong>Memory:</strong> {policyConfig.limits.memMb}MB</span>
          </>
        )}
      </div>

      {hasMcps && (
        <div style={{ fontSize: 13, color: "var(--onemcp-text-secondary, #666)" }}>
          {/* MCP Connection Status */}
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 500 }}>MCP Servers:</span>
            {isConnecting && (
              <span style={{ marginLeft: 8, color: "#f59e0b" }}>
                ⏳ Connecting...
              </span>
            )}
          </div>

          {/* List MCPs - Collapsible */}
          <div style={{ marginLeft: 4 }}>
            {mcpConfigs.map((mcp, index) => {
              const mcpToolList = toolsByMcp[mcp.name] || [];
              const isExpanded = expandedMcps.has(mcp.name);
              return (
                <div key={index} style={{ marginBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => toggleMcp(mcp.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      padding: "2px 4px",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--onemcp-text-secondary, #666)",
                      width: "100%",
                      textAlign: "left",
                    }}
                  >
                    {/* Status indicator */}
                    {isConnecting ? (
                      <span style={{ color: "#f59e0b" }}>○</span>
                    ) : isConnected && !error ? (
                      <span style={{ color: "#22c55e" }}>●</span>
                    ) : (
                      <span style={{ color: "#ef4444" }}>●</span>
                    )}
                    {/* Expand chevron */}
                    <span style={{
                      fontSize: 10,
                      transition: "transform 0.2s",
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}>▶</span>
                    {/* MCP name */}
                    <span style={{ fontWeight: 500, color: "var(--onemcp-text-primary, #1a1a1a)" }}>
                      {mcp.name}
                    </span>
                    {/* Tool count badge */}
                    {mcpToolList.length > 0 && (
                      <span style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 8,
                        backgroundColor: "var(--onemcp-bg-tertiary, #eeeeee)",
                        color: "var(--onemcp-text-secondary, #666)",
                      }}>
                        {mcpToolList.length} tools
                      </span>
                    )}
                  </button>
                  {/* Expanded tools list */}
                  {isExpanded && mcpToolList.length > 0 && (
                    <div style={{
                      marginLeft: 28,
                      marginTop: 4,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                    }}>
                      {mcpToolList.map((tool) => (
                        <span
                          key={tool}
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            backgroundColor: "var(--onemcp-bg-primary, #ffffff)",
                            border: "1px solid var(--onemcp-border, #e5e5e5)",
                            fontSize: 11,
                            fontFamily: "monospace",
                          }}
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Error message */}
          {error && (
            <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>
              ⚠️ {error.message}
            </div>
          )}

          {/* No tools available message */}
          {!isConnecting && Object.keys(mcpTools).length === 0 && (
            <div style={{ fontSize: 12, fontStyle: "italic", marginTop: 8 }}>
              No MCP tools available. Chat will work without tool access.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
