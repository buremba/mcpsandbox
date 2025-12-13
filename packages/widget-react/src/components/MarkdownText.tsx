import React, { memo, useState, useMemo } from "react";
import {
  MarkdownTextPrimitive,
  type CodeHeaderProps,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { usePlugins, LazyMermaidDiagram, LazySyntaxHighlighter } from "../plugins/index.js";

/**
 * Copy to clipboard hook
 */
function useCopyToClipboard({ copiedDuration = 3000 }: { copiedDuration?: number } = {}) {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = (value: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
}

/**
 * Code header component with copy button
 */
function CodeHeader({ language, code }: CodeHeaderProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  return (
    <div className="onemcp-code-header">
      <span className="onemcp-code-language">{language}</span>
      <button
        type="button"
        className="onemcp-copy-button"
        onClick={() => code && copyToClipboard(code)}
        aria-label={isCopied ? "Copied" : "Copy code"}
      >
        {isCopied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

/**
 * Inline code component
 */
function Code({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const isCodeBlock = useIsMarkdownCodeBlock();
  return (
    <code
      className={isCodeBlock ? "onemcp-code-block" : "onemcp-inline-code"}
      {...props}
    >
      {children}
    </code>
  );
}

/**
 * Markdown component configuration
 */
const markdownComponents = {
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="onemcp-md-h1" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="onemcp-md-h2" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="onemcp-md-h3" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="onemcp-md-h4" {...props}>{children}</h4>
  ),
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="onemcp-md-p" {...props}>{children}</p>
  ),
  a: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="onemcp-md-a" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
  ),
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="onemcp-md-ul" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="onemcp-md-ol" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="onemcp-md-li" {...props}>{children}</li>
  ),
  blockquote: ({ children, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="onemcp-md-blockquote" {...props}>{children}</blockquote>
  ),
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="onemcp-md-pre" {...props}>{children}</pre>
  ),
  code: Code,
  CodeHeader,
  table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="onemcp-table-wrapper">
      <table className="onemcp-md-table" {...props}>{children}</table>
    </div>
  ),
  th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="onemcp-md-th" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="onemcp-md-td" {...props}>{children}</td>
  ),
  tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className="onemcp-md-tr" {...props}>{children}</tr>
  ),
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="onemcp-md-hr" {...props} />
  ),
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="onemcp-md-strong" {...props}>{children}</strong>
  ),
  em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="onemcp-md-em" {...props}>{children}</em>
  ),
};

/**
 * Plain code block component (no syntax highlighting)
 */
function PlainCodeBlock({ code }: { code: string; language?: string }) {
  return (
    <pre className="onemcp-md-pre">
      <code>{code.trim()}</code>
    </pre>
  );
}

/**
 * Plain mermaid placeholder (shows code when mermaid plugin not enabled)
 */
function PlainMermaidBlock({ code }: { code: string }) {
  return (
    <pre className="onemcp-mermaid-diagram onemcp-mermaid-disabled">
      <code>{code.trim()}</code>
      <span className="onemcp-mermaid-hint">Enable mermaid plugin to render diagram</span>
    </pre>
  );
}

/**
 * Markdown text component for rendering assistant messages
 * Features:
 * - GitHub Flavored Markdown (tables, strikethrough, etc.)
 * - Syntax highlighting via shiki (when plugin enabled)
 * - Mermaid diagram support (when plugin enabled)
 *
 * Plugins are lazy-loaded from CDN only when enabled in config.
 *
 * @see https://www.assistant-ui.com/docs/ui/Markdown
 * @see https://www.assistant-ui.com/docs/ui/SyntaxHighlighting
 * @see https://www.assistant-ui.com/docs/ui/Mermaid
 */
function MarkdownTextImpl() {
  const plugins = usePlugins();

  // Memoize components based on plugin config
  const { components, componentsByLanguage } = useMemo(() => {
    // Choose syntax highlighter based on plugin config
    const SyntaxHighlighterComponent = plugins.shiki
      ? LazySyntaxHighlighter
      : PlainCodeBlock;

    // Choose mermaid component based on plugin config
    const MermaidComponent = plugins.mermaid
      ? LazyMermaidDiagram
      : PlainMermaidBlock;

    return {
      components: {
        ...markdownComponents,
        SyntaxHighlighter: SyntaxHighlighterComponent,
      },
      componentsByLanguage: {
        mermaid: {
          SyntaxHighlighter: MermaidComponent,
        },
      },
    };
  }, [plugins.shiki, plugins.mermaid]);

  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="onemcp-markdown"
      components={components}
      componentsByLanguage={componentsByLanguage}
    />
  );
}

export const MarkdownText = memo(MarkdownTextImpl);

