import { useAssistantState } from "@assistant-ui/react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import mermaid from "mermaid";
import { FC, useEffect, useRef } from "react";

/**
 * Props for the MermaidDiagram component
 */
export type MermaidDiagramProps = SyntaxHighlighterProps & {
  className?: string;
};

// Configure mermaid options - use dark theme to match widget styling
mermaid.initialize({
  theme: "dark",
  startOnLoad: false,
  securityLevel: "loose",
  fontFamily: "var(--onemcp-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
});

/**
 * MermaidDiagram component for rendering Mermaid diagrams in chat messages
 * 
 * Supports various diagram types:
 * - Flowcharts and decision trees
 * - Sequence diagrams
 * - Gantt charts
 * - Class diagrams
 * - State diagrams
 * - Git graphs
 * - User journey maps
 * - Entity relationship diagrams
 * 
 * @see https://www.assistant-ui.com/docs/ui/Mermaid
 */
export const MermaidDiagram: FC<MermaidDiagramProps> = ({
  code,
  className,
  // Destructure unused props to avoid passing them to DOM
  node: _node,
  components: _components,
  language: _language,
}) => {
  const ref = useRef<HTMLPreElement>(null);

  // Detect when this code block is complete (streaming optimization)
  const isComplete = useAssistantState(({ part }) => {
    if (part.type !== "text") return false;

    // Find the position of this code block
    const codeIndex = part.text.indexOf(code);
    if (codeIndex === -1) return false;

    // Check if there are closing backticks immediately after this code block
    const afterCode = part.text.substring(codeIndex + code.length);

    // Look for the closing backticks - should be at the start or after a newline
    const closingBackticksMatch = afterCode.match(/^```|^\n```/);
    return closingBackticksMatch !== null;
  });

  useEffect(() => {
    if (!isComplete) return;

    (async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(id, code);
        if (ref.current) {
          ref.current.innerHTML = result.svg;
          result.bindFunctions?.(ref.current);
        }
      } catch (e) {
        console.warn("Failed to render Mermaid diagram:", e);
        // Show error state
        if (ref.current) {
          ref.current.innerHTML = `<div class="onemcp-mermaid-error">Failed to render diagram</div>`;
        }
      }
    })();
  }, [isComplete, code]);

  return (
    <pre
      ref={ref}
      className={`onemcp-mermaid-diagram ${className || ""}`}
    >
      <span className="onemcp-mermaid-loading">Drawing diagram...</span>
    </pre>
  );
};

MermaidDiagram.displayName = "MermaidDiagram";





