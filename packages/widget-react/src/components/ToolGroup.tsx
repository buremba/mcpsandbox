import React, { FC, useState, memo, PropsWithChildren, ReactNode } from "react";

/**
 * ToolGroup component for grouping tool calls in the UI
 * Provides a collapsible container for multiple tool invocations
 * 
 * @see https://www.assistant-ui.com/docs/ui/ToolGroup
 */
export const ToolGroup: FC<PropsWithChildren<{
  name?: string;
  isRunning?: boolean;
  className?: string;
}>> = memo(({ children, name, isRunning, className }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className={`onemcp-tool-group ${className || ""}`}>
      <button
        type="button"
        className="onemcp-tool-group-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="onemcp-tool-group-icon"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="onemcp-tool-group-label">
          {name || "Tool Calls"}
          {isRunning && (
            <span className="onemcp-tool-group-running">
              <span className="onemcp-tool-group-spinner" />
              Running...
            </span>
          )}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`onemcp-tool-group-chevron ${isOpen ? "onemcp-tool-group-chevron-open" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div className="onemcp-tool-group-content">
          {children}
        </div>
      )}
    </div>
  );
});

ToolGroup.displayName = "ToolGroup";

/**
 * ToolCall component for displaying individual tool invocations
 */
export const ToolCall: FC<{
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status?: "pending" | "running" | "complete" | "error";
  className?: string;
}> = memo(({ name, args, result, status = "complete", className }) => {
  const [showDetails, setShowDetails] = useState(false);

  const formatResult = (res: unknown): ReactNode => {
    if (res === undefined || res === null) return null;
    if (typeof res === "string") return res;
    try {
      return JSON.stringify(res, null, 2);
    } catch {
      return String(res);
    }
  };

  return (
    <div className={`onemcp-tool-call onemcp-tool-call-${status} ${className || ""}`}>
      <div className="onemcp-tool-call-header">
        <span className="onemcp-tool-call-status">
          {status === "running" && <span className="onemcp-tool-call-spinner" />}
          {status === "complete" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
          {status === "error" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          )}
          {status === "pending" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          )}
        </span>
        <span className="onemcp-tool-call-name">{name}</span>
        {(args || result !== undefined) && (
          <button
            type="button"
            className="onemcp-tool-call-toggle"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? "Hide" : "Show"} details
          </button>
        )}
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
                {formatResult(result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ToolCall.displayName = "ToolCall";
