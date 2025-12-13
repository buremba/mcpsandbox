import React, { useState, useCallback, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';

const DEFAULT_CONFIG = {
  model: {
    provider: "openai",
    name: "gpt-4o-mini",
    apiKey: "sk-..."
  },
  policy: {
    network: { 
      allowedDomains: ["*.googleapis.com"],
      blockPrivateRanges: true 
    },
    limits: { memMb: 512, executionTimeMs: 5000 },
    filesystem: { 
      readonly: ["/workspace"],
      writable: ["/tmp", "/out"],
      mounts: [
        { source: "./data", target: "/workspace", readonly: true }
      ]
    }
  },
  mcps: [
    {
      name: "filesystem",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/private/tmp"]
    },
    {
      name: "github",
      transport: "http",
      endpoint: "https://mcp.github.dev/mcp"
    }
  ],
  widget: {
    title: "OneMCP Assistant",
    placeholder: "Ask me anything...",
    theme: { preset: "dark" }
  }
};

const sections = [
  {
    id: 'model',
    title: "LLM Provider Config",
    description: "Configure your AI model provider with API keys and model selection. Supports OpenAI, Anthropic, and Chrome built-in AI.",
    lineStart: 2,
    lineEnd: 6
  },
  {
    id: 'network',
    title: "Secure Network Proxy",
    description: "Each session gets strict network, filesystem, and runtime limits. Define granular policies per request.",
    lineStart: 8,
    lineEnd: 17
  },
  {
    id: 'mcp',
    title: "Combine MCP Servers",
    description: "Connect multiple MCP servers via stdio or HTTP transport. 1MCP allows agents to call tools from any MCP server.",
    lineStart: 26,
    lineEnd: 38
  }
];

const InteractiveConfig = ({ onConfigChange, onStartChat }) => {
  const [hoveredSection, setHoveredSection] = useState(null);
  const [configText, setConfigText] = useState(JSON.stringify(DEFAULT_CONFIG, null, 2));
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const editorRef = useRef(null);

  const handleCodeChange = useCallback((value) => {
    setConfigText(value);
    setHasChanges(true);
    try {
      JSON.parse(value);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleApplyConfig = useCallback(() => {
    try {
      const parsed = JSON.parse(configText);
      setError(null);
      setHasChanges(false);
      onConfigChange?.(parsed);
    } catch (e) {
      setError(e.message);
    }
  }, [configText, onConfigChange]);

  const handleStartChat = useCallback(() => {
    try {
      const parsed = JSON.parse(configText);
      setError(null);
      setHasChanges(false);
      onConfigChange?.(parsed);
      onStartChat?.();
    } catch (e) {
      setError(e.message);
    }
  }, [configText, onConfigChange, onStartChat]);

  const handleSectionHover = useCallback((sectionId) => {
    setHoveredSection(sectionId);
    
    if (sectionId && editorRef.current?.view) {
      const section = sections.find(s => s.id === sectionId);
      if (section) {
        const view = editorRef.current.view;
        const doc = view.state.doc;
        
        // Get the position of the target line (clamped to valid range)
        const targetLine = Math.min(section.lineStart, doc.lines);
        const lineInfo = doc.line(targetLine);
        
        // Use requestAnimationFrame to ensure smooth scrolling
        requestAnimationFrame(() => {
          const lineTop = view.lineBlockAt(lineInfo.from).top;
          view.scrollDOM.scrollTo({
            top: Math.max(0, lineTop - 20),
            behavior: 'smooth'
          });
        });
      }
    }
  }, []);

  const extensions = useMemo(() => [json()], []);

  return (
    <div id="interactive-config" style={{ padding: '2rem 0' }}>
      
      {/* 3 Column Grid for Features */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '2rem',
        maxWidth: '900px',
        margin: '0 auto 2rem auto',
        padding: '0 1rem'
      }}>
        {sections.map((section) => (
          <div
            key={section.id}
            style={{
              textAlign: 'center',
              cursor: 'pointer',
              padding: '1rem',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
              opacity: hoveredSection && hoveredSection !== section.id ? 0.4 : 1,
              backgroundColor: hoveredSection === section.id ? 'rgba(255,255,255,0.05)' : 'transparent'
            }}
            onMouseEnter={() => handleSectionHover(section.id)}
            onMouseLeave={() => setHoveredSection(null)}
          >
            <h3 style={{ 
              fontSize: '1.1rem', 
              fontWeight: 600, 
              marginBottom: '0.5rem',
              color: 'var(--text-primary, #fff)'
            }}>
              {section.title}
            </h3>
            <p style={{ 
              fontSize: '0.9rem', 
              color: 'var(--text-secondary, #888)',
              lineHeight: 1.5
            }}>
              {section.description}
            </p>
          </div>
        ))}
      </div>

      {/* Centered Code Block - 700px */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 1rem',
        gap: '1rem'
      }}>
        <div className="code-window" style={{ width: '700px', maxWidth: '100%' }}>
          <div className="code-header">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span className="code-dot red"></span>
              <span className="code-dot yellow"></span>
              <span className="code-dot green"></span>
            </div>
            <div className="code-filename">1mcp.config.json</div>
          </div>
          <CodeMirror
            ref={editorRef}
            value={configText}
            height="450px"
            theme={oneDark}
            extensions={extensions}
            onChange={handleCodeChange}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              foldGutter: true,
              autocompletion: true,
              bracketMatching: true,
              closeBrackets: true,
              indentOnInput: true,
            }}
            style={{
              fontSize: '0.85rem',
              borderRadius: '0 0 12px 12px',
              overflow: 'hidden',
              textAlign: 'left'
            }}
          />
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            color: '#ef4444',
            fontSize: '0.85rem',
            padding: '0.5rem 1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '6px',
            maxWidth: '700px',
            width: '100%'
          }}>
            ⚠️ Invalid JSON: {error}
          </div>
        )}

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '0.5rem'
        }}>
          <button
            onClick={handleApplyConfig}
            disabled={!!error || !hasChanges}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #30363d)',
              backgroundColor: hasChanges && !error ? 'var(--bg-tertiary, #21262d)' : 'transparent',
              color: error ? 'var(--text-secondary, #888)' : 'var(--text-primary, #fff)',
              cursor: error || !hasChanges ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
              transition: 'all 0.2s ease',
              opacity: error || !hasChanges ? 0.5 : 1
            }}
          >
            Apply Config
          </button>
          <button
            onClick={handleStartChat}
            disabled={!!error}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: error ? 'var(--text-secondary, #888)' : 'var(--accent-blue, #58a6ff)',
              color: '#fff',
              cursor: error ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Start Chat
          </button>
        </div>

        <p style={{
          fontSize: '0.8rem',
          color: 'var(--text-secondary, #888)',
          textAlign: 'center',
          maxWidth: '550px'
        }}>
          Edit the config above and click "Start Chat" to try the widget with your configuration.
          <br />
          <span style={{ opacity: 0.7 }}>
            Tip: Use <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0 4px', borderRadius: '3px' }}>"provider": "chrome"</code> for 
            Chrome's built-in AI (no API key required), or replace the API key placeholder for OpenAI/Anthropic.
          </span>
        </p>
      </div>
    </div>
  );
};

export default InteractiveConfig;
