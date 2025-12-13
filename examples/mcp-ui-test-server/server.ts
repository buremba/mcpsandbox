/**
 * MCP UI Test Server
 *
 * A simple MCP server that demonstrates UI resources for testing
 * the widget's MCP Apps support.
 */

import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Store session state
let sessionId = 0;
const sessions = new Map<number, { initialized: boolean }>();

// UI HTML templates
const counterUI = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      background: #f8f9fa;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
    }
    h2 { color: #333; margin-bottom: 16px; }
    .counter {
      font-size: 48px;
      font-weight: bold;
      color: #0066ff;
      margin: 20px 0;
    }
    .buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-top: 20px;
    }
    button {
      padding: 12px 24px;
      font-size: 16px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .primary {
      background: #0066ff;
      color: white;
    }
    .primary:hover { background: #0052cc; }
    .secondary {
      background: #e9ecef;
      color: #333;
    }
    .secondary:hover { background: #dee2e6; }
    .status {
      margin-top: 16px;
      font-size: 14px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Interactive Counter</h2>
    <p>This UI is served via MCP Apps protocol</p>
    <div class="counter" id="count">0</div>
    <div class="buttons">
      <button class="secondary" onclick="decrement()">- Decrease</button>
      <button class="primary" onclick="increment()">+ Increase</button>
    </div>
    <div class="buttons">
      <button class="secondary" onclick="reset()">Reset</button>
      <button class="primary" onclick="saveAndNotify()">Save & Notify Host</button>
    </div>
    <div class="status" id="status">Ready</div>
  </div>

  <script>
    let count = 0;

    // Wait for MCP bridge to be available
    function waitForBridge() {
      return new Promise((resolve) => {
        if (window.mcpApp) {
          resolve(window.mcpApp);
        } else {
          const check = setInterval(() => {
            if (window.mcpApp) {
              clearInterval(check);
              resolve(window.mcpApp);
            }
          }, 50);
        }
      });
    }

    // Initialize
    waitForBridge().then((app) => {
      // Listen for tool input
      app.onToolInput((data) => {
        console.log('Tool input received:', data);
        if (data.arguments?.initialValue) {
          count = parseInt(data.arguments.initialValue) || 0;
          updateDisplay();
        }
        setStatus('Tool input received');
      });

      // Listen for tool result
      app.onToolResult((data) => {
        console.log('Tool result received:', data);
        setStatus('Tool result: ' + JSON.stringify(data));
      });

      setStatus('Bridge connected');
    });

    function updateDisplay() {
      document.getElementById('count').textContent = count;
    }

    function increment() {
      count++;
      updateDisplay();
      setStatus('Incremented to ' + count);
    }

    function decrement() {
      count--;
      updateDisplay();
      setStatus('Decremented to ' + count);
    }

    function reset() {
      count = 0;
      updateDisplay();
      setStatus('Reset to 0');
    }

    async function saveAndNotify() {
      setStatus('Sending intent to host...');
      try {
        await window.mcpApp.sendIntent('counter-saved', { value: count, timestamp: Date.now() });
        setStatus('Intent sent successfully!');
      } catch (err) {
        setStatus('Error: ' + err.message);
      }
    }

    function setStatus(msg) {
      document.getElementById('status').textContent = msg;
    }

    // Auto-resize
    function updateSize() {
      const height = document.body.scrollHeight;
      if (window.mcpApp) {
        window.mcpApp.requestSizeChange(undefined, height);
      }
    }

    // Call after DOM ready
    setTimeout(updateSize, 100);
  </script>
</body>
</html>
`;

const formUI = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      background: #f8f9fa;
    }
    .form-container {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    h2 { color: #333; margin-bottom: 16px; }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #333;
    }
    input, select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      font-size: 14px;
    }
    input:focus, select:focus {
      outline: none;
      border-color: #0066ff;
      box-shadow: 0 0 0 3px rgba(0,102,255,0.1);
    }
    button {
      width: 100%;
      padding: 12px;
      background: #0066ff;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #0052cc; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .result {
      margin-top: 16px;
      padding: 12px;
      background: #e8f4fd;
      border-radius: 8px;
      font-size: 14px;
      display: none;
    }
    .result.show { display: block; }
    .result.error { background: #fee; color: #c00; }
  </style>
</head>
<body>
  <div class="form-container">
    <h2>Search Tool UI</h2>
    <form id="searchForm">
      <div class="form-group">
        <label for="query">Search Query</label>
        <input type="text" id="query" placeholder="Enter search term..." required>
      </div>
      <div class="form-group">
        <label for="category">Category</label>
        <select id="category">
          <option value="all">All</option>
          <option value="docs">Documentation</option>
          <option value="code">Code</option>
          <option value="issues">Issues</option>
        </select>
      </div>
      <button type="submit" id="submitBtn">Search</button>
    </form>
    <div class="result" id="result"></div>
  </div>

  <script>
    const form = document.getElementById('searchForm');
    const resultDiv = document.getElementById('result');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const query = document.getElementById('query').value;
      const category = document.getElementById('category').value;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Searching...';
      resultDiv.className = 'result';
      resultDiv.style.display = 'none';

      try {
        // Call the search tool via MCP bridge
        const result = await window.mcpApp.callServerTool('search', {
          query,
          category
        });

        resultDiv.textContent = 'Results: ' + (typeof result === 'string' ? result : JSON.stringify(result, null, 2));
        resultDiv.className = 'result show';
      } catch (err) {
        resultDiv.textContent = 'Error: ' + err.message;
        resultDiv.className = 'result show error';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Search';
      }
    });

    // Auto-resize
    setTimeout(() => {
      if (window.mcpApp) {
        window.mcpApp.requestSizeChange(undefined, document.body.scrollHeight);
      }
    }, 100);
  </script>
</body>
</html>
`;

// JSON-RPC handler
app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  console.log(`[MCP] ${method}`, params ? JSON.stringify(params).slice(0, 100) : '');

  try {
    let result: any;

    switch (method) {
      case 'initialize':
        sessionId++;
        sessions.set(sessionId, { initialized: true });
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: 'mcp-ui-test-server',
            version: '1.0.0',
          },
        };
        break;

      case 'tools/list':
        result = {
          tools: [
            {
              name: 'counter',
              description: 'Interactive counter with UI',
              inputSchema: {
                type: 'object',
                properties: {
                  initialValue: {
                    type: 'number',
                    description: 'Initial counter value',
                  },
                },
              },
              _meta: {
                'ui/resourceUri': 'ui://counter',
              },
            },
            {
              name: 'search_form',
              description: 'Search form with interactive UI',
              inputSchema: {
                type: 'object',
                properties: {},
              },
              _meta: {
                'ui/resourceUri': 'ui://search-form',
              },
            },
            {
              name: 'search',
              description: 'Perform a search (called by UI)',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  category: { type: 'string' },
                },
                required: ['query'],
              },
            },
          ],
        };
        break;

      case 'tools/call':
        const toolName = params?.name;
        const args = params?.arguments || {};

        if (toolName === 'counter') {
          result = {
            content: [
              {
                type: 'text',
                text: `Counter initialized with value: ${args.initialValue || 0}`,
              },
            ],
          };
        } else if (toolName === 'search_form') {
          result = {
            content: [
              {
                type: 'text',
                text: 'Search form displayed. Enter your query in the UI.',
              },
            ],
          };
        } else if (toolName === 'search') {
          // Simulate search
          await new Promise((r) => setTimeout(r, 500));
          result = {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  query: args.query,
                  category: args.category || 'all',
                  results: [
                    { title: `Result 1 for "${args.query}"`, score: 0.95 },
                    { title: `Result 2 for "${args.query}"`, score: 0.82 },
                    { title: `Result 3 for "${args.query}"`, score: 0.71 },
                  ],
                  totalCount: 3,
                }),
              },
            ],
          };
        } else {
          throw new Error(`Unknown tool: ${toolName}`);
        }
        break;

      case 'resources/list':
        result = {
          resources: [
            {
              uri: 'ui://counter',
              name: 'Counter UI',
              description: 'Interactive counter component',
              mimeType: 'text/html;profile=mcp-app',
            },
            {
              uri: 'ui://search-form',
              name: 'Search Form UI',
              description: 'Search form component',
              mimeType: 'text/html;profile=mcp-app',
            },
          ],
        };
        break;

      case 'resources/read':
        const uri = params?.uri;
        let html = '';

        if (uri === 'ui://counter') {
          html = counterUI;
        } else if (uri === 'ui://search-form') {
          html = formUI;
        } else {
          throw new Error(`Unknown resource: ${uri}`);
        }

        result = {
          contents: [
            {
              uri,
              mimeType: 'text/html',
              text: html,
            },
          ],
        };
        break;

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    res.json({ jsonrpc: '2.0', id, result });
  } catch (error: any) {
    console.error(`[MCP] Error:`, error);
    res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error.message || 'Unknown error',
      },
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve test page
app.get('/test', (req, res) => {
  const html = readFileSync(join(__dirname, 'test.html'), 'utf-8');
  res.type('html').send(html);
});

// Serve widget dist files
app.use('/widget', express.static(join(__dirname, '../../packages/widget-react/dist')));

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`MCP UI Test Server running on http://localhost:${PORT}/mcp`);
  console.log(`Test page: http://localhost:${PORT}/test`);
  console.log('');
  console.log('Available tools:');
  console.log('  - counter: Interactive counter with UI');
  console.log('  - search_form: Search form with interactive UI');
  console.log('  - search: Backend search (used by search_form UI)');
});
