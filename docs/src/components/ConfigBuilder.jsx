import React, { useState, useCallback, useMemo, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Initialize AJV with formats
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

// Widget Config JSON Schema
const WIDGET_CONFIG_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "WidgetConfig",
  type: "object",
  required: ["model"],
  properties: {
    model: {
      type: "object",
      required: ["provider"],
      properties: {
        provider: {
          type: "string",
          enum: ["openai", "anthropic", "chrome"]
        },
        apiKey: { type: "string" },
        name: { type: "string" },
        baseUrl: { type: "string", format: "uri" }
      }
    },
    policy: {
      type: "object",
      properties: {
        network: {
          type: "object",
          properties: {
            allowedDomains: { type: "array", items: { type: "string" } },
            deniedDomains: { type: "array", items: { type: "string" } },
            blockPrivateRanges: { type: "boolean" },
            denyIpLiterals: { type: "boolean" },
            maxBodyBytes: { type: "number", minimum: 0 },
            maxRedirects: { type: "number", minimum: 0 }
          }
        },
        filesystem: {
          type: "object",
          properties: {
            readonly: { type: "array", items: { type: "string" } },
            writable: { type: "array", items: { type: "string" } }
          }
        },
        limits: {
          type: "object",
          properties: {
            timeoutMs: { type: "number", minimum: 0 },
            memMb: { type: "number", minimum: 0 },
            stdoutBytes: { type: "number", minimum: 0 }
          }
        }
      }
    },
    mcps: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "transport"],
        properties: {
          name: { type: "string" },
          transport: { type: "string", enum: ["http", "stdio"] },
          endpoint: { type: "string", format: "uri" },
          command: { type: "string" },
          args: { type: "array", items: { type: "string" } }
        }
      }
    },
    widget: {
      type: "object",
      properties: {
        title: { type: "string" },
        placeholder: { type: "string" },
        systemPrompt: { type: "string" },
        position: { type: "string", enum: ["bottom-right", "bottom-left", "top-right", "top-left"] },
        defaultOpen: { type: "boolean" },
        theme: {
          type: "object",
          properties: {
            preset: { type: "string", enum: ["light", "dark", "minimal"] },
            variables: { type: "object", additionalProperties: { type: "string" } },
            customCss: { type: "string" }
          }
        }
      }
    }
  }
};

const validateConfig = ajv.compile(WIDGET_CONFIG_SCHEMA);

// Predefined popular MCP servers
const PREDEFINED_MCPS = [
  {
    id: 'insights',
    name: 'Insights',
    url: 'https://insights.buremba.com/mcp',
    tools: ['query_analytics', 'get_metrics', 'create_report'],
    config: {
      name: "insights",
      transport: "http",
      endpoint: "https://insights.buremba.com/mcp"
    }
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://mcp.github.dev/mcp',
    tools: ['search_repositories', 'get_file_contents', 'create_issue', 'list_commits'],
    config: {
      name: "github",
      transport: "http",
      endpoint: "https://mcp.github.dev/mcp"
    }
  },
  {
    id: 'context7',
    name: 'Context7',
    url: 'https://mcp.context7.com/mcp',
    tools: ['resolve-library-id', 'get-library-docs'],
    config: {
      name: "context7",
      transport: "http",
      endpoint: "https://mcp.context7.com/mcp"
    }
  },
  {
    id: 'sentry',
    name: 'Sentry',
    url: 'https://mcp.sentry.dev/mcp',
    tools: ['get_issues', 'get_issue_details', 'search_errors'],
    config: {
      name: "sentry",
      transport: "http",
      endpoint: "https://mcp.sentry.dev/mcp"
    }
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    url: 'npx @anthropic/mcp-server-filesystem [path]',
    tools: ['read_file', 'write_file', 'list_directory'],
    configurable: { field: 'path', placeholder: '/tmp', label: 'Path' },
    config: {
      name: "filesystem",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    url: 'npx @anthropic/mcp-server-postgres [connection]',
    tools: ['query', 'list_tables', 'describe_table'],
    configurable: { field: 'connection', placeholder: 'postgresql://user:pass@localhost/db', label: 'Connection String' },
    config: {
      name: "postgres",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@anthropic/mcp-server-postgres", "postgresql://localhost/mydb"]
    }
  },
  {
    id: 'slack',
    name: 'Slack',
    url: 'npx @anthropic/mcp-server-slack',
    tools: ['send_message', 'list_channels', 'get_channel_history'],
    config: {
      name: "slack",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@anthropic/mcp-server-slack"]
    }
  }
];

// Provider options
const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', requiresKey: true, models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', requiresKey: true, models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'] },
  { id: 'chrome', name: 'Chrome Built-in AI', requiresKey: false, models: ['gemini-nano'] }
];

// Theme options
const THEME_PRESETS = ['light', 'dark', 'minimal'];
const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

// Widget CDN URL
const WIDGET_CDN_URL = 'https://1mcp.dev/widget.js';

