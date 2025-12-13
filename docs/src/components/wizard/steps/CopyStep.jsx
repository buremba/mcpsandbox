import React, { useState, useMemo } from 'react';

const WIDGET_CDN_URL = 'https://1mcp.dev/widget.js';

const CopyStep = ({ config, onCopied }) => {
  const [format, setFormat] = useState('readable');
  const [copied, setCopied] = useState(false);

  const embedCode = useMemo(() => {
    const safeConfig = JSON.parse(JSON.stringify(config || {}));
    // Remove or mask API key
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
  }, [config, format]);

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    if (onCopied) onCopied();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Copy Embed Code</h3>
        <p style={styles.description}>
          Copy this code and paste it into your HTML before the closing &lt;/body&gt; tag.
        </p>
      </div>

      {/* Code Preview */}
      <div style={styles.codeContainer}>
        {/* Header */}
        <div style={styles.codeHeader}>
          <div style={styles.formatToggle}>
            <button
              onClick={() => setFormat('readable')}
              style={styles.formatButton(format === 'readable')}
            >
              Readable
            </button>
            <button
              onClick={() => setFormat('minified')}
              style={styles.formatButton(format === 'minified')}
            >
              Single Line
            </button>
          </div>
          <button onClick={handleCopy} style={styles.copyButton(copied)}>
            {copied ? '✓ Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Code */}
        <pre style={styles.code(format)}>
          {embedCode}
        </pre>
      </div>

      {/* Features */}
      <div style={styles.features}>
        {[
          { icon: '244KB', label: 'gzipped' },
          { icon: 'CDN', label: 'plugins lazy-loaded' },
          { icon: 'API', label: 'programmatic control' }
        ].map((item, i) => (
          <div key={i} style={styles.feature}>
            <span style={styles.featureIcon}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      {/* API Hint */}
      <div style={styles.apiHint}>
        <p style={styles.apiHintText}>
          <strong style={{ color: 'var(--text-primary)' }}>Programmatic Control:</strong>{' '}
          Once loaded, control the widget with{' '}
          <code style={styles.inlineCode}>window.$1mcpWidget.open()</code>,{' '}
          <code style={styles.inlineCode}>close()</code>, or{' '}
          <code style={styles.inlineCode}>toggle()</code>
        </p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    width: '100%',
  },
  header: {
    textAlign: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '0.5rem',
  },
  description: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
    maxWidth: '500px',
    margin: '0 auto',
  },
  codeContainer: {
    background: 'var(--bg-primary)',
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    overflow: 'hidden',
  },
  codeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--bg-tertiary)',
  },
  formatToggle: {
    display: 'flex',
    gap: '0.5rem',
  },
  formatButton: (isActive) => ({
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    border: 'none',
    background: isActive ? 'var(--accent-blue)' : 'transparent',
    color: isActive ? '#fff' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 500,
  }),
  copyButton: (copied) => ({
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    border: 'none',
    background: copied ? '#238636' : 'var(--accent-blue)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
  }),
  code: (format) => ({
    margin: 0,
    padding: '1.25rem',
    overflow: 'auto',
    fontSize: '0.8rem',
    lineHeight: 1.6,
    color: 'var(--text-primary)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    whiteSpace: format === 'minified' ? 'pre-wrap' : 'pre',
    wordBreak: format === 'minified' ? 'break-all' : 'normal',
    maxHeight: '300px',
  }),
  features: {
    display: 'flex',
    justifyContent: 'center',
    gap: '2rem',
    marginTop: '1.5rem',
    flexWrap: 'wrap',
  },
  feature: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--text-secondary)',
    fontSize: '0.85rem',
  },
  featureIcon: {
    fontWeight: 600,
    color: 'var(--accent-blue)',
  },
  apiHint: {
    marginTop: '1.5rem',
    padding: '1rem 1.25rem',
    background: 'rgba(88, 166, 255, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(88, 166, 255, 0.2)',
  },
  apiHintText: {
    margin: 0,
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  inlineCode: {
    background: 'var(--bg-tertiary)',
    padding: '0.1rem 0.4rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
  },
};

export default CopyStep;
