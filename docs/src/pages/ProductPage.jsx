import React, { useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import DemoSection from '../components/DemoSection';
import '../components/HowItWorksSection.css';

// Prevent Prism from automatically highlighting
Prism.manual = true;

const HighlightedCode = ({ code, language = 'javascript' }) => {
  const prismLang = Prism.languages[language] || Prism.languages.javascript;
  return (
    <span dangerouslySetInnerHTML={{ __html: Prism.highlight(code, prismLang, language) }} />
  );
};

const IntegrationsSection = () => {
  const [activeId, setActiveId] = useState('sdk');

  const features = [
    {
      id: 'sdk',
      title: "Drop-in AI SDK Support",
      description: "Turn your tools into a sandboxed MCP surface with a single function call. No extra glue code needed.",
      fileName: "App.tsx (Next.js)",
      language: "javascript",
      code: `
import { convertTo1MCP } from '@1mcp/ai-sdk';
import { generateText } from 'ai';

const { client } = await convertTo1MCP(tools, config);

const result = await generateText({
  model: openai('gpt-4'),
  tools: client.tools(),
  prompt: 'Get weather for Paris'
});`
    },
    {
      id: 'wasm',
      title: "Browser Sandboxing with WASM",
      description: "Offload compute to the client. Execute code safely in a browser worker via WebAssembly. It's more secure, scalable, and cost-effective compared to cloud sandboxing.",
      fileName: "YourClientReactHome.tsx",
      language: "javascript",
      code: `
import { RelayBrowserClient } from '@1mcp/ai-sdk/browser';

let client = new RelayBrowserClient('http://localhost:3000');
await client.connect();

client.onCapsule(async (capsule) => {
  // Execute safely in WASM worker
  const result = await executeInWorker(capsule);
  await client.sendResult(result);
});`
    },
    {
      id: 'backend',
      title: "Standalone Server Integration",
      description: "Decouple execution from your app. Run Relay as a standalone service and connect any MCP client (Claude, Cursor, etc.).",
      fileName: "Terminal",
      language: "bash",
      code: `
# 1. Initialize default configuration
npx 1mcp init

# 2. Start the server with your config
npx 1mcp serve --config 1mcp.config.json

# Server running on http://localhost:3000/mcp
# Connect via SSE or stdio transport`
    }
  ];

  const activeFeature = features.find(f => f.id === activeId) || features[0];

  return (
    <section className="integrations-section" style={{ padding: '4rem 0' }}>
      <div className="section-header" style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h2 className="section-title">Integrations</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '1rem auto 0' }}>
          Multiple ways to integrate 1mcp into your stack
        </p>
      </div>

      <div className="feature-row reversed unified-sdk-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem' }}>
        <style>{`
          .unified-sdk-container .code-window {
            min-height: 420px;
            display: flex;
            flex-direction: column;
          }
          .unified-sdk-container .code-content {
            flex: 1;
          }
          @media (min-width: 901px) {
            .unified-sdk-container .feature-code {
              min-width: 550px;
            }
          }
        `}</style>
        <div className="feature-text">
          <div className="config-sections">
            {features.map((feature) => (
              <div
                key={feature.id}
                className="config-section-item"
                onMouseEnter={() => setActiveId(feature.id)}
                style={{
                  cursor: 'pointer',
                  marginBottom: '2rem',
                  transition: 'opacity 0.2s',
                  opacity: activeId === feature.id ? 1 : 0.4
                }}
              >
                <h3 className="feature-title-large">{feature.title}</h3>
                <p className="feature-description-large" style={{ marginTop: '1rem' }}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="feature-code">
          <div className="code-window">
            <div className="code-header">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="code-dot red"></span>
                <span className="code-dot yellow"></span>
                <span className="code-dot green"></span>
              </div>
              <div className="code-filename">{activeFeature.fileName}</div>
            </div>
            <pre className="code-content">
              <code className={`language-${activeFeature.language} no-highlight`}>
                <HighlightedCode
                  key={activeFeature.id}
                  code={activeFeature.code.trim()}
                  language={activeFeature.language}
                />
              </code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
};

const ProductPage = () => {
  return (
    <div className="product-page">
      {/* Hero */}
      <section style={{
        padding: '6rem 2rem 4rem',
        textAlign: 'center',
        background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)'
      }}>
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          fontWeight: 700,
          marginBottom: '1rem',
          color: 'var(--text-primary)'
        }}>
          Code Execution Mode
        </h1>
        <p style={{
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          Reduce LLM tool calls by up to 96% with intelligent code bundling and WASM sandboxing
        </p>
      </section>

      {/* How it Works */}
      <section className="how-it-works-section" style={{ padding: '4rem 0' }}>
        <div className="section-header" style={{ textAlign: "center", marginBottom: '2rem' }}>
          <h2 className="section-title">How It Works</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '700px', margin: '1rem auto 0' }}>
            Instead of making multiple tool calls, 1mcp bundles your operations into a single
            JavaScript capsule that executes in a sandboxed WASM environment.
          </p>
        </div>
        <div className="hero-demo-wrapper">
          <DemoSection />
        </div>
      </section>

      {/* Integrations */}
      <IntegrationsSection />

      {/* Benefits */}
      <section style={{
        padding: '4rem 2rem',
        background: 'var(--bg-secondary)'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h2 className="section-title" style={{ textAlign: 'center', marginBottom: '3rem' }}>
            Why Code Mode?
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '2rem'
          }}>
            {[
              {
                icon: '10ms',
                title: 'Ultra-Fast Cold Start',
                description: 'WASM-based execution with near-instant startup times'
              },
              {
                icon: '96%',
                title: 'Token Reduction',
                description: 'Bundle multiple tool calls into a single code capsule'
              },
              {
                icon: '100%',
                title: 'Sandboxed',
                description: 'Secure execution in isolated WebAssembly environment'
              }
            ].map((benefit, i) => (
              <div key={i} style={{
                padding: '1.5rem',
                background: 'var(--bg-tertiary)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: 'var(--accent-blue)',
                  marginBottom: '0.5rem'
                }}>
                  {benefit.icon}
                </div>
                <h3 style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginBottom: '0.5rem',
                  color: 'var(--text-primary)'
                }}>
                  {benefit.title}
                </h3>
                <p style={{
                  fontSize: '0.9rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5
                }}>
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProductPage;
