import React, { FC, useState, memo, PropsWithChildren } from "react";
import type { ReasoningMessagePartComponent } from "@assistant-ui/react";

/**
 * Simple collapsible component for reasoning content
 */
const ReasoningCollapsible: FC<PropsWithChildren<{
  isActive?: boolean;
  defaultOpen?: boolean;
}>> = ({ children, isActive, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="onemcp-reasoning-root">
      <button
        type="button"
        className="onemcp-reasoning-trigger"
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
          className="onemcp-reasoning-icon"
        >
          <path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 5.5 4 7v3h8v-3c2.5-1.5 4-4 4-7a8 8 0 0 0-8-8z" />
          <path d="M9 22h6" />
        </svg>
        <span className={`onemcp-reasoning-label ${isActive ? "onemcp-reasoning-active" : ""}`}>
          Reasoning
          {isActive && <span className="onemcp-reasoning-shimmer">Reasoning</span>}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`onemcp-reasoning-chevron ${isOpen ? "onemcp-reasoning-chevron-open" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div className="onemcp-reasoning-content">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Reasoning component for displaying AI thinking/reasoning messages
 * Shows reasoning in a collapsible UI with smooth animations
 * 
 * @see https://www.assistant-ui.com/docs/ui/Reasoning
 */
export const Reasoning: ReasoningMessagePartComponent = memo((props) => {
  const isActive = props.status.type === "running";
  // Access text from the part - ReasoningMessagePart has text property
  const text = (props as any).text || "";

  return (
    <ReasoningCollapsible isActive={isActive} defaultOpen={isActive}>
      <div className="onemcp-reasoning-text">
        {text}
      </div>
    </ReasoningCollapsible>
  );
});

Reasoning.displayName = "Reasoning";

/**
 * ReasoningGroup component for grouping consecutive reasoning parts
 * Automatically groups reasoning messages together
 */
export const ReasoningGroup: FC<PropsWithChildren<{
  isActive?: boolean;
}>> = memo(({ children, isActive }) => {
  return (
    <ReasoningCollapsible isActive={isActive} defaultOpen={isActive}>
      <div className="onemcp-reasoning-group">
        {children}
      </div>
    </ReasoningCollapsible>
  );
});

(ReasoningGroup as any).displayName = "ReasoningGroup";
