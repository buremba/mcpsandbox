/**
 * MCP Apps Host Bridge
 *
 * Simplified host-side bridge for communicating with MCP App iframes.
 * This handles the postMessage communication protocol without requiring
 * a full MCP Client instance.
 */

import type { UIActionCallbacks, UIResourceMeta } from './types.js';

/**
 * JSON-RPC 2.0 message structure
 */
interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Internal message types for lifecycle management
 */
type InternalMessageType =
  | 'UI_LIFECYCLE_IFRAME_READY'
  | 'UI_LIFECYCLE_IFRAME_RENDER_DATA'
  | 'UI_REQUEST_RENDER_DATA'
  | 'UI_SIZE_CHANGE'
  | 'UI_MESSAGE_RECEIVED'
  | 'UI_MESSAGE_RESPONSE';

/**
 * Internal message structure
 */
interface InternalMessage {
  type: InternalMessageType;
  messageId?: string;
  payload?: unknown;
}

/**
 * Options for the AppBridgeHost
 */
export interface AppBridgeHostOptions {
  /** Callbacks for handling UI actions */
  callbacks: UIActionCallbacks;
  /** Called when iframe is ready */
  onReady?: () => void;
  /** Called when iframe requests size change */
  onSizeChange?: (width: number | undefined, height: number) => void;
  /** MCP endpoint for tool execution */
  mcpEndpoint: string;
  /** HTML content to inject */
  htmlContent: string;
  /** Resource metadata for CSP */
  resourceMeta?: UIResourceMeta;
}

/**
 * Host-side bridge for MCP App iframe communication
 */
export class AppBridgeHost {
  private iframe: HTMLIFrameElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private options: AppBridgeHostOptions;
  private isReady = false;
  private pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private requestId = 0;

  constructor(options: AppBridgeHostOptions) {
    this.options = options;
  }

  /**
   * Connect to an iframe element
   */
  connect(iframe: HTMLIFrameElement): void {
    this.iframe = iframe;
    this.setupMessageHandler();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.iframe = null;
    this.isReady = false;
    this.pendingRequests.clear();
  }

  /**
   * Send tool input to the iframe
   */
  sendToolInput(args: Record<string, unknown>): void {
    this.sendNotification('ui/notifications/tool-input', { arguments: args });
  }

  /**
   * Send tool result to the iframe
   */
  sendToolResult(result: unknown, isError = false): void {
    this.sendNotification('ui/notifications/tool-result', {
      content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
      isError,
    });
  }

  /**
   * Send a notification to the iframe (no response expected)
   */
  private sendNotification(method: string, params: unknown): void {
    this.postMessage({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  /**
   * Send a request to the iframe and wait for response
   */
  private sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.postMessage({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  /**
   * Post a message to the iframe
   */
  private postMessage(message: JsonRpcMessage | InternalMessage): void {
    if (!this.iframe?.contentWindow) {
      console.warn('[AppBridgeHost] Cannot post message - iframe not connected');
      return;
    }

    // For srcdoc iframes, origin is 'null', so we use '*'
    this.iframe.contentWindow.postMessage(message, '*');
  }

  /**
   * Set up the message event handler
   */
  private setupMessageHandler(): void {
    this.messageHandler = (event: MessageEvent) => {
      // Verify message is from our iframe
      if (!this.iframe || event.source !== this.iframe.contentWindow) {
        return;
      }

      const data = event.data;

      // Handle internal lifecycle messages
      if (data?.type) {
        this.handleInternalMessage(data as InternalMessage);
        return;
      }

      // Handle JSON-RPC messages
      if (data?.jsonrpc === '2.0') {
        this.handleJsonRpcMessage(data as JsonRpcMessage);
      }
    };

    window.addEventListener('message', this.messageHandler);
  }

  /**
   * Handle internal lifecycle messages
   */
  private handleInternalMessage(message: InternalMessage): void {
    switch (message.type) {
      case 'UI_LIFECYCLE_IFRAME_READY':
        this.isReady = true;
        // Send render data to iframe
        this.postMessage({
          type: 'UI_LIFECYCLE_IFRAME_RENDER_DATA',
          payload: {
            htmlContent: this.options.htmlContent,
          },
        });
        this.options.onReady?.();
        break;

      case 'UI_REQUEST_RENDER_DATA':
        this.postMessage({
          type: 'UI_LIFECYCLE_IFRAME_RENDER_DATA',
          payload: {
            htmlContent: this.options.htmlContent,
          },
        });
        break;

      case 'UI_SIZE_CHANGE':
        const sizePayload = message.payload as { width?: number; height: number };
        this.options.onSizeChange?.(sizePayload.width, sizePayload.height);
        break;
    }
  }

  /**
   * Handle JSON-RPC messages from iframe
   */
  private async handleJsonRpcMessage(message: JsonRpcMessage): Promise<void> {
    // Handle responses to our requests
    if (message.id !== undefined && !message.method) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Handle requests from iframe
    if (message.method) {
      try {
        const result = await this.handleRequest(message.method, message.params);

        if (message.id !== undefined) {
          this.postMessage({
            jsonrpc: '2.0',
            id: message.id,
            result,
          });
        }
      } catch (error) {
        if (message.id !== undefined) {
          this.postMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      }
    }
  }

  /**
   * Handle a request from the iframe
   */
  private async handleRequest(method: string, params: unknown): Promise<unknown> {
    const p = params as Record<string, unknown> | undefined;

    switch (method) {
      case 'ui/initialize':
        // Respond with host capabilities
        return {
          protocolVersion: '2024-11-05',
          capabilities: {
            serverTools: {},
            openLinks: {},
            logging: {},
          },
          hostInfo: {
            name: 'onemcp-widget',
            version: '1.0.0',
          },
        };

      case 'tools/call':
        if (this.options.callbacks.onToolCall && p) {
          const toolParams = p as { name: string; arguments: Record<string, unknown> };
          return await this.options.callbacks.onToolCall(toolParams.name, toolParams.arguments);
        }
        throw new Error('Tool call handler not configured');

      case 'ui/open-link':
        if (this.options.callbacks.onOpenLink && p) {
          const linkParams = p as { url: string };
          this.options.callbacks.onOpenLink(linkParams.url);
          return {};
        }
        throw new Error('Open link handler not configured');

      case 'ui/message':
        if (this.options.callbacks.onMessage && p) {
          const msgParams = p as { content: string };
          this.options.callbacks.onMessage(msgParams.content);
          return {};
        }
        throw new Error('Message handler not configured');

      case 'ui/intent':
        if (this.options.callbacks.onIntent && p) {
          const intentParams = p as { intent: string; params: Record<string, unknown> };
          this.options.callbacks.onIntent(intentParams.intent, intentParams.params);
          return { acknowledged: true };
        }
        // Don't throw - intents are optional
        return { acknowledged: true };

      case 'ping':
        return {};

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
}

/**
 * Build a Content Security Policy string from resource metadata
 */
export function buildCSP(meta?: UIResourceMeta): string {
  const directives: string[] = [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ];

  if (meta?.csp?.connectDomains?.length) {
    directives.push(`connect-src ${meta.csp.connectDomains.join(' ')}`);
  }

  if (meta?.csp?.resourceDomains?.length) {
    const domains = meta.csp.resourceDomains.join(' ');
    directives.push(`img-src ${domains}`);
    directives.push(`font-src ${domains}`);
  }

  return directives.join('; ');
}

/**
 * Create sandbox attribute value
 * For srcdoc, we only allow scripts (no same-origin for security)
 */
export function getSandboxAttribute(): string {
  return 'allow-scripts';
}