// Generate embed code from config
const generateEmbedCode = (config, format = 'readable') => {
  // Remove apiKey from config for security (user should add it themselves or use env vars)
  const safeConfig = JSON.parse(JSON.stringify(config));
  if (safeConfig.model?.apiKey) {
    safeConfig.model.apiKey = 'YOUR_API_KEY';
  }

  if (format === 'minified') {
    const base64Config = btoa(JSON.stringify(safeConfig));
    return `<script src="${WIDGET_CDN_URL}" data-config="${base64Config}" async></script>`;
  }

  const configJson = JSON.stringify(safeConfig, null, 2);
  return `<!-- 1mcp AI Widget -->
<script>
window.$1mcp = ${configJson};
</script>
<script src="${WIDGET_CDN_URL}" async></script>`;
};

// Default config - matches WidgetConfig from @onemcp/widget-react
const DEFAULT_CONFIG = {
  model: {
    provider: "chrome",
    name: "gemini-nano"
  },
  mcps: [],
  widget: {
    title: "AI Assistant",
    placeholder: "Type a message...",
    position: "bottom-right",
    defaultOpen: false,
    theme: { preset: "light" }
  }
};

// Styles
const styles = {
  container: {
    background: 'var(--bg-secondary, #161b22)',
    borderRadius: '12px',
    border: '1px solid var(--border-color, #30363d)',
    overflow: 'hidden',
    maxWidth: '700px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid var(--border-color, #30363d)',
    background: 'var(--bg-tertiary, #21262d)'
  },
  title: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--text-primary, #c9d1d9)',
    margin: 0
  },
  modeToggle: {
    display: 'flex',
    gap: '0.5rem'
  },
  modeButton: (active) => ({
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    border: 'none',
    background: active ? 'var(--accent-blue, #58a6ff)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary, #8b949e)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    transition: 'all 0.2s ease'
  }),
  content: {
    padding: '1.5rem'
  },
  section: {
    marginBottom: '1.5rem'
  },
  sectionTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--text-primary, #c9d1d9)',
    marginBottom: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  fieldGroup: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem'
  },
  label: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary, #8b949e)',
    fontWeight: 500,
    textAlign: 'left'
  },
  input: {
    padding: '0.6rem 0.8rem',
    borderRadius: '6px',
    border: '1px solid var(--border-color, #30363d)',
    background: 'var(--bg-primary, #0d1117)',
    color: 'var(--text-primary, #c9d1d9)',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s ease'
  },
  select: {
    padding: '0.6rem 0.8rem',
    borderRadius: '6px',
    border: '1px solid var(--border-color, #30363d)',
    background: 'var(--bg-primary, #0d1117)',
    color: 'var(--text-primary, #c9d1d9)',
    fontSize: '0.9rem',
    outline: 'none',
    cursor: 'pointer'
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer'
  },
  arrayField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  arrayItem: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center'
  },
  arrayInput: {
    flex: 1,
    padding: '0.5rem 0.7rem',
    borderRadius: '6px',
    border: '1px solid var(--border-color, #30363d)',
    background: 'var(--bg-primary, #0d1117)',
    color: 'var(--text-primary, #c9d1d9)',
    fontSize: '0.85rem',
    outline: 'none'
  },
  iconButton: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid var(--border-color, #30363d)',
    background: 'var(--bg-tertiary, #21262d)',
    color: 'var(--text-secondary, #8b949e)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    transition: 'all 0.2s ease'
  },
  addButton: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: '1px dashed var(--border-color, #30363d)',
    background: 'transparent',
    color: 'var(--text-secondary, #8b949e)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    transition: 'all 0.2s ease'
  },
  errorBanner: {
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    background: 'rgba(248, 81, 73, 0.1)',
    border: '1px solid rgba(248, 81, 73, 0.3)',
    color: '#f85149',
    fontSize: '0.85rem',
    marginBottom: '1rem'
  }
};

// Array Field Component
const ArrayField = ({ label, value = [], onChange, placeholder = "Add item..." }) => {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    if (newItem.trim()) {
      onChange([...value, newItem.trim()]);
      setNewItem('');
    }
  };

  const handleRemove = (index) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      <div style={styles.arrayField}>
        {value.map((item, index) => (
          <div key={index} style={styles.arrayItem}>
            <input
              style={styles.arrayInput}
              value={item}
              onChange={(e) => {
                const newValue = [...value];
                newValue[index] = e.target.value;
                onChange(newValue);
              }}
            />
            <button
              style={styles.iconButton}
              onClick={() => handleRemove(index)}
              title="Remove"
            >
              −
            </button>
          </div>
        ))}
        <div style={styles.arrayItem}>
          <input
            style={styles.arrayInput}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
          />
          <button
            style={{ ...styles.iconButton, color: 'var(--accent-blue, #58a6ff)' }}
            onClick={handleAdd}
            title="Add"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

