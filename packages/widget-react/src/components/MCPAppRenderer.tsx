/**
 * MCP App Renderer Component
 *
 * Renders MCP App UIs in sandboxed iframes with bidirectional communication.
 * Supports interactive tools where users can fill forms and trigger actions.
 */

import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { readResource, callMCPTool } from '../mcp/http-client.js';
import { AppBridgeHost, buildCSP, getSandboxAttribute } from '../mcp/app-bridge-host.js';
import type { UIResourceMeta, UIActionCallbacks } from '../mcp/types.js';

/**
 * Props for MCPAppRenderer component
 */
export interface MCPAppRendererProps {
  /** URI of the UI resource (ui://...) */
  resourceUri: string;
  /** MCP server endpoint for fetching resource and executing tools */
  endpoint: string;
  /** Initial tool arguments to pass to the UI */
  toolArgs?: Record<string, unknown>;
  /** Tool execution result to pass to the UI */
  toolResult?: unknown;
  /** Called when UI requests tool execution */
  onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Called when UI requests to open a link */
  onOpenLink?: (url: string) => void;
  /** Called when UI wants to add a message to chat */
  onMessage?: (content: string) => void;
  /** Called when UI sends a custom intent/event */
  onIntent?: (intent: string, params: Record<string, unknown>) => void;
  /** Called when UI requests size change */
  onSizeChange?: (width: number | undefined, height: number) => void;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Loading state component
 */
const LoadingState: React.FC = () => (
  <div className="onemcp-app-renderer-loading">
    <span className="onemcp-app-renderer-spinner" />
    <span>Loading UI...</span>
  </div>
);

/**
 * Error state component
 */
const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div className="onemcp-app-renderer-error">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
    <span>{message}</span>
  </div>
);

/**
 * MCP App Renderer - Renders interactive MCP App UIs in sandboxed iframes
 */
