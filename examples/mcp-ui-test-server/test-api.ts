/**
 * API Test Script
 *
 * Tests the MCP Apps flow programmatically
 */

const MCP_ENDPOINT = 'http://localhost:3456/mcp';

async function mcpRequest(method: string, params?: any) {
  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.result;
}

async function runTests() {
  console.log('Testing MCP Apps API...\n');

  // Test 1: Initialize
  console.log('1. Initialize MCP session...');
  const initResult = await mcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  });
  console.log('   ✓ Server:', initResult.serverInfo.name);

  // Test 2: List tools
  console.log('\n2. List tools...');
  const toolsResult = await mcpRequest('tools/list');
  console.log('   ✓ Found', toolsResult.tools.length, 'tools');

  // Test 3: Check for UI metadata
  console.log('\n3. Check UI metadata...');
  const uiTools = toolsResult.tools.filter((t: any) => t._meta?.['ui/resourceUri']);
  console.log('   ✓ Tools with UI:', uiTools.map((t: any) => t.name).join(', '));

  for (const tool of uiTools) {
    console.log(`     - ${tool.name}: ${tool._meta['ui/resourceUri']}`);
  }

  // Test 4: Read UI resource
  console.log('\n4. Read UI resource (counter)...');
  const resourceResult = await mcpRequest('resources/read', { uri: 'ui://counter' });
  const content = resourceResult.contents[0];
  console.log('   ✓ MIME type:', content.mimeType);
  console.log('   ✓ Content length:', content.text.length, 'chars');
  console.log('   ✓ Contains mcpApp API:', content.text.includes('window.mcpApp'));
  console.log('   ✓ Contains sendIntent:', content.text.includes('sendIntent'));

  // Test 5: Call search tool (simulating UI tool call)
  console.log('\n5. Call search tool (simulating UI)...');
  const searchResult = await mcpRequest('tools/call', {
    name: 'search',
    arguments: { query: 'test query', category: 'docs' },
  });
  const searchData = JSON.parse(searchResult.content[0].text);
  console.log('   ✓ Query:', searchData.query);
  console.log('   ✓ Results:', searchData.results.length);

  console.log('\n✅ All API tests passed!');
  console.log('\nTo test the full UI integration:');
  console.log('  1. Open http://localhost:3456/test in a browser');
  console.log('  2. The widget should appear in the bottom-right');
  console.log('  3. Ask: "show me the counter" or "open search form"');
  console.log('  4. The UI should render inline in the chat');
}

runTests().catch(console.error);
