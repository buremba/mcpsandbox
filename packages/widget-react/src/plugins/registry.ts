/**
 * Plugin Registry for lazy-loading heavy dependencies
 *
 * Plugins are loaded from CDN at runtime only when needed.
 * This keeps the base bundle small while allowing rich features.
 */

export type PluginStatus = "idle" | "loading" | "loaded" | "error";

export interface Plugin<T = unknown> {
  name: string;
  status: PluginStatus;
  module: T | null;
  error: Error | null;
  load: () => Promise<T>;
}

export interface CustomPluginDef<T = unknown> {
  name: string;
  source: string;
  init?: (module: T) => void | Promise<void>;
  config?: Record<string, unknown>;
}

export interface PluginConfig {
  mermaid?: boolean;
  shiki?: boolean;
  custom?: CustomPluginDef[];
  // Future plugins can be added here
}

// CDN URLs for external dependencies
const CDN_URLS = {
  mermaid: "https://esm.sh/mermaid@11/dist/mermaid.esm.min.mjs",
  shiki: "https://esm.sh/shiki@1",
};

// Plugin instances
const plugins: Map<string, Plugin<any>> = new Map();

// Subscribers for plugin status changes
const subscribers: Map<string, Set<() => void>> = new Map();

/**
 * Subscribe to plugin status changes
 */
export function subscribeToPlugin(name: string, callback: () => void): () => void {
  if (!subscribers.has(name)) {
    subscribers.set(name, new Set());
  }
  subscribers.get(name)!.add(callback);
  return () => subscribers.get(name)?.delete(callback);
}

/**
 * Notify subscribers of plugin status change
 */
function notifySubscribers(name: string) {
  subscribers.get(name)?.forEach((cb) => cb());
}

/**
 * Get a plugin by name
 */
export function getPlugin<T>(name: string): Plugin<T> | undefined {
  return plugins.get(name) as Plugin<T> | undefined;
}

/**
 * Mermaid module type (loaded from CDN)
 */
interface MermaidModule {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string; bindFunctions?: (el: Element) => void }>;
}

/**
 * Shiki module type (loaded from CDN)
 */
interface ShikiModule {
  createHighlighter: (options: {
    themes: string[];
    langs: string[];
  }) => Promise<{
    codeToHtml: (code: string, options: { lang: string; themes: Record<string, string> }) => string;
    getLoadedLanguages: () => string[];
    loadLanguage: (lang: string) => Promise<void>;
  }>;
}

/**
 * Register the mermaid plugin
 */
export function registerMermaidPlugin(): Plugin<MermaidModule> {
  if (plugins.has("mermaid")) {
    return plugins.get("mermaid")!;
  }

  const plugin: Plugin<MermaidModule> = {
    name: "mermaid",
    status: "idle",
    module: null,
    error: null,
    load: async () => {
      if (plugin.status === "loaded" && plugin.module) {
        return plugin.module;
      }

      if (plugin.status === "loading") {
        // Wait for existing load to complete
        return new Promise((resolve, reject) => {
          const unsubscribe = subscribeToPlugin("mermaid", () => {
            if (plugin.status === "loaded" && plugin.module) {
              unsubscribe();
              resolve(plugin.module);
            } else if (plugin.status === "error") {
              unsubscribe();
              reject(plugin.error);
            }
          });
        });
      }

      plugin.status = "loading";
      notifySubscribers("mermaid");

      try {
        const module = await import(/* @vite-ignore */ CDN_URLS.mermaid);
        const mermaid = module.default;

        // Initialize mermaid with default config
        mermaid.initialize({
          theme: "dark",
          startOnLoad: false,
          securityLevel: "loose",
          fontFamily:
            "var(--onemcp-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
        });

        plugin.module = mermaid;
        plugin.status = "loaded";
        notifySubscribers("mermaid");
        return mermaid;
      } catch (error) {
        plugin.status = "error";
        plugin.error = error as Error;
        notifySubscribers("mermaid");
        throw error;
      }
    },
  };

  plugins.set("mermaid", plugin);
  return plugin;
}

/**
 * Register the shiki plugin
 */
