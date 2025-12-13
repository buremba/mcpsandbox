import React from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from '@onemcp/widget-react';
import '@onemcp/widget-react/themes/variables.css';

// Event logging helper
function addEvent(type: string, message: string) {
  const eventList = document.getElementById('eventList');
  if (!eventList) return;

  const firstEvent = eventList.querySelector('.event-item');
  if (firstEvent && firstEvent.textContent === 'Waiting for events...') {
    firstEvent.remove();
  }

  const item = document.createElement('div');
  item.className = `event-item event-${type}`;
  item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  eventList.insertBefore(item, eventList.firstChild);
}

// Widget configuration
const config = {
  model: {
    provider: 'chrome' as const,
  },
  mcps: [
    {
      name: 'test',
      transport: 'http' as const,
      endpoint: 'http://localhost:3456/mcp',
    },
  ],
  widget: {
    defaultOpen: true,
    title: 'MCP Apps Test',
    systemPrompt: `You are a helpful assistant with access to interactive UI tools.

When the user asks to:
- "show counter" or "open counter" - call the 'test_counter' tool
- "show search" or "search form" - call the 'test_search_form' tool
- "set counter to X" - call 'test_counter' with initialValue: X

Always use the tools when relevant.`,
  },
  mcpApps: {
    onIntent: (intent: string, params: Record<string, unknown>) => {
      console.log('[MCP Apps] Intent:', intent, params);
      addEvent('intent', `Intent: ${intent} - ${JSON.stringify(params)}`);
    },
    onToolCall: (toolName: string, args: Record<string, unknown>, result: unknown) => {
      console.log('[MCP Apps] Tool call:', toolName, args, result);
      addEvent('tool', `Tool: ${toolName}`);
    },
    onMessage: (content: string) => {
      console.log('[MCP Apps] Message:', content);
      addEvent('message', `Message: ${content}`);
    },
  },
};

function App() {
  return (
    <Widget
      config={config}
      onError={(error) => {
        console.error('[Widget Error]', error);
        addEvent('error', `Error: ${error.message}`);
      }}
    />
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
