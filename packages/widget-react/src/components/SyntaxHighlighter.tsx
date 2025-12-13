import React, { FC, useEffect, useRef, useState } from "react";
import type { SyntaxHighlighterProps as AUIProps } from "@assistant-ui/react-markdown";

/**
 * Props for the SyntaxHighlighter component
 */
export type HighlighterProps = {
  className?: string;
} & Pick<AUIProps, "node" | "components" | "language" | "code">;

// Dynamically load shiki highlighter
let shikiPromise: Promise<typeof import("react-shiki")> | null = null;

const loadShiki = () => {
  if (!shikiPromise) {
    shikiPromise = import("react-shiki");
  }
  return shikiPromise;
};

/**
 * SyntaxHighlighter component using react-shiki
 * Provides beautiful syntax highlighting for code blocks
 * 
 * Supports dual theme (light/dark) out of the box
 * 
 * @see https://www.assistant-ui.com/docs/ui/SyntaxHighlighting
 */
export const SyntaxHighlighter: FC<HighlighterProps> = ({
  code,
  language,
  className,
  node: _node,
  components: _components,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [ShikiComponent, setShikiComponent] = useState<any>(null);

  useEffect(() => {
    loadShiki().then((module) => {
      setShikiComponent(() => module.default);
      setIsLoaded(true);
    }).catch(console.error);
  }, []);

  // Fallback to simple code block while loading
  if (!isLoaded || !ShikiComponent) {
    return (
      <div className={`onemcp-shiki-highlighter ${className || ""}`}>
        <pre className="onemcp-md-pre">
          <code>{code.trim()}</code>
        </pre>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`onemcp-shiki-highlighter ${className || ""}`}>
      <ShikiComponent
        language={language}
        theme={{ dark: "github-dark", light: "github-light" }}
        addDefaultStyles={false}
        showLanguage={false}
      >
        {code.trim()}
      </ShikiComponent>
    </div>
  );
};

SyntaxHighlighter.displayName = "SyntaxHighlighter";
