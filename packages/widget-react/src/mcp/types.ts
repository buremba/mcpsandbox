/**
 * MCP Apps UI Types
 * Types for MCP Apps (SEP-1865) UI resource handling
 */

/**
 * UI Resource metadata from MCP server
 */
export interface UIResourceMeta {
  /** Content Security Policy settings */
  csp?: {
    /** Allowed domains for fetch/XHR/WebSocket */
    connectDomains?: string[];
    /** Allowed domains for images, scripts, styles, fonts */
    resourceDomains?: string[];
  };
  /** Dedicated sandbox origin for the UI */
  domain?: string;
  /** Whether UI prefers a visual border */
  prefersBorder?: boolean;
}

/**
 * UI Resource from MCP server
 */
export interface UIResource {
  /** Resource URI (must start with ui://) */
  uri: string;
  /** Human-readable name */
  name: string;
  /** Description of the resource */
  description?: string;
  /** MIME type (should be text/html;profile=mcp-app) */
  mimeType: string;
  /** Resource metadata */
  _meta?: {
    ui?: UIResourceMeta;
  };
}

/**
 * Tool metadata that may include UI resource reference
 */
export interface ToolUIMetadata {
  /** URI of the UI resource to render for this tool */
  'ui/resourceUri'?: string;
}

/**
 * Extended tool definition with UI metadata
 */
export interface MCPToolWithMeta {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  _meta?: ToolUIMetadata;
}

/**
 * Result from reading a UI resource
 */
export interface UIResourceContent {
  /** HTML content (may be base64 encoded) */
  content: string;
  /** Content encoding */
  encoding?: 'base64' | 'utf-8';
  /** MIME type */
  mimeType: string;
  /** Resource metadata */
  meta?: UIResourceMeta;
}

/**
 * UI Action types that can be sent from iframe to host
 */
export type UIActionType = 'tool' | 'prompt' | 'link' | 'intent' | 'notify';

/**
 * Tool call action from UI
 */
export interface UIActionToolCall {
  type: 'tool';
  payload: {
    toolName: string;
    params: Record<string, unknown>;
  };
  messageId?: string;
}

/**
 * Open link action from UI
 */
export interface UIActionLink {
  type: 'link';
  payload: {
    url: string;
  };
  messageId?: string;
}

/**
 * Message action from UI (add content to chat)
 */
export interface UIActionMessage {
  type: 'message';
  payload: {
    content: string;
  };
  messageId?: string;
}

/**
 * Custom intent/event action from UI
 */
export interface UIActionIntent {
  type: 'intent';
  payload: {
    intent: string;
    params: Record<string, unknown>;
  };
  messageId?: string;
}

/**
 * Notification action from UI
 */
export interface UIActionNotify {
  type: 'notify';
  payload: {
    message: string;
  };
  messageId?: string;
}

/**
 * Union of all UI action types
 */
export type UIAction =
  | UIActionToolCall
  | UIActionLink
  | UIActionMessage
  | UIActionIntent
  | UIActionNotify;

/**
 * Callbacks for handling UI actions
 */
export interface UIActionCallbacks {
  /** Handle tool call from UI */
  onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Handle open link request */
  onOpenLink?: (url: string) => void;
  /** Handle message to be added to chat */
  onMessage?: (content: string) => void;
  /** Handle custom intent/event */
  onIntent?: (intent: string, params: Record<string, unknown>) => void;
  /** Handle notification */
  onNotify?: (message: string) => void;
}

/**
 * PostMessage types for iframe communication
 */
export type IframeMessageType =
  | 'UI_LIFECYCLE_IFRAME_READY'
  | 'UI_LIFECYCLE_IFRAME_RENDER_DATA'
  | 'UI_REQUEST_RENDER_DATA'
  | 'UI_SIZE_CHANGE'
  | 'UI_ACTION'
  | 'UI_ACTION_RESPONSE';

/**
 * Base message structure for iframe communication
 */
export interface IframeMessage {
  type: IframeMessageType;
  messageId?: string;
  payload?: unknown;
}

/**
 * Size change message from iframe
 */
export interface IframeSizeChangeMessage extends IframeMessage {
  type: 'UI_SIZE_CHANGE';
  payload: {
    width?: number;
    height: number;
  };
}

/**
 * Action message from iframe
 */
export interface IframeActionMessage extends IframeMessage {
  type: 'UI_ACTION';
  payload: UIAction;
}
