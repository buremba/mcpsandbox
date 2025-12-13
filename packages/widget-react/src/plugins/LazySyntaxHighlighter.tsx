import type { SyntaxHighlighterProps as AUIProps } from "@assistant-ui/react-markdown";
import { FC, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getPlugin,
  isPluginEnabled,
  registerShikiPlugin,
  subscribeToPlugin,
} from "./registry.js";

export type LazySyntaxHighlighterProps = {
  className?: string;
} & Pick<AUIProps, "node" | "components" | "language" | "code">;

// Cache for highlighted code
const highlightCache = new Map<string, string>();

// Shared highlighter instance
let highlighterPromise: Promise<any> | null = null;

/**
 * LazySyntaxHighlighter - Loads shiki from CDN only when needed
 *
 * This component is used when the shiki plugin is enabled.
 * Falls back to plain code when shiki is not available or still loading.
 */
export const LazySyntaxHighlighter: FC<LazySyntaxHighlighterProps> = ({
  code,
  language,
  className,
  node: _node,
  components: _components,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to plugin status
  const pluginStatus = useSyncExternalStore(
    (callback) => subscribeToPlugin("shiki", callback),
    () => getPlugin("shiki")?.status ?? "idle"
  );

  // Load and highlight
  useEffect(() => {
    const trimmedCode = code.trim();
    const cacheKey = `${language}:${trimmedCode}`;

    // Check cache first
    if (highlightCache.has(cacheKey)) {
      setHighlightedHtml(highlightCache.get(cacheKey)!);
      return;
    }

    // If shiki plugin is not enabled, don't try to load
    if (!isPluginEnabled("shiki")) {
      // Register on demand if code block is encountered
      registerShikiPlugin();
    }

    const plugin = getPlugin<any>("shiki");
    if (!plugin) return;

    // Load shiki
    plugin
      .load()
      .then(async (shiki) => {
        // Create highlighter if not exists
        if (!highlighterPromise) {
          highlighterPromise = shiki.createHighlighter({
            themes: ["github-dark", "github-light"],
            langs: [language || "text"],
          });
        }

        const highlighter = await highlighterPromise;

        // Load language if not already loaded
        const loadedLangs = highlighter.getLoadedLanguages();
        if (language && !loadedLangs.includes(language)) {
          try {
            await highlighter.loadLanguage(language as any);
          } catch {
            // Language not supported, use text
          }
        }

        // Highlight the code
        const html = highlighter.codeToHtml(trimmedCode, {
          lang: loadedLangs.includes(language || "") ? language : "text",
          themes: {
            dark: "github-dark",
            light: "github-light",
          },
        });

        // Cache and set
        highlightCache.set(cacheKey, html);
        setHighlightedHtml(html);
      })
      .catch((e) => {
        console.error("Failed to highlight code:", e);
        setError("Failed to load syntax highlighter");
      });
  }, [code, language]);

  // Render highlighted HTML
  if (highlightedHtml) {
    return (
      <div
        ref={containerRef}
        className={`onemcp-shiki-highlighter ${className || ""}`}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    );
  }

  // Loading or error state - show plain code
  return (
    <div className={`onemcp-shiki-highlighter ${className || ""}`}>
      <pre className="onemcp-md-pre">
        <code>{code.trim()}</code>
      </pre>
      {error && <span className="onemcp-highlighter-error">{error}</span>}
    </div>
  );
};

LazySyntaxHighlighter.displayName = "LazySyntaxHighlighter";
