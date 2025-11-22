import React, { useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';

const FeatureRow = ({ title, description, icon, code, language = 'javascript', reversed, fileName }) => {
  useEffect(() => {
    Prism.highlightAll();
  }, [code]);

  return (
    <div className={`feature-row ${reversed ? 'reversed' : ''}`}>
      <div className="feature-text">
        <div className="feature-icon-large">{icon}</div>
        <h3 className="feature-title-large">{title}</h3>
        <p className="feature-description-large">{description}</p>
      </div>
      <div className="feature-code">
        <div className="code-window">
          <div className="code-header">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span className="code-dot red"></span>
              <span className="code-dot yellow"></span>
              <span className="code-dot green"></span>
            </div>
            {fileName && <div className="code-filename">{fileName}</div>}
          </div>
          <pre className="code-content">
            <code className={`language-${language}`}>{code.trim()}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};

const FeaturesSection = () => {
  return (
    <section id="features" className="features-section-large">
      <div className="features-container">
        <FeatureRow
          title="Drop-in AI SDK Support"
          description="Turn your tools into a sandboxed MCP surface with a single function call. No extra glue code needed."
          fileName="App.tsx (Next.js)"
          code={`
import { convertTo1MCP } from '@1mcp/ai-sdk';
import { generateText } from 'ai';

const { client } = await convertTo1MCP(tools);

const result = await generateText({
  model: openai('gpt-4'),
  tools: client.tools(),
  prompt: 'Get weather for Paris'
});
`}
        />

        <FeatureRow
          title="Browser sandboxing with WASM"
          description="Offload compute to the client. Execute code safely in a browser worker via WebAssembly. It's more secure, scalable, and cost-effective compared to cloud sandboxing."
          icon="⚡"
          fileName="YourClientReactHome.tsx"
          reversed={true}
          code={`
import { RelayBrowserClient } from '@1mcp/ai-sdk/browser';

const client = new RelayBrowserClient('http://localhost:3000');
await client.connect();

client.onCapsule(async (capsule) => {
  // Execute safely in WASM worker
  const result = await executeInWorker(capsule);
  await client.sendResult(result);
});
`}
        />

        <FeatureRow
          title="Secure proxy for network access"
          description="Each session gets strict network, filesystem, and runtime limits. Define granular policies per request, not just global project settings."
          icon="🔒"
          fileName="1mcp.config.json"
          language="json"
          code={`
{
  "policy": {
    "network": { 
      "allowedDomains": ["*.googleapis.com"],
      "denyLocalhost": true 
    },
    "filesystem": { 
      "writable": ["/tmp"],
      "maxFileSize": 1048576
    },
    "limits": { 
      "memMb": 512, 
      "executionTimeMs": 5000 
    }
  }
}
`}
        />

        <FeatureRow
          title="Combine all MCP servers into 1mcp"
          description="1mcp allows agents to call other MCP servers via JavaScript functions. It proxies all the requests to your other MCP servers."
          icon="🔌"
          reversed={true}
          fileName="1mcp.config.json"
          language="json"
          code={`
{
  "mcps": [
    {
      "name": "github",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    },
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  ]
}
`}
        />
      </div>
    </section>
  );
};

export default FeaturesSection;
