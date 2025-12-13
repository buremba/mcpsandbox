import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { PluginsConfig } from "../config/types.js";
import { initializePlugins, preloadPlugins } from "./registry.js";

interface PluginContextValue {
  config: PluginsConfig;
}

const PluginContext = createContext<PluginContextValue>({
  config: {},
});

export interface PluginProviderProps {
  config?: PluginsConfig;
  children: ReactNode;
}

/**
 * PluginProvider - Provides plugin configuration to the widget tree
 *
 * When plugins are enabled, they are registered and optionally preloaded.
 */
export function PluginProvider({ config = {}, children }: PluginProviderProps) {
  // Initialize plugins on mount
  useEffect(() => {
    initializePlugins(config);
    // Preload plugins in background for faster first use
    preloadPlugins(config);
  }, [config]);

  const value = useMemo(() => ({ config }), [config]);

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}

/**
 * Hook to access plugin configuration
 */
export function usePlugins(): PluginsConfig {
  return useContext(PluginContext).config;
}