// Theme presets with their color values
const PRESET_COLORS = {
  light: {
    '--onemcp-bg-primary': '#ffffff',
    '--onemcp-bg-secondary': '#f5f5f5',
    '--onemcp-bg-tertiary': '#eeeeee',
    '--onemcp-text-primary': '#1a1a1a',
    '--onemcp-text-secondary': '#666666',
    '--onemcp-border': '#e5e5e5',
    '--onemcp-accent': '#0066ff',
    '--onemcp-accent-text': '#ffffff'
  },
  dark: {
    '--onemcp-bg-primary': '#1a1a1a',
    '--onemcp-bg-secondary': '#2d2d2d',
    '--onemcp-bg-tertiary': '#3d3d3d',
    '--onemcp-text-primary': '#ffffff',
    '--onemcp-text-secondary': '#a0a0a0',
    '--onemcp-border': '#404040',
    '--onemcp-accent': '#58a6ff',
    '--onemcp-accent-text': '#ffffff'
  },
  minimal: {
    '--onemcp-bg-primary': '#fafafa',
    '--onemcp-bg-secondary': '#f0f0f0',
    '--onemcp-bg-tertiary': '#e8e8e8',
    '--onemcp-text-primary': '#333333',
    '--onemcp-text-secondary': '#888888',
    '--onemcp-border': '#dddddd',
    '--onemcp-accent': '#333333',
    '--onemcp-accent-text': '#ffffff'
  }
};