export const MCPAppRenderer: React.FC<MCPAppRendererProps> = memo(function MCPAppRenderer({
  resourceUri,
  endpoint,
  toolArgs,
  toolResult,
  onToolCall,
  onOpenLink,
  onMessage,
  onIntent,
  onSizeChange,
  className,
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridgeHost | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [resourceMeta, setResourceMeta] = useState<UIResourceMeta | undefined>();
  const [iframeHeight, setIframeHeight] = useState(200);

  // Handle tool calls from the UI
  const handleToolCall = useCallback(async (toolName: string, args: Record<string, unknown>) => {
    if (onToolCall) {
      return await onToolCall(toolName, args);
    }
    // Default: call via MCP endpoint
    return await callMCPTool(endpoint, toolName, args);
  }, [onToolCall, endpoint]);

  // Handle open link from UI
  const handleOpenLink = useCallback((url: string) => {
    if (onOpenLink) {
      onOpenLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [onOpenLink]);

  // Handle message from UI
  const handleMessage = useCallback((content: string) => {
    onMessage?.(content);
  }, [onMessage]);

  // Handle custom intent from UI
  const handleIntent = useCallback((intent: string, params: Record<string, unknown>) => {
    onIntent?.(intent, params);
  }, [onIntent]);

  // Handle size change from UI
  const handleSizeChange = useCallback((width: number | undefined, height: number) => {
    setIframeHeight(height);
    onSizeChange?.(width, height);
  }, [onSizeChange]);

  // Fetch the UI resource content
  useEffect(() => {
    let cancelled = false;

    async function fetchResource() {
      try {
        setStatus('loading');
        setError(null);

        const resource = await readResource(endpoint, resourceUri);

        if (cancelled) return;

        setHtmlContent(resource.content);
        setResourceMeta(resource.meta);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;

        console.error('[MCPAppRenderer] Failed to fetch resource:', err);
        setError(err instanceof Error ? err.message : 'Failed to load UI');
        setStatus('error');
      }
    }

    fetchResource();

    return () => {
      cancelled = true;
    };
  }, [endpoint, resourceUri]);

  // Set up the bridge when iframe loads
  useEffect(() => {
    if (status !== 'ready' || !htmlContent || !iframeRef.current) {
      return;
    }

    const callbacks: UIActionCallbacks = {
      onToolCall: handleToolCall,
      onOpenLink: handleOpenLink,
      onMessage: handleMessage,
      onIntent: handleIntent,
    };

    const bridge = new AppBridgeHost({
      callbacks,
      mcpEndpoint: endpoint,
      htmlContent,
      resourceMeta,
      onReady: () => {
        console.log('[MCPAppRenderer] Iframe ready');

        // Send initial tool args if available
        if (toolArgs) {
          bridge.sendToolInput(toolArgs);
        }

        // Send tool result if available
        if (toolResult !== undefined) {
          bridge.sendToolResult(toolResult);
        }
      },
      onSizeChange: handleSizeChange,
    });

    bridge.connect(iframeRef.current);
    bridgeRef.current = bridge;

    return () => {
      bridge.disconnect();
      bridgeRef.current = null;
    };
  }, [
    status,
    htmlContent,
    resourceMeta,
    endpoint,
    toolArgs,
    toolResult,
    handleToolCall,
    handleOpenLink,
    handleMessage,
    handleIntent,
    handleSizeChange,
  ]);

  // Send tool args when they change
  useEffect(() => {
    if (bridgeRef.current && toolArgs) {
      bridgeRef.current.sendToolInput(toolArgs);
    }
  }, [toolArgs]);

  // Send tool result when it changes
  useEffect(() => {
    if (bridgeRef.current && toolResult !== undefined) {
      bridgeRef.current.sendToolResult(toolResult);
    }
  }, [toolResult]);

  // Build CSP meta tag for the srcdoc
  const csp = buildCSP(resourceMeta);

  // Wrap HTML content with necessary boilerplate for iframe communication
  const wrappedHtml = htmlContent ? wrapHtmlContent(htmlContent, csp) : '';

  return (
    <div className={`onemcp-app-renderer ${className || ''}`}>
      {status === 'loading' && <LoadingState />}
      {status === 'error' && error && <ErrorState message={error} />}
      {status === 'ready' && htmlContent && (
        <iframe
          ref={iframeRef}
          srcDoc={wrappedHtml}
          sandbox={getSandboxAttribute()}
          style={{
            width: '100%',
            height: iframeHeight,
            border: 'none',
            display: 'block',
          }}
          title="MCP App UI"
        />
      )}
    </div>
  );
});

/**
 * Wrap HTML content with iframe communication boilerplate
 */
function wrapHtmlContent(html: string, csp: string): string {
  // Check if HTML already has proper structure
  const hasHtml = /<html/i.test(html);
  const hasHead = /<head/i.test(html);
  const hasBody = /<body/i.test(html);

  // Bridge script to inject into the iframe
  const bridgeScript = `
<script>
(function() {
  // Notify host that iframe is ready
  window.parent.postMessage({ type: 'UI_LIFECYCLE_IFRAME_READY' }, '*');

  // JSON-RPC message ID counter
  let messageId = 0;
  const pendingRequests = new Map();

  // Listen for messages from host
  window.addEventListener('message', function(event) {
    const data = event.data;

    // Handle internal messages
    if (data?.type === 'UI_LIFECYCLE_IFRAME_RENDER_DATA') {
      // Render data received - app can use this
      window.dispatchEvent(new CustomEvent('mcp-render-data', { detail: data.payload }));
      return;
    }

    // Handle JSON-RPC messages
    if (data?.jsonrpc === '2.0') {
      // Response to our request
      if (data.id !== undefined && !data.method) {
        const pending = pendingRequests.get(data.id);
        if (pending) {
          pendingRequests.delete(data.id);
          if (data.error) {
            pending.reject(new Error(data.error.message));
          } else {
            pending.resolve(data.result);
          }
        }
        return;
      }

      // Notification from host
      if (data.method) {
        window.dispatchEvent(new CustomEvent('mcp-notification', {
          detail: { method: data.method, params: data.params }
        }));
      }
    }
  });

  // MCP App API exposed to the iframe content
  window.mcpApp = {
    // Call a server tool
    callServerTool: function(toolName, args) {
      return sendRequest('tools/call', { name: toolName, arguments: args || {} });
    },

    // Open an external link
    openLink: function(url) {
      return sendRequest('ui/open-link', { url: url });
    },

    // Send a message to the chat
    sendMessage: function(content) {
      return sendRequest('ui/message', { content: content });
    },

    // Send a custom intent/event to the host
    sendIntent: function(intent, params) {
      return sendRequest('ui/intent', { intent: intent, params: params || {} });
    },

    // Request size change
    requestSizeChange: function(width, height) {
      window.parent.postMessage({
        type: 'UI_SIZE_CHANGE',
        payload: { width: width, height: height }
      }, '*');
    },

    // Listen for tool input
    onToolInput: function(callback) {
      window.addEventListener('mcp-notification', function(e) {
        if (e.detail.method === 'ui/notifications/tool-input') {
          callback(e.detail.params);
        }
      });
    },

    // Listen for tool result
    onToolResult: function(callback) {
      window.addEventListener('mcp-notification', function(e) {
        if (e.detail.method === 'ui/notifications/tool-result') {
          callback(e.detail.params);
        }
      });
    }
  };

  function sendRequest(method, params) {
    return new Promise(function(resolve, reject) {
      const id = ++messageId;
      pendingRequests.set(id, { resolve: resolve, reject: reject });

      window.parent.postMessage({
        jsonrpc: '2.0',
        id: id,
        method: method,
        params: params
      }, '*');

      // Timeout after 30s
      setTimeout(function() {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timed out'));
        }
      }, 30000);
    });
  }
})();
</script>`;

  // CSP meta tag
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  if (hasHtml && hasHead) {
    // Insert CSP and bridge into existing head
    return html
      .replace(/<head([^>]*)>/i, `<head$1>${cspMeta}`)
      .replace(/<\/head>/i, `${bridgeScript}</head>`);
  }

  if (hasHtml && hasBody) {
    // Has HTML but no head, add head
    return html.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${cspMeta}${bridgeScript}</head>`
    );
  }

  // Wrap completely
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMeta}
  ${bridgeScript}
</head>
<body>
${html}
</body>
</html>`;
}

export default MCPAppRenderer;