export function registerShikiPlugin(): Plugin<ShikiModule> {
  if (plugins.has("shiki")) {
    return plugins.get("shiki")!;
  }

  const plugin: Plugin<ShikiModule> = {
    name: "shiki",
    status: "idle",
    module: null,
    error: null,
    load: async () => {
      if (plugin.status === "loaded" && plugin.module) {
        return plugin.module;
      }

      if (plugin.status === "loading") {
        return new Promise((resolve, reject) => {
          const unsubscribe = subscribeToPlugin("shiki", () => {
            if (plugin.status === "loaded" && plugin.module) {
              unsubscribe();
              resolve(plugin.module);
            } else if (plugin.status === "error") {
              unsubscribe();
              reject(plugin.error);
            }
          });
        });
      }

      plugin.status = "loading";
      notifySubscribers("shiki");

      try {
        const module = await import(/* @vite-ignore */ CDN_URLS.shiki);
        plugin.module = module;
        plugin.status = "loaded";
        notifySubscribers("shiki");
        return module;
      } catch (error) {
        plugin.status = "error";
        plugin.error = error as Error;
        notifySubscribers("shiki");
        throw error;
      }
    },
  };

  plugins.set("shiki", plugin);
  return plugin;
}

/**
 * Register a custom plugin from external source
 */
export function registerCustomPlugin<T>(def: CustomPluginDef<T>): Plugin<T> {
  if (plugins.has(def.name)) {
    return plugins.get(def.name)!;
  }

  const plugin: Plugin<T> = {
    name: def.name,
    status: "idle",
    module: null,
    error: null,
    load: async () => {
      if (plugin.status === "loaded" && plugin.module) {
        return plugin.module;
      }

      if (plugin.status === "loading") {
        return new Promise((resolve, reject) => {
          const unsubscribe = subscribeToPlugin(def.name, () => {
            if (plugin.status === "loaded" && plugin.module) {
              unsubscribe();
              resolve(plugin.module);
            } else if (plugin.status === "error") {
              unsubscribe();
              reject(plugin.error);
            }
          });
        });
      }

      plugin.status = "loading";
      notifySubscribers(def.name);

      try {
        const module = await import(/* @vite-ignore */ def.source);
        const moduleExport = module.default || module;

        // Call init function if provided
        if (def.init) {
          await def.init(moduleExport);
        }

        plugin.module = moduleExport;
        plugin.status = "loaded";
        notifySubscribers(def.name);
        return moduleExport;
      } catch (error) {
        plugin.status = "error";
        plugin.error = error as Error;
        notifySubscribers(def.name);
        throw error;
      }
    },
  };

  plugins.set(def.name, plugin);
  return plugin;
}

/**
 * Initialize plugins based on config
 */
export function initializePlugins(config: PluginConfig): void {
  if (config.mermaid) {
    registerMermaidPlugin();
  }
  if (config.shiki) {
    registerShikiPlugin();
  }
  // Register custom plugins
  if (config.custom) {
    for (const customPlugin of config.custom) {
      registerCustomPlugin(customPlugin);
    }
  }
}

/**
 * Check if a plugin is enabled and available
 */
export function isPluginEnabled(name: string): boolean {
  return plugins.has(name);
}

/**
 * Preload plugins (start loading in background)
 */
export function preloadPlugins(config: PluginConfig): void {
  if (config.mermaid) {
    const plugin = registerMermaidPlugin();
    plugin.load().catch(() => {}); // Ignore errors during preload
  }
  if (config.shiki) {
    const plugin = registerShikiPlugin();
    plugin.load().catch(() => {}); // Ignore errors during preload
  }
  // Preload custom plugins
  if (config.custom) {
    for (const customPlugin of config.custom) {
      const plugin = registerCustomPlugin(customPlugin);
      plugin.load().catch(() => {}); // Ignore errors during preload
    }
  }
}

/**
 * Get all registered plugin names
 */
export function getRegisteredPlugins(): string[] {
  return Array.from(plugins.keys());
}

/**
 * Unregister a plugin
 */
export function unregisterPlugin(name: string): boolean {
  const removed = plugins.delete(name);
  subscribers.delete(name);
  return removed;
}
