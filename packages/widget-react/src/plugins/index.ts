export {
  type Plugin,
  type PluginConfig,
  type PluginStatus,
  getPlugin,
  initializePlugins,
  isPluginEnabled,
  preloadPlugins,
  registerMermaidPlugin,
  registerShikiPlugin,
  subscribeToPlugin,
} from "./registry.js";

export { LazyMermaidDiagram } from "./LazyMermaidDiagram.js";
export { LazySyntaxHighlighter } from "./LazySyntaxHighlighter.js";
export { PluginProvider, usePlugins } from "./context.js";
