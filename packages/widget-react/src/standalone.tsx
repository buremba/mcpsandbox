/**
 * Standalone IIFE entry point for 1mcp Widget
 *
 * Usage:
 * <script>
 *   window.$1mcp = { model: { provider: 'chrome' }, ... };
 * </script>
 * <script src="https://1mcp.dev/widget.js" async></script>
 *
 * Or with data attribute:
 * <script src="https://1mcp.dev/widget.js" data-config="BASE64_ENCODED_JSON" async></script>
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './components/Widget';
import { safeValidateConfig } from './config/validation';
import type { WidgetConfig } from './config/types';

import './themes/variables.css';

/**
 * MCP Apps event listener type
 */
type MCPAppEventCallback<T extends unknown[]> = (...args: T) => void;

/**
 * Unsubscribe function returned by event listeners
 */
type Unsubscribe = () => void;

declare global {
  interface Window {
    $1mcp?: WidgetConfig;
    $1mcpWidget?: {
      open: () => void;
      close: () => void;
      toggle: () => void;
      destroy: () => void;
      // MCP Apps event subscriptions
      onMcpAppIntent: (callback: MCPAppEventCallback<[string, Record<string, unknown>]>) => Unsubscribe;
      onMcpAppToolCall: (callback: MCPAppEventCallback<[string, Record<string, unknown>, unknown]>) => Unsubscribe;
      onMcpAppMessage: (callback: MCPAppEventCallback<[string]>) => Unsubscribe;
      onMcpAppOpenLink: (callback: MCPAppEventCallback<[string]>) => Unsubscribe;
    };
  }
}

function getConfig(): WidgetConfig | null {
  if (window.$1mcp) {
    return window.$1mcp;
  }

  const scripts = document.querySelectorAll('script[src*="widget.js"], script[src*="1mcp"]');
  for (const script of scripts) {
    const dataConfig = script.getAttribute('data-config');
    if (dataConfig) {
      try {
        let jsonString: string;
        if (dataConfig.startsWith('{')) {
          jsonString = dataConfig;
        } else {
          jsonString = atob(dataConfig);
        }
        return JSON.parse(jsonString);
      } catch (e) {
        console.error('[1mcp] Failed to parse data-config:', e);
      }
    }
  }

  return null;
}

function init() {
  const config = getConfig();

  if (!config) {
    console.error('[1mcp] No configuration found. Set window.$1mcp or use data-config attribute.');
    return;
  }

  const validation = safeValidateConfig(config);
  if (!validation.success) {
    console.error('[1mcp] Invalid configuration:', validation.error);
    return;
  }

  const container = document.createElement('div');
  container.id = '1mcp-widget-root';
  document.body.appendChild(container);

  const root = createRoot(container);
  let widgetRef: { open: () => void; close: () => void; toggle: () => void } | null = null;

  // Event listeners for MCP Apps
  const intentListeners = new Set<MCPAppEventCallback<[string, Record<string, unknown>]>>();
  const toolCallListeners = new Set<MCPAppEventCallback<[string, Record<string, unknown>, unknown]>>();
  const messageListeners = new Set<MCPAppEventCallback<[string]>>();
  const openLinkListeners = new Set<MCPAppEventCallback<[string]>>();

  // Merge config callbacks with runtime listeners
  const mergedConfig: WidgetConfig = {
    ...validation.data,
    mcpApps: {
      ...validation.data.mcpApps,
      onIntent: (intent, params) => {
        // Call config callback first
        validation.data.mcpApps?.onIntent?.(intent, params);
        // Then notify all runtime listeners
        intentListeners.forEach(cb => cb(intent, params));
      },
      onToolCall: (toolName, args, result) => {
        validation.data.mcpApps?.onToolCall?.(toolName, args, result);
        toolCallListeners.forEach(cb => cb(toolName, args, result));
      },
      onMessage: (content) => {
        validation.data.mcpApps?.onMessage?.(content);
        messageListeners.forEach(cb => cb(content));
      },
      onOpenLink: (url) => {
        validation.data.mcpApps?.onOpenLink?.(url);
        openLinkListeners.forEach(cb => cb(url));
      },
    },
  };

  const WidgetWrapper = React.forwardRef<
    { open: () => void; close: () => void; toggle: () => void },
    { config: WidgetConfig }
  >(({ config }, ref) => {
    return (
      <Widget
        ref={(r) => {
          widgetRef = r;
          if (typeof ref === 'function') ref(r);
          else if (ref) ref.current = r;
        }}
        config={config}
        onError={(error) => console.error('[1mcp] Widget error:', error)}
      />
    );
  });

  WidgetWrapper.displayName = 'WidgetWrapper';

  root.render(<WidgetWrapper config={mergedConfig} />);

  window.$1mcpWidget = {
    open: () => widgetRef?.open(),
    close: () => widgetRef?.close(),
    toggle: () => widgetRef?.toggle(),
    destroy: () => {
      root.unmount();
      container.remove();
      intentListeners.clear();
      toolCallListeners.clear();
      messageListeners.clear();
      openLinkListeners.clear();
      delete window.$1mcpWidget;
    },
    // MCP Apps event subscriptions
    onMcpAppIntent: (callback) => {
      intentListeners.add(callback);
      return () => intentListeners.delete(callback);
    },
    onMcpAppToolCall: (callback) => {
      toolCallListeners.add(callback);
      return () => toolCallListeners.delete(callback);
    },
    onMcpAppMessage: (callback) => {
      messageListeners.add(callback);
      return () => messageListeners.delete(callback);
    },
    onMcpAppOpenLink: (callback) => {
      openLinkListeners.add(callback);
      return () => openLinkListeners.delete(callback);
    },
  };

  console.log('[1mcp] Widget initialized. Use window.$1mcpWidget to control it.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