// Chat Preview Component with Interactive Color Zones
const ChatPreview = ({ value = {}, onChange, preset = 'light', onPresetChange }) => {
  const [activeZone, setActiveZone] = useState(null);

  // Get color from custom values first, then fall back to preset
  const presetColors = PRESET_COLORS[preset] || PRESET_COLORS.light;
  const getColor = (name) => value[name] || presetColors[name];

  const setColor = (name, color) => {
    onChange({ ...value, [name]: color });
  };

  const handleZoneClick = (zone) => {
    setActiveZone(activeZone === zone ? null : zone);
  };

  const renderColorInputs = (variables) => (
    <div style={{
      display: 'flex',
      gap: '0.5rem',
      padding: '0.5rem',
      background: 'rgba(0,0,0,0.3)',
      borderRadius: '4px',
      marginTop: '0.5rem'
    }}>
      {variables.map(({ name, label }) => (
        <label key={name} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          cursor: 'pointer'
        }}>
          <input
            type="color"
            value={getColor(name)}
            onChange={(e) => {
              e.stopPropagation();
              setColor(name, e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '20px',
              height: '20px',
              padding: 0,
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '3px',
              cursor: 'pointer',
              background: 'transparent'
            }}
          />
          <span style={{
            fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.8)',
            whiteSpace: 'nowrap'
          }}>
            {label}
          </span>
        </label>
      ))}
    </div>
  );

  const zoneStyle = (isActive) => ({
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    outline: isActive ? '2px solid var(--accent-blue, #58a6ff)' : '2px solid transparent',
    outlineOffset: '2px'
  });

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
      {/* Chat Preview */}
      <div style={{
        width: '300px',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        background: getColor('--onemcp-bg-primary'),
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        flexShrink: 0
      }}>
        {/* Header */}
        <div
          onClick={() => handleZoneClick('header')}
          style={{
            ...zoneStyle(activeZone === 'header'),
            padding: '12px 16px',
            background: getColor('--onemcp-bg-tertiary'),
            borderBottom: `1px solid ${getColor('--onemcp-border')}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{
            fontWeight: 600,
            color: getColor('--onemcp-text-primary')
          }}>
            AI Assistant
          </span>
          <span style={{
            color: getColor('--onemcp-text-secondary'),
            fontSize: '18px',
            lineHeight: 1
          }}>
            x
          </span>
          {activeZone === 'header' && renderColorInputs([
            { name: '--onemcp-bg-tertiary', label: 'Bg' },
            { name: '--onemcp-text-primary', label: 'Text' }
          ])}
        </div>

        {/* Messages Area */}
        <div
          onClick={() => handleZoneClick('background')}
          style={{
            ...zoneStyle(activeZone === 'background'),
            padding: '16px',
            minHeight: '100px',
            background: getColor('--onemcp-bg-primary'),
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {activeZone === 'background' && renderColorInputs([
            { name: '--onemcp-bg-primary', label: 'Background' }
          ])}

          {/* Assistant Message */}
          <div
            onClick={(e) => { e.stopPropagation(); handleZoneClick('assistant'); }}
            style={{
              ...zoneStyle(activeZone === 'assistant'),
              alignSelf: 'flex-start',
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: '12px',
              background: getColor('--onemcp-bg-secondary'),
              color: getColor('--onemcp-text-primary')
            }}
          >
            Hello! How can I help?
            {activeZone === 'assistant' && renderColorInputs([
              { name: '--onemcp-bg-secondary', label: 'Bg' },
              { name: '--onemcp-text-primary', label: 'Text' }
            ])}
          </div>

          {/* User Message */}
          <div
            onClick={(e) => { e.stopPropagation(); handleZoneClick('user'); }}
            style={{
              ...zoneStyle(activeZone === 'user'),
              alignSelf: 'flex-end',
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: '12px',
              background: getColor('--onemcp-accent'),
              color: getColor('--onemcp-accent-text')
            }}
          >
            What's the weather?
            {activeZone === 'user' && renderColorInputs([
              { name: '--onemcp-accent', label: 'Bg' },
              { name: '--onemcp-accent-text', label: 'Text' }
            ])}
          </div>
        </div>

        {/* Input Area */}
        <div
          onClick={() => handleZoneClick('input')}
          style={{
            ...zoneStyle(activeZone === 'input'),
            padding: '12px 16px',
            borderTop: `1px solid ${getColor('--onemcp-border')}`,
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            background: getColor('--onemcp-bg-primary')
          }}
        >
          <div style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '8px',
            border: `1px solid ${getColor('--onemcp-border')}`,
            background: getColor('--onemcp-bg-secondary'),
            color: getColor('--onemcp-text-secondary'),
            fontSize: '13px'
          }}>
            Type a message...
          </div>
          <div style={{
            padding: '8px 14px',
            borderRadius: '8px',
            background: getColor('--onemcp-accent'),
            color: getColor('--onemcp-accent-text'),
            fontWeight: 500,
            fontSize: '13px'
          }}>
            Send
          </div>
          {activeZone === 'input' && renderColorInputs([
            { name: '--onemcp-bg-secondary', label: 'Input' },
            { name: '--onemcp-border', label: 'Border' },
            { name: '--onemcp-accent', label: 'Button' }
          ])}
        </div>
      </div>

      {/* Preset Selector */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        minWidth: '120px'
      }}>
        <label style={{
          fontSize: '0.8rem',
          color: 'var(--text-secondary, #8b949e)',
          fontWeight: 500
        }}>
          Base Theme
        </label>
        <select
          style={{
            padding: '0.5rem 0.7rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color, #30363d)',
            background: 'var(--bg-primary, #0d1117)',
            color: 'var(--text-primary, #c9d1d9)',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
          value={preset}
          onChange={(e) => onPresetChange(e.target.value)}
        >
          {THEME_PRESETS.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <p style={{
          fontSize: '0.7rem',
          color: 'var(--text-secondary, #8b949e)',
          margin: 0,
          lineHeight: 1.4
        }}>
          Click any element to customize its colors
        </p>
        {Object.keys(value).length > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            style={{
              marginTop: '0.5rem',
              padding: '0.4rem 0.6rem',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #30363d)',
              background: 'transparent',
              color: 'var(--text-secondary, #8b949e)',
              fontSize: '0.75rem',
              cursor: 'pointer'
            }}
          >
            Reset to preset
          </button>
        )}
      </div>
    </div>
  );
};

// Embed Code Modal Component
const EmbedCodeModal = ({ config, onClose }) => {
  const [format, setFormat] = useState('readable');
  const [copied, setCopied] = useState(false);
  const embedCode = generateEmbedCode(config, format);

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '1rem'
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-secondary, #161b22)',
        borderRadius: '12px',
        border: '1px solid var(--border-color, #30363d)',
        maxWidth: '700px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto'
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border-color, #30363d)'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary, #c9d1d9)' }}>
            Embed Code
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #8b949e)',
              cursor: 'pointer',
              fontSize: '1.5rem',
              lineHeight: 1,
              padding: '0.25rem'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem' }}>
          {/* Format Toggle */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #8b949e)', marginBottom: '0.5rem', display: 'block' }}>
              Format
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setFormat('readable')}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: format === 'readable' ? 'var(--accent-blue, #58a6ff)' : 'var(--bg-tertiary, #21262d)',
                  color: format === 'readable' ? '#fff' : 'var(--text-secondary, #8b949e)',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Readable
              </button>
              <button
                onClick={() => setFormat('minified')}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: format === 'minified' ? 'var(--accent-blue, #58a6ff)' : 'var(--bg-tertiary, #21262d)',
                  color: format === 'minified' ? '#fff' : 'var(--text-secondary, #8b949e)',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Single Line
              </button>
            </div>
          </div>

          {/* Code Display */}
          <div style={{
            background: 'var(--bg-primary, #0d1117)',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #30363d)',
            overflow: 'hidden'
          }}>
            <pre style={{
              margin: 0,
              padding: '1rem',
              overflow: 'auto',
              fontSize: '0.8rem',
              lineHeight: 1.5,
              color: 'var(--text-primary, #c9d1d9)',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              whiteSpace: format === 'minified' ? 'pre-wrap' : 'pre',
              wordBreak: format === 'minified' ? 'break-all' : 'normal'
            }}>
              {embedCode}
            </pre>
          </div>

          {/* Instructions */}
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: 'rgba(88, 166, 255, 0.1)',
            borderRadius: '6px',
            border: '1px solid rgba(88, 166, 255, 0.2)'
          }}>
            <p style={{
              margin: 0,
              fontSize: '0.85rem',
              color: 'var(--text-secondary, #8b949e)',
              lineHeight: 1.5
            }}>
              Add this snippet to your HTML, just before the closing <code style={{ background: 'var(--bg-tertiary, #21262d)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>&lt;/body&gt;</code> tag.
              {config.model?.provider !== 'chrome' && (
                <span style={{ display: 'block', marginTop: '0.5rem', color: 'var(--warning, #d29922)' }}>
                  Note: Replace <code style={{ background: 'var(--bg-tertiary, #21262d)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>YOUR_API_KEY</code> with your actual API key.
                </span>
              )}
            </p>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #30363d)',
                background: 'transparent',
                color: 'var(--text-secondary, #8b949e)',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Close
            </button>
            <button
              onClick={handleCopy}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                border: 'none',
                background: copied ? 'var(--success, #238636)' : 'var(--accent-blue, #58a6ff)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                minWidth: '120px',
                justifyContent: 'center'
              }}
            >
              {copied ? '✓ Copied!' : '📋 Copy Code'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Custom MCP Editor Component - Inline single row
const CustomMCPEditor = ({ mcps = [], onChange }) => {
  const [newMcp, setNewMcp] = useState({ name: '', endpoint: '' });

  // Filter out MCPs that match predefined ones
  const customMcps = mcps.filter(mcp =>
    !PREDEFINED_MCPS.some(p => p.config.name === mcp.name)
  );

  const handleAdd = () => {
    if (newMcp.name.trim() && newMcp.endpoint.trim()) {
      const mcpConfig = {
        name: newMcp.name.trim(),
        transport: 'http',
        endpoint: newMcp.endpoint.trim()
      };
      onChange([...mcps, mcpConfig]);
      setNewMcp({ name: '', endpoint: '' });
    }
  };

  const handleUpdate = (index, field, value) => {
    const realIndex = mcps.findIndex(m => m.name === customMcps[index].name);
    const newMcps = [...mcps];
    newMcps[realIndex] = { ...newMcps[realIndex], [field]: value };
    onChange(newMcps);
  };

  const handleRemove = (index) => {
    const realIndex = mcps.findIndex(m => m.name === customMcps[index].name);
    onChange(mcps.filter((_, i) => i !== realIndex));
  };

  const inputStyle = {
    ...styles.input,
    fontSize: '0.8rem',
    padding: '0.35rem 0.5rem',
    background: 'var(--bg-primary, #0d1117)'
  };

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {/* Existing custom MCPs - editable inline */}
      {customMcps.map((mcp, index) => (
        <div key={mcp.name} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.3rem 0.5rem',
          background: 'rgba(88, 166, 255, 0.15)',
          borderRadius: '4px',
          marginBottom: '0.25rem'
        }}>
          <span style={{
            width: '14px',
            height: '14px',
            borderRadius: '3px',
            background: 'var(--accent-blue, #58a6ff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: '#fff',
            flexShrink: 0
          }}>✓</span>
          <input
            style={{ ...inputStyle, width: '80px', flexShrink: 0 }}
            value={mcp.name}
            onChange={(e) => handleUpdate(index, 'name', e.target.value)}
            placeholder="name"
          />
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={mcp.endpoint || ''}
            onChange={(e) => handleUpdate(index, 'endpoint', e.target.value)}
            placeholder="https://mcp.example.com/mcp"
          />
          <button
            style={{ ...styles.iconButton, width: '22px', height: '22px', fontSize: '14px' }}
            onClick={() => handleRemove(index)}
            title="Remove"
          >×</button>
        </div>
      ))}

      {/* Add new custom MCP - single row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.3rem 0.5rem'
      }}>
        <span style={{
          width: '14px',
          height: '14px',
          borderRadius: '3px',
          border: '1px dashed var(--border-color, #30363d)',
          flexShrink: 0
        }} />
        <input
          style={{ ...inputStyle, width: '80px', flexShrink: 0 }}
          value={newMcp.name}
          onChange={(e) => setNewMcp({ ...newMcp, name: e.target.value })}
          placeholder="name"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={newMcp.endpoint}
          onChange={(e) => setNewMcp({ ...newMcp, endpoint: e.target.value })}
          placeholder="https://mcp.example.com/mcp"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          style={{ ...styles.iconButton, width: '22px', height: '22px', fontSize: '14px', color: 'var(--accent-blue, #58a6ff)' }}
          onClick={handleAdd}
          title="Add"
        >+</button>
      </div>
    </div>
  );
};

// Main ConfigBuilder Component
const ConfigBuilder = ({ initialConfig, onConfigChange, onStartChat, wizardMode = false, onValidationChange }) => {
  const [mode, setMode] = useState('build'); // 'build' | 'edit'
  const [config, setConfig] = useState(() => ({
    ...DEFAULT_CONFIG,
    ...initialConfig
  }));
  const [jsonText, setJsonText] = useState('');
  const [errors, setErrors] = useState([]);
  const [mcpSearch, setMcpSearch] = useState('');
  const [expandedMcps, setExpandedMcps] = useState(new Set());
  const [showEmbedModal, setShowEmbedModal] = useState(false);

  // Derive JSON text from config for the editor (no need for useEffect)
  const derivedJsonText = useMemo(() => {
    return JSON.stringify(config, null, 2);
  }, [config]);

  // Validate config
  const validationResult = useMemo(() => {
    const isValid = validateConfig(config);
    return {
      isValid,
      errors: validateConfig.errors || []
    };
  }, [config]);

  // Report validation state changes when in wizard mode
  useEffect(() => {
    if (wizardMode && onValidationChange) {
      onValidationChange(errors.length === 0 && validationResult.isValid);
    }
  }, [wizardMode, errors, validationResult.isValid, onValidationChange]);

  // Filter MCPs based on search
  const filteredMcps = useMemo(() => {
    if (!mcpSearch.trim()) return PREDEFINED_MCPS;
    const search = mcpSearch.toLowerCase();
    return PREDEFINED_MCPS.filter(mcp =>
      mcp.name.toLowerCase().includes(search) ||
      mcp.url.toLowerCase().includes(search) ||
      mcp.tools?.some(t => t.toLowerCase().includes(search))
    );
  }, [mcpSearch]);

  // Toggle MCP expansion
  const toggleMcpExpand = useCallback((mcpId) => {
    setExpandedMcps(prev => {
      const next = new Set(prev);
      if (next.has(mcpId)) {
        next.delete(mcpId);
      } else {
        next.add(mcpId);
      }
      return next;
    });
  }, []);

  // Update config from form
  const updateConfig = useCallback((path, value) => {
    setConfig(prev => {
      const newConfig = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let obj = newConfig;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return newConfig;
    });
  }, []);

  // Handle JSON text change (in edit mode)
  const handleJsonChange = useCallback((value) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      setConfig(parsed);
      setErrors([]);
    } catch (e) {
      setErrors([e.message]);
    }
  }, []);

  // Handle mode switch
  const handleModeSwitch = useCallback((newMode) => {
    if (newMode === 'edit' && mode === 'build') {
      // When switching to edit mode, sync JSON text from config
      setJsonText(derivedJsonText);
    } else if (newMode === 'build' && mode === 'edit') {
      // When switching to build mode, try to parse any manual edits
      try {
        const parsed = JSON.parse(jsonText);
        setConfig(parsed);
        setErrors([]);
      } catch (e) {
        setErrors([e.message]);
        return; // Don't switch if JSON is invalid
      }
    }
    setMode(newMode);
  }, [mode, derivedJsonText, jsonText]);

  // Handle MCP selection
  const toggleMCP = useCallback((mcpConfig) => {
    setConfig(prev => {
      const mcps = prev.mcps || [];
      const existingIndex = mcps.findIndex(m => m.name === mcpConfig.name);
      if (existingIndex >= 0) {
        return { ...prev, mcps: mcps.filter((_, i) => i !== existingIndex) };
      } else {
        return { ...prev, mcps: [...mcps, mcpConfig] };
      }
    });
  }, []);

  // Handle start chat
  const handleStartChat = () => {
    onConfigChange?.(config);
    onStartChat?.();
  };

  // Get selected provider
  const selectedProvider = PROVIDERS.find(p => p.id === config.model?.provider) || PROVIDERS[0];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>⚙️ Config Builder</h3>
        <div style={styles.modeToggle}>
          <button
            type="button"
            style={styles.modeButton(mode === 'build')}
            onClick={() => handleModeSwitch('build')}
          >
            Build
          </button>
          <button
            type="button"
            style={styles.modeButton(mode === 'edit')}
            onClick={() => handleModeSwitch('edit')}
          >
            Edit JSON
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Validation Errors Only */}
        {errors.length > 0 && (
          <div style={styles.errorBanner}>
            ⚠️ {errors[0]}
          </div>
        )}
        {errors.length === 0 && !validationResult.isValid && validationResult.errors.length > 0 && (
          <div style={styles.errorBanner}>
            ⚠️ Schema validation: {validationResult.errors[0].message} at {validationResult.errors[0].instancePath || 'root'}
          </div>
        )}

        {mode === 'build' ? (
          <>
            {/* Model Section */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                <span>🤖</span> Model Provider
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Provider</label>
                  <select
                    style={styles.select}
                    value={config.model?.provider || 'openai'}
                    onChange={(e) => {
                      const provider = PROVIDERS.find(p => p.id === e.target.value);
                      updateConfig('model.provider', e.target.value);
                      if (provider) {
                        updateConfig('model.name', provider.models[0]);
                        if (!provider.requiresKey) {
                          updateConfig('model.apiKey', '');
                        }
                      }
                    }}
                  >
                    {PROVIDERS.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Model</label>
                  <select
                    style={styles.select}
                    value={config.model?.name || selectedProvider.models[0]}
                    onChange={(e) => updateConfig('model.name', e.target.value)}
                  >
                    {selectedProvider.models.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedProvider.requiresKey && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <div style={{ ...styles.field, flex: 1 }}>
                    <label style={styles.label}>API Key</label>
                    <input
                      style={styles.input}
                      type="password"
                      value={config.model?.apiKey || ''}
                      onChange={(e) => updateConfig('model.apiKey', e.target.value)}
                      placeholder="sk-..."
                    />
                  </div>
                  <div style={{ ...styles.field, flex: 1 }}>
                    <label style={styles.label}>Base URL (optional)</label>
                    <input
                      style={styles.input}
                      value={config.model?.baseUrl || ''}
                      onChange={(e) => updateConfig('model.baseUrl', e.target.value)}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* MCP Servers Section */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                <span>🔌</span> MCP Servers
              </div>
              {/* Search */}
              <input
                style={{ ...styles.input, marginBottom: '0.5rem' }}
                value={mcpSearch}
                onChange={(e) => setMcpSearch(e.target.value)}
                placeholder="Search MCP servers..."
              />
              {/* MCP List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {filteredMcps.map(mcp => {
                  const isSelected = config.mcps?.some(m => m.name === mcp.config.name);
                  const selectedMcp = config.mcps?.find(m => m.name === mcp.config.name);
                  const isExpanded = expandedMcps.has(mcp.id);
                  return (
                    <div key={mcp.id}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '4px',
                        background: isSelected ? 'rgba(88, 166, 255, 0.15)' : 'transparent'
                      }}>
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleMCP(mcp.config)}
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '3px',
                            border: `1px solid ${isSelected ? 'var(--accent-blue, #58a6ff)' : 'var(--border-color, #30363d)'}`,
                            background: isSelected ? 'var(--accent-blue, #58a6ff)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            color: '#fff',
                            flexShrink: 0,
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          {isSelected && '✓'}
                        </button>
                        {/* Name - clickable to expand */}
                        <button
                          type="button"
                          onClick={() => toggleMcpExpand(mcp.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            minWidth: '80px'
                          }}
                        >
                          <span style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-secondary, #8b949e)',
                            transition: 'transform 0.2s',
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                          }}>▶</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary, #c9d1d9)' }}>
                            {mcp.name}
                          </span>
                        </button>
                        {/* Tools count badge */}
                        {mcp.tools && (
                          <span style={{
                            fontSize: '0.65rem',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '8px',
                            background: 'var(--bg-tertiary, #21262d)',
                            color: 'var(--text-secondary, #8b949e)'
                          }}>
                            {mcp.tools.length} tools
                          </span>
                        )}
                        {/* URL */}
                        <span style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-secondary, #8b949e)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                          flex: 1,
                          textAlign: 'right'
                        }}>
                          {mcp.url}
                        </span>
                      </div>
                      {/* Expanded tools list */}
                      {isExpanded && mcp.tools && (
                        <div style={{
                          marginLeft: '2rem',
                          padding: '0.35rem 0.5rem',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.25rem'
                        }}>
                          {mcp.tools.map(tool => (
                            <span key={tool} style={{
                              fontSize: '0.7rem',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              background: 'var(--bg-primary, #0d1117)',
                              border: '1px solid var(--border-color, #30363d)',
                              color: 'var(--text-secondary, #8b949e)',
                              fontFamily: 'monospace'
                            }}>
                              {tool}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Configurable field when selected */}
                      {isSelected && mcp.configurable && (
                        <div style={{ marginLeft: '2rem', marginTop: '0.25rem', marginBottom: '0.25rem' }}>
                          <input
                            style={{ ...styles.input, fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                            value={selectedMcp?.args?.[selectedMcp.args.length - 1] || mcp.configurable.placeholder}
                            onChange={(e) => {
                              const newMcps = config.mcps.map(m => {
                                if (m.name === mcp.config.name) {
                                  const newArgs = [...(m.args || mcp.config.args)];
                                  newArgs[newArgs.length - 1] = e.target.value;
                                  return { ...m, args: newArgs };
                                }
                                return m;
                              });
                              updateConfig('mcps', newMcps);
                            }}
                            placeholder={mcp.configurable.placeholder}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredMcps.length === 0 && mcpSearch && (
                  <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary, #8b949e)', textAlign: 'center' }}>
                    No MCPs found matching "{mcpSearch}"
                  </div>
                )}
              </div>
              <CustomMCPEditor
                mcps={config.mcps || []}
                onChange={(mcps) => updateConfig('mcps', mcps)}
              />
            </div>

            {/* Policy Section */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                <span>🔒</span> Security Policy
              </div>
              <div style={styles.fieldGroup}>
                <ArrayField
                  label="Allowed Domains"
                  value={config.policy?.network?.allowedDomains || []}
                  onChange={(v) => updateConfig('policy.network.allowedDomains', v)}
                  placeholder="*.example.com"
                />
                <div style={styles.field}>
                  <label style={styles.label}>Memory Limit (MB)</label>
                  <input
                    style={styles.input}
                    type="number"
                    value={config.policy?.limits?.memMb || 256}
                    onChange={(e) => updateConfig('policy.limits.memMb', parseInt(e.target.value) || 256)}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Timeout (ms)</label>
                  <input
                    style={styles.input}
                    type="number"
                    value={config.policy?.limits?.timeoutMs || 60000}
                    onChange={(e) => updateConfig('policy.limits.timeoutMs', parseInt(e.target.value) || 60000)}
                  />
                </div>
              </div>
              <div style={{ ...styles.fieldGroup, marginTop: '1rem' }}>
                <label style={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={config.policy?.network?.blockPrivateRanges ?? true}
                    onChange={(e) => updateConfig('policy.network.blockPrivateRanges', e.target.checked)}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #8b949e)' }}>
                    Block private IP ranges
                  </span>
                </label>
              </div>
            </div>

            {/* Widget Section */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                <span>🎨</span> Widget Appearance
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Title</label>
                  <input
                    style={styles.input}
                    value={config.widget?.title || ''}
                    onChange={(e) => updateConfig('widget.title', e.target.value)}
                    placeholder="AI Assistant"
                  />
                </div>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Position</label>
                  <select
                    style={styles.select}
                    value={config.widget?.position || 'bottom-right'}
                    onChange={(e) => updateConfig('widget.position', e.target.value)}
                  >
                    {POSITIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ ...styles.field, marginTop: '1rem' }}>
                <label style={styles.label}>Placeholder</label>
                <input
                  style={styles.input}
                  value={config.widget?.placeholder || ''}
                  onChange={(e) => updateConfig('widget.placeholder', e.target.value)}
                  placeholder="Ask me anything..."
                />
              </div>
              {/* Theme */}
              <div style={{ marginTop: '1rem' }}>
                <label style={styles.label}>Theme</label>
                <div style={{ marginTop: '0.5rem' }}>
                  <ChatPreview
                    value={config.widget?.theme?.variables || {}}
                    onChange={(vars) => updateConfig('widget.theme.variables', vars)}
                    preset={config.widget?.theme?.preset || 'light'}
                    onPresetChange={(preset) => updateConfig('widget.theme.preset', preset)}
                  />
                </div>
              </div>
              <div style={{ ...styles.field, marginTop: '1rem' }}>
                <label style={styles.label}>System Prompt</label>
                <textarea
                  style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                  value={config.widget?.systemPrompt || ''}
                  onChange={(e) => updateConfig('widget.systemPrompt', e.target.value)}
                  placeholder="You are a helpful assistant..."
                />
              </div>

              {/* Plugins Section */}
              <div style={{ marginTop: '1rem' }}>
                <label style={styles.label}>Plugins (loaded from CDN when needed)</label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <label style={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={config.widget?.plugins?.shiki ?? false}
                      onChange={(e) => updateConfig('widget.plugins.shiki', e.target.checked)}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #8b949e)' }}>
                      Syntax Highlighting (shiki)
                    </span>
                  </label>
                  <label style={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={config.widget?.plugins?.mermaid ?? false}
                      onChange={(e) => updateConfig('widget.plugins.mermaid', e.target.checked)}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #8b949e)' }}>
                      Mermaid Diagrams
                    </span>
                  </label>
                </div>
                <p style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary, #8b949e)',
                  marginTop: '0.4rem',
                  fontStyle: 'italic'
                }}>
                  Plugins are loaded from CDN only when enabled, keeping the base bundle small (~244KB gzipped).
                </p>
              </div>
            </div>
          </>
        ) : (
          /* Edit Mode - CodeMirror */
          <div style={{ borderRadius: '8px', overflow: 'hidden' }}>
            <CodeMirror
              value={jsonText}
              height="400px"
              theme={oneDark}
              extensions={[json()]}
              onChange={handleJsonChange}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                autocompletion: true,
                bracketMatching: true,
                closeBrackets: true
              }}
              style={{ fontSize: '0.85rem', textAlign: 'left' }}
            />
          </div>
        )}

        {/* Actions - hidden in wizard mode */}
        {!wizardMode && (
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginTop: '1.5rem',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(config, null, 2));
              }}
              style={{
                ...styles.addButton,
                background: 'var(--bg-tertiary, #21262d)'
              }}
            >
              Copy Config
            </button>
            <button
              onClick={() => setShowEmbedModal(true)}
              disabled={errors.length > 0 || !validationResult.isValid}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                border: '1px solid var(--accent-blue, #58a6ff)',
                background: 'transparent',
                color: errors.length > 0 || !validationResult.isValid
                  ? 'var(--text-secondary, #8b949e)'
                  : 'var(--accent-blue, #58a6ff)',
                cursor: errors.length > 0 || !validationResult.isValid ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              &lt;/&gt; Get Embed Code
            </button>
            <button
              onClick={handleStartChat}
              disabled={errors.length > 0 || !validationResult.isValid}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                border: 'none',
                background: errors.length > 0 || !validationResult.isValid
                  ? 'var(--text-secondary, #8b949e)'
                  : 'var(--accent-blue, #58a6ff)',
                color: '#fff',
                cursor: errors.length > 0 || !validationResult.isValid ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              Start Chat
            </button>
          </div>
        )}
      </div>

      {/* Embed Code Modal - hidden in wizard mode */}
      {!wizardMode && showEmbedModal && (
        <EmbedCodeModal
          config={config}
          onClose={() => setShowEmbedModal(false)}
        />
      )}
    </div>
  );
};

export default ConfigBuilder;

