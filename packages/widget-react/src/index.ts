// Main exports
export { Widget, type WidgetRef } from "./components/Widget.js";
export { FloatingButton } from "./components/FloatingButton.js";

// Markdown & Code exports
export { MarkdownText } from "./components/MarkdownText.js";
export { MermaidDiagram, type MermaidDiagramProps } from "./components/MermaidDiagram.js";
export { SyntaxHighlighter, type HighlighterProps } from "./components/SyntaxHighlighter.js";

// Reasoning exports
export { Reasoning, ReasoningGroup } from "./components/Reasoning.js";

// Tool UI exports
export { ToolGroup, ToolCall as ToolCallUI } from "./components/ToolGroup.js";

// Config exports
export type {
  WidgetConfig,
  WidgetProps,
  ModelConfig,
  ThemeConfig,
  WidgetUIConfig,
  PluginsConfig,
  CustomPlugin,
  AttachmentPlugin,
  Message,
  ToolCall,
} from "./config/types.js";
export { DEFAULT_WIDGET_CONFIG } from "./config/types.js";
export { validateConfig, safeValidateConfig } from "./config/validation.js";

// Plugin exports
export {
  registerCustomPlugin,
  registerMermaidPlugin,
  registerShikiPlugin,
  getPlugin,
  isPluginEnabled,
  getRegisteredPlugins,
  unregisterPlugin,
  subscribeToPlugin,
  type Plugin,
  type PluginStatus,
} from "./plugins/registry.js";

// Provider exports
export { providerRegistry } from "./providers/registry.js";
export { registerOpenAIProvider } from "./providers/openai.js";
export { registerAnthropicProvider } from "./providers/anthropic.js";
export { registerChromeProvider, isChromeAIAvailable } from "./providers/chrome.js";
export type { ProviderMetadata, ProviderFactory } from "./providers/types.js";

// Hooks exports
export { useWidget, type WidgetState, type WidgetController } from "./hooks/use-widget.js";
export { useWidgetRuntime } from "./hooks/use-runtime.js";
export {
  useThreadStorage,
  type UseThreadStorageOptions,
  type UseThreadStorageResult,
} from "./hooks/use-thread-storage.js";
export { useThreadRuntime, useThreadSync } from "./hooks/use-thread-runtime.js";

// MCP exports
export { connectToMCP, connectToMCPServers, type MCPConnection } from "./mcp/http-client.js";

// Thread UI exports
export { ThreadList, type ThreadListProps } from "./components/ThreadList.js";

// Import styles
import "./themes/variables.css";
