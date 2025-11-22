import React, { useEffect, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import HowItWorksSection from './HowItWorksSection';

const HighlightedCode = ({ code, language = 'javascript', clickableWord, tooltipText, scrollToId }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = (e) => {
    if (scrollToId) {
      e.preventDefault();
      const element = document.getElementById(scrollToId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.transition = 'all 0.3s ease';
        element.style.transform = 'scale(1.02)';
        setTimeout(() => {
          element.style.transform = 'scale(1)';
        }, 300);
      }
    }
  };

  const prismLang = Prism.languages[language] || Prism.languages.javascript;

  if (!clickableWord) {
    return (
      <span dangerouslySetInnerHTML={{ __html: Prism.highlight(code, prismLang, language) }} />
    );
  }

  const parts = code.split(clickableWord);

  return (
    <>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          <span dangerouslySetInnerHTML={{ __html: Prism.highlight(part, prismLang, language) }} />
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
                color: '#4a9eff'
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
  // No useEffect for Prism.highlightAll() needed anymore as we use HighlightedCode

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
            <code className={`language-${language}`}>
              <HighlightedCode
                code={code.trim()}
                language={language}
                clickableWord={clickableWord}
                scrollToId={scrollToId}
                tooltipText={tooltipText}
              />
            </code>
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
      lineEnd: 7
    },
    {
      id: 'filesystem',
      title: "Sandboxed Filesystem",
      description: "Each session gets a private, ephemeral filesystem. OPFS is used in browser for persistent storage and you can mount local directories in server mode.",
      lineStart: 8,
      lineEnd: 14
    },
    {
      id: 'mcp',
      title: "Combine all MCP servers into 1mcp",
      description: "1mcp allows agents to call other MCP servers via JavaScript functions. It proxies all the requests with relay server.",
      lineStart: 16,
      lineEnd: 33
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
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/private/tmp"]
    },
    {
      "name": "sentry",
      "transport": "http",
      "endpoint": "https://mcp.sentry.dev/mcp"
    },
    {
      "name": "context7",
      "transport": "http",
      "endpoint": "https://api.context7.com/mcp"
    }
  ]
}`;

  // No useEffect for Prism.highlightAll() needed

  return (
    <div>      <div className="section-header" style={{ textAlign: 'center' }}><h2 className="section-title">Specification</h2></div>
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
                <code className="language-json">
                  <HighlightedCode
                    code={code.trim()}
                    language="json"
                  />
                </code>
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
    </div>
  );
};

const UnifiedSDKFeature = () => {
  const [activeId, setActiveId] = useState('sdk');

  const features = [
    {
      id: 'sdk',
      title: "Drop-in AI SDK Support",
      description: "Turn your tools into a sandboxed MCP surface with a single function call. No extra glue code needed.",
      fileName: "App.tsx (Next.js)",
      language: "javascript",
      clickableWord: "config",
      scrollToId: "interactive-config",
      tooltipText: "Click to see full config spec",
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
      title: "Browser sandboxing with WASM",
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
      clickableWord: "1mcp.config.json",
      scrollToId: "interactive-config",
      tooltipText: "Click to see full config spec",
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

  // No useEffect for Prism.highlightAll() needed

  return (
    <div>
      <div className="section-header" style={{ textAlign: 'center' }}><h2 className="section-title">Quickstart</h2></div>

      <div className="feature-row reversed unified-sdk-container">
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
              <code className={`language-${activeFeature.language}`}>
                <HighlightedCode
                  key={activeFeature.id}
                  code={activeFeature.code.trim()}
                  language={activeFeature.language}
                  clickableWord={activeFeature.clickableWord}
                  scrollToId={activeFeature.scrollToId}
                  tooltipText={activeFeature.tooltipText}
                />
              </code>
            </pre>
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
        <UnifiedSDKFeature />
        <InteractiveConfig />
      </div>
    </section>
  );
};

export default FeaturesSection;
