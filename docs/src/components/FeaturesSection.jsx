import React, { useEffect, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import HowItWorksSection from './HowItWorksSection';

const ClickableCode = ({ code, clickableWord, tooltipText, scrollToId }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = (e) => {
    if (scrollToId) {
      e.preventDefault();
      const element = document.getElementById(scrollToId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a highlight effect
        element.style.transition = 'all 0.3s ease';
        element.style.transform = 'scale(1.02)';
        setTimeout(() => {
          element.style.transform = 'scale(1)';
        }, 300);
      }
    }
  };

  if (!clickableWord) {
    return code;
  }

  const parts = code.split(clickableWord);

  return (
    <>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {part}
          {index < parts.length - 1 && (
            <span
              className="clickable-code-word"
              onClick={handleClick}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              style={{
                position: 'relative',
                cursor: 'pointer',
                textDecoration: 'underline',
                textDecorationStyle: 'dotted',
                textDecorationColor: '#4a9eff',
              }}
            >
              {clickableWord}
              {showTooltip && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '8px',
                    padding: '6px 12px',
                    background: '#1e1e1e',
                    border: '1px solid #4a9eff',
                    borderRadius: '4px',
                    color: '#4a9eff',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    zIndex: 1000,
                    pointerEvents: 'none',
                  }}
                >
                  {tooltipText || 'Click to see full spec'}
                  <span
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid #4a9eff',
                    }}
                  />
                </span>
              )}
            </span>
          )}
        </React.Fragment>
      ))}
    </>
  );
};

const FeatureRow = ({ title, description, icon, code, language = 'javascript', reversed, fileName, id, clickableWord, scrollToId, tooltipText }) => {
  useEffect(() => {
    Prism.highlightAll();
  }, [code]);

  const codeContent = clickableWord ? (
    <ClickableCode code={code.trim()} clickableWord={clickableWord} scrollToId={scrollToId} tooltipText={tooltipText} />
  ) : (
    code.trim()
  );

  return (
    <div id={id} className={`feature-row ${reversed ? 'reversed' : ''}`}>
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
            <code className={`language-${language}`}>{codeContent}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};

const InteractiveConfig = () => {
  const [hoveredSection, setHoveredSection] = React.useState(null);

  const sections = [
    {
      id: 'network',
      title: "Secure proxy for network access",
      description: "Each session gets strict network, filesystem, and runtime limits. Define granular policies per request.",
      lineStart: 2,
      lineEnd: 11
    },
    {
      id: 'filesystem',
      title: "Sandboxed Filesystem",
      description: "Each session gets a private, ephemeral filesystem. OPFS is used in browser for persistent storage and you can mount local directories in server mode.",
      lineStart: 12,
      lineEnd: 22
    },
    {
      id: 'mcp',
      title: "Combine all MCP servers into 1mcp",
      description: "1mcp allows agents to call other MCP servers via JavaScript functions. It proxies all the requests with relay server.",
      lineStart: 24,
      lineEnd: 36
    }
  ];

  const code = `{
  "policy": {
    "network": { 
      "allowedDomains": ["*.googleapis.com"],
      "blockPrivateRanges": true 
    },
    "limits": { "memMb": 512, "executionTimeMs": 5000 },
    "filesystem": { 
      "readonly": ["/workspace"],
      "writable": ["/tmp", "/out"],
      "mounts": [
        { "source": "./data", "target": "/workspace", "readonly": true }
      ]
    }
  },
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
}`;

  useEffect(() => {
    Prism.highlightAll();
  }, []);

  return (
    <div id="interactive-config" className="feature-row interactive-config-container">
      <div className="feature-text">
        <div className="config-sections">
          {sections.map((section) => (
            <div
              key={section.id}
              className={`config-section-item ${hoveredSection === section.id ? 'active' : ''} ${hoveredSection && hoveredSection !== section.id ? 'dimmed' : ''}`}
              onMouseEnter={() => setHoveredSection(section.id)}
              onMouseLeave={() => setHoveredSection(null)}
            >
              <h3 className="feature-title-large">{section.title}</h3>
              <p className="feature-description-large" style={{ marginTop: '1rem' }}>{section.description}</p>
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
            <div className="code-filename">1mcp.config.json</div>
          </div>
          <div className="code-content-wrapper">
            <pre className="code-content">
              <code className="language-json">{code.trim()}</code>
            </pre>
            {hoveredSection && (
              <div className="code-overlay">
                {sections.map((section) => {
                  if (section.id !== hoveredSection) {
                    return null;
                  }
                  return null;
                })}
              </div>
            )}
            <style>{`
              .code-content-wrapper {
                position: relative;
              }
              .code-content {
                transition: opacity 0.3s ease;
              }
              .config-section-item {
                cursor: pointer;
                margin-bottom: 2rem;
                transition: opacity 0.2s;
              }
              .config-section-item.dimmed {
                opacity: 0.4;
              }
              ${sections.map(section => `
                .interactive-config-container.hover-${section.id} .token {
                  opacity: 0.3;
                  transition: opacity 0.3s ease;
                }
              `).join('')}
            `}</style>
            {hoveredSection && (() => {
              const section = sections.find(s => s.id === hoveredSection);
              if (!section) return null;

              const paddingTop = 1.5; // rem
              const lineHeight = 1.35; // rem

              const topOffset = paddingTop + (section.lineStart - 1) * lineHeight;
              const height = (section.lineEnd - section.lineStart + 1) * lineHeight;

              return (
                <>
                  <div
                    className="dim-overlay"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: `${topOffset}rem`,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      pointerEvents: 'none',
                      transition: 'all 0.3s ease'
                    }}
                  />
                  <div
                    className="dim-overlay"
                    style={{
                      position: 'absolute',
                      top: `${topOffset + height}rem`,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      pointerEvents: 'none',
                      transition: 'all 0.3s ease'
                    }}
                  />
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

const FeaturesSection = () => {
  return (
    <section id="features" className="features-section-large">
      <HowItWorksSection />

      <div className="features-container">
        <FeatureRow
          title="Drop-in AI SDK Support"
          description="Turn your tools into a sandboxed MCP surface with a single function call. No extra glue code needed."
          fileName="App.tsx (Next.js)"
          clickableWord="config"
          scrollToId="interactive-config"
          tooltipText="Click to see full config spec"
          code={`
import { convertTo1MCP } from '@1mcp/ai-sdk';
import { generateText } from 'ai';

const { client } = await convertTo1MCP(tools, config);

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

        <InteractiveConfig />
      </div>
    </section>
  );
};

export default FeaturesSection;
