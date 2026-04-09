import type { MCPServerConfig, Policy } from "@onemcp/shared";

/**
 * Secure proxy configuration for API key protection
 * API key is encrypted in a JWE token server-side
 */
export interface SecureProxyConfig {
  /** JWE encrypted token containing API key and rate limits */
  token: string;
  /** Proxy endpoint URL (e.g., 'https://relay-mcp.workers.dev/chat') */
  proxyEndpoint: string;
}

/**
 * Rate limit exceeded event info
 */
export interface RateLimitInfo {
  /** Reason for rate limit */
  reason: string;
  /** When the rate limit resets (minute window) */
  minuteResetAt: number;
  /** When the rate limit resets (day window) */
  dayResetAt: number;
  /** Current usage */
  usage: {
    tokensUsedToday: number;
    requestsToday: number;
    requestsThisMinute: number;
  };
}

/**
 * Auth hooks for secure proxy usage tracking
 */
export interface AuthHooksConfig {
  /** Get the current user ID for rate limiting */
  getUserId?: () => string | Promise<string>;
  /** Called when rate limit is exceeded */
  onRateLimitExceeded?: (info: RateLimitInfo) => void;
  /** Called when token is about to expire (optional) */
  onTokenExpiring?: (expiresAt: number) => void;
}

/**
 * LLM Model configuration
 */
export interface ModelConfig {
  /** LLM provider: 'openai', 'anthropic', 'chrome', or custom */
  provider: "openai" | "anthropic" | "chrome" | string;
  /** API key (required for openai/anthropic when not using secure proxy) */
  apiKey?: string;
  /** Model name (e.g., 'gpt-4o-mini', 'claude-3-5-sonnet-20241022') */
  name?: string;
  /** Custom API endpoint */
  baseUrl?: string;
  /** Secure proxy configuration (alternative to apiKey) */
  secure?: SecureProxyConfig;
}

/**
 * Theme configuration
 */
export interface ThemeConfig {
  /** Theme preset: 'light', 'dark', 'minimal' */
  preset?: "light" | "dark" | "minimal";
  /** CSS custom property overrides */
  variables?: Record<string, string>;
  /** Additional custom CSS */
  customCss?: string;
}

/**
 * Custom plugin definition for user-defined plugins
 */
export interface CustomPlugin<T = unknown> {
  /** Unique plugin name */
  name: string;
  /** CDN URL or module path to load the plugin from */
  source: string;
  /** Optional initialization function called after the module loads */
  init?: (module: T) => void | Promise<void>;
  /** Optional configuration to pass to the plugin */
  config?: Record<string, unknown>;
}

/**
 * Attachment plugin for message attachments (files, images, etc.)
 */
export interface AttachmentPlugin {
  /** Unique name for this attachment type */
  name: string;
  /** File types this plugin handles (e.g., 'image/*', '.pdf', '.docx') */
  accept?: string[];
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Handler to process the attachment before sending */
  onAttach?: (file: File) => Promise<{ content: string; metadata?: Record<string, unknown> }>;
  /** Custom UI component for rendering the attachment preview */
  renderPreview?: React.ComponentType<{ file: File; onRemove: () => void }>;
}

/**
 * Plugin configuration for lazy-loaded features
 * These are loaded from CDN only when enabled and needed
 */
export interface PluginsConfig {
  /** Enable mermaid diagrams (loaded from CDN) */
  mermaid?: boolean;
  /** Enable syntax highlighting with shiki (loaded from CDN) */
  shiki?: boolean;
  /** Custom plugins to load */
  custom?: CustomPlugin[];
  /** Attachment plugins for file uploads */
  attachments?: AttachmentPlugin[];
}

/**
 * Widget UI configuration
 */
export interface WidgetUIConfig {
  /** Theme settings */
  theme?: ThemeConfig;
  /** Widget position on screen */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Open by default */
  defaultOpen?: boolean;
  /** System prompt for the assistant */
  systemPrompt?: string;
  /** Input placeholder text */
  placeholder?: string;
  /** Chat title */
  title?: string;
  /** Plugins to enable (loaded from CDN when needed) */
  plugins?: PluginsConfig;
}

/**
 * Message type for callbacks
 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

/**
 * Tool call type for callbacks
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "complete" | "error";
}

/**
 * MCP Apps event callbacks
 * These are called when the embedded MCP App UI triggers events
 */
export interface MCPAppsCallbacks {
  /** Called when UI sends a custom intent/event */
  onIntent?: (intent: string, params: Record<string, unknown>) => void;
  /** Called when UI executes a tool (with name, args, and result) */
  onToolCall?: (toolName: string, args: Record<string, unknown>, result: unknown) => void;
  /** Called when UI wants to add a message to chat */
  onMessage?: (content: string) => void;
  /** Called when UI requests to open a link */
  onOpenLink?: (url: string) => void;
}

/**
 * Widget configuration - extends RelayConfig with model
 */
export interface WidgetConfig {
  /** LLM model configuration (required) */
  model: ModelConfig;

  /** MCP servers to connect to (from RelayConfig) */
  mcps?: MCPServerConfig[];

  /** Sandbox policy (from RelayConfig) */
  policy?: Policy;

  /** Widget UI configuration */
  widget?: WidgetUIConfig;

  /**
   * Enable thread/conversation history support.
   * When enabled, storage is automatically selected:
   * - If relay server is connected: uses server-side storage
   * - Otherwise: uses IndexedDB (with localStorage fallback)
   */
  threads?: boolean;

  /** Initial prompt to send when widget opens */
  initialPrompt?: string;

  /**
   * MCP Apps event callbacks
   * Called when embedded MCP App UIs trigger events
   */
  mcpApps?: MCPAppsCallbacks;

  /**
   * Auth hooks for secure proxy usage tracking
   * Used when model.secure is configured
   */
  auth?: AuthHooksConfig;
}

/**
 * Widget component props
 */
export interface WidgetProps {
  /** Widget configuration */
  config: WidgetConfig;

  /** Called when widget opens */
  onOpen?: () => void;

  /** Called when widget closes */
  onClose?: () => void;

  /** Called when a message is sent/received */
  onMessage?: (message: Message) => void;

  /** Called when a tool is called */
  onToolCall?: (toolCall: ToolCall) => void;

  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Default widget configuration
 */
export const DEFAULT_WIDGET_CONFIG: Partial<WidgetUIConfig> = {
  position: "bottom-right",
  defaultOpen: false,
  placeholder: "Type a message...",
  title: "AI Assistant",
  theme: {
    preset: "light",
  },
};
