import React, { useRef, useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Widget } from '@onemcp/widget-react';
import '@onemcp/widget-react/styles.css';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import EmbedSection from './components/EmbedSection';
import FAQSection from './components/FAQSection';
import ResourcesSection from './components/ResourcesSection';
import Footer from './components/Footer';
import ProductPage from './pages/ProductPage';
import './index.css';

// Check if we have an OpenAI API key from environment
const openaiApiKey = import.meta.env.VITE_OPENAI_API_KEY;
const useOpenAI = openaiApiKey && openaiApiKey !== 'your-openai-api-key-here';

// Relay MCP Proxy endpoint (deployed on Cloudflare Workers)
const RELAY_MCP_PROXY_ENDPOINT = "https://relay-mcp.buremba.workers.dev/chat";

// Check if relay proxy token is available from environment
const relayProxyToken = import.meta.env.VITE_RELAY_PROXY_TOKEN;
const useRelayProxy = relayProxyToken && relayProxyToken.length > 10;

// Default widget configuration with MCP test server
const defaultWidgetConfig = {
  model: useRelayProxy ? {
    // Use secure proxy with JWE token (API key never exposed to client)
    provider: "openai",
    name: import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini",
    secure: {
      token: relayProxyToken,
      proxyEndpoint: RELAY_MCP_PROXY_ENDPOINT,
    },
  } : useOpenAI ? {
    provider: "openai",
    name: import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini",
    apiKey: openaiApiKey,
  } : {
    provider: "mock", // Mock provider for testing tool calls without API
  },
  mcps: [
    {
      name: "test",
      transport: "http",
      endpoint: "http://localhost:3456/mcp",
    }
  ],
  threads: true, // Enable thread support for conversation history
  widget: {
    title: "MCP Apps Test",
    placeholder: "Type a message...",
    position: "bottom-right",
    theme: { preset: "dark" },
    defaultOpen: true,
    systemPrompt: `You are a helpful assistant with access to interactive UI tools.

When the user asks to:
- "show counter" or "open counter" - call the 'test_counter' tool
- "show search" or "search form" - call the 'test_search_form' tool
- "set counter to X" - call 'test_counter' with initialValue: X

Always use the tools when relevant. Do not describe the tools - actually call them.`,
  },
  mcpApps: {
    onIntent: (intent, params) => {
      console.log('[MCP Apps] Intent:', intent, params);
    },
    onToolCall: (toolName, args, result) => {
      console.log('[MCP Apps] Tool call:', toolName, args, result);
    },
  },
};

function LandingPage({ widgetConfig, onConfigChange }) {
  return (
    <>
      <HeroSection />
      <EmbedSection config={widgetConfig} onConfigChange={onConfigChange} />
      <FAQSection />
      <ResourcesSection />
    </>
  );
}

// Get initial counter value from localStorage
const getStoredCounterValue = () => {
  try {
    const stored = localStorage.getItem('mcp-counter-value');
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
};

// Build config with dynamic system prompt
const buildWidgetConfig = (counterValue, onCounterSaved) => ({
  ...defaultWidgetConfig,
  widget: {
    ...defaultWidgetConfig.widget,
    systemPrompt: `You are a helpful assistant with access to interactive UI tools.

When the user asks to:
- "show counter" or "open counter" - call the 'test_counter' tool with initialValue: ${counterValue}
- "show search" or "search form" - call the 'test_search_form' tool
- "set counter to X" - call 'test_counter' with initialValue: X
- "what is the counter value" or "current counter" - the saved counter value is ${counterValue}

IMPORTANT: The current saved counter value is ${counterValue}. When showing the counter, always pass initialValue: ${counterValue} unless the user specifies a different value.

Always use the tools when relevant. Do not describe the tools - actually call them.`,
  },
  mcpApps: {
    onIntent: (intent, params) => {
      console.log('[MCP Apps] Intent:', intent, params);
      // Handle counter-saved intent - persist to localStorage and notify
      if (intent === 'counter-saved' && params.value !== undefined) {
        console.log('[MCP Apps] Saving counter value:', params.value);
        try {
          localStorage.setItem('mcp-counter-value', String(params.value));
          // Notify app to refresh widget with new value
          onCounterSaved?.(params.value);
        } catch (e) {
          console.warn('Failed to save to localStorage:', e);
        }
      }
    },
    onToolCall: (toolName, args, result) => {
      console.log('[MCP Apps] Tool call:', toolName, args, result);
    },
  },
});

function App() {
  const widgetRef = useRef(null);
  const [widgetKey, setWidgetKey] = useState(0);
  const [counterValue, setCounterValue] = useState(getStoredCounterValue);

  // Handler for when counter is saved - updates config and refreshes widget
  const handleCounterSaved = useCallback((value) => {
    setCounterValue(value);
    setWidgetKey(prev => prev + 1);
  }, []);

  // Build config with current counter value
  const widgetConfig = buildWidgetConfig(counterValue, handleCounterSaved);

  const handleConfigChange = useCallback((newConfig) => {
    // Config changes from the config builder are handled separately
    // For now, just refresh the widget
    setWidgetKey(prev => prev + 1);
  }, []);

  const handleStartChat = useCallback(() => {
    setTimeout(() => {
      widgetRef.current?.open();
    }, 100);
  }, []);

  // Check if we have a valid API key
  const hasApiKey = widgetConfig.model?.apiKey &&
    widgetConfig.model.apiKey !== 'sk-...' &&
    widgetConfig.model.apiKey.length > 10;

  // Check if using secure proxy (no client-side API key needed)
  const hasSecureProxy = widgetConfig.model?.secure?.token &&
    widgetConfig.model.secure.proxyEndpoint;

  // Check if using Chrome AI or mock provider (no API key needed)
  const isChromeAI = widgetConfig.model?.provider === 'chrome';
  const isMock = widgetConfig.model?.provider === 'mock';
  const showWidget = hasApiKey || hasSecureProxy || isChromeAI || isMock;

  return (
    <BrowserRouter>
      <div className="app-wrapper">
        <Navbar />
        <main>
          <Routes>
            <Route
              path="/"
              element={
                <LandingPage
                  widgetConfig={widgetConfig}
                  onConfigChange={handleConfigChange}
                />
              }
            />
            <Route path="/product" element={<ProductPage />} />
          </Routes>
        </main>
        <Footer />

        {/* OneMCP Widget */}
        {showWidget && (
          <Widget
            key={widgetKey}
            ref={widgetRef}
            config={widgetConfig}
            onOpen={() => console.log("Widget opened")}
            onClose={() => console.log("Widget closed")}
            onError={(error) => console.error("Widget error:", error)}
          />
        )}

        {/* Hint if no API key and not Chrome AI */}
        {!showWidget && (
          <div style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            padding: '12px 16px',
            backgroundColor: 'var(--bg-secondary, #161b22)',
            border: '1px solid var(--border-color, #30363d)',
            borderRadius: '8px',
            fontSize: '0.85rem',
            color: 'var(--text-secondary, #8b949e)',
            maxWidth: '280px',
            zIndex: 999998,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-primary, #c9d1d9)' }}>
              Try the Chat Widget
            </div>
            Use Chrome Built-in AI (no key needed), configure a secure proxy token, or enter an API key in the config.
          </div>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
