import { useAssistantState } from "@assistant-ui/react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import { FC, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getPlugin,
  isPluginEnabled,
  registerMermaidPlugin,
  subscribeToPlugin,
} from "./registry.js";

export type LazyMermaidDiagramProps = SyntaxHighlighterProps & {
  className?: string;
};

/**
 * LazyMermaidDiagram - Loads mermaid from CDN only when needed
 *
 * This component is used when the mermaid plugin is enabled.
 * It loads mermaid lazily from CDN when the first mermaid code block is encountered.
 */
export const LazyMermaidDiagram: FC<LazyMermaidDiagramProps> = ({
  code,
  className,
  node: _node,
  components: _components,
  language: _language,
}) => {
  const ref = useRef<HTMLPreElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Subscribe to plugin status
  const pluginStatus = useSyncExternalStore(
    (callback) => subscribeToPlugin("mermaid", callback),
    () => getPlugin("mermaid")?.status ?? "idle"
  );

  // Detect when this code block is complete (streaming optimization)
  const isComplete = useAssistantState(({ part }) => {
    if (part.type !== "text") return false;

    const codeIndex = part.text.indexOf(code);
    if (codeIndex === -1) return false;

    const afterCode = part.text.substring(codeIndex + code.length);
    const closingBackticksMatch = afterCode.match(/^```|^\n```/);
    return closingBackticksMatch !== null;
  });

  // Load mermaid when needed
  useEffect(() => {
    if (!isComplete) return;
    if (!isPluginEnabled("mermaid")) {
      // If mermaid plugin is not enabled, register it on demand
      registerMermaidPlugin();
    }

    const plugin = getPlugin<typeof import("mermaid")["default"]>("mermaid");
    if (!plugin) return;

    plugin.load().catch((e) => {
      console.error("Failed to load mermaid:", e);
      setRenderError("Failed to load mermaid library");
    });
  }, [isComplete]);

  // Render diagram when mermaid is loaded
  useEffect(() => {
    if (!isComplete || pluginStatus !== "loaded") return;

    const plugin = getPlugin<typeof import("mermaid")["default"]>("mermaid");
    if (!plugin?.module) return;

    const mermaid = plugin.module;

    (async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(id, code);
        if (ref.current) {
          ref.current.innerHTML = result.svg;
          result.bindFunctions?.(ref.current);
          setRenderError(null);
        }
      } catch (e) {
        console.warn("Failed to render Mermaid diagram:", e);
        setRenderError("Failed to render diagram");
      }
    })();
  }, [isComplete, pluginStatus, code]);

  // Show loading/error states
  if (renderError) {
    return (
      <pre className={`onemcp-mermaid-diagram ${className || ""}`}>
        <div className="onemcp-mermaid-error">{renderError}</div>
      </pre>
    );
  }

  if (pluginStatus === "loading" || !isComplete) {
    return (
      <pre className={`onemcp-mermaid-diagram ${className || ""}`}>
        <span className="onemcp-mermaid-loading">
          {pluginStatus === "loading" ? "Loading mermaid..." : "Drawing diagram..."}
        </span>
      </pre>
    );
  }

  return (
    <pre ref={ref} className={`onemcp-mermaid-diagram ${className || ""}`}>
      <span className="onemcp-mermaid-loading">Drawing diagram...</span>
    </pre>
  );
};

LazyMermaidDiagram.displayName = "LazyMermaidDiagram";
