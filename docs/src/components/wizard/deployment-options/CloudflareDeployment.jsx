import React, { useState } from 'react';

const WIDGET_CDN_URL = 'https://1mcp.dev/widget.js';

const CloudflareDeployment = ({ config }) => {
  const [copied, setCopied] = useState(false);

  const generateCFCode = () => {
    const safeConfig = JSON.parse(JSON.stringify(config || {}));
    if (safeConfig.model?.apiKey) {
      safeConfig.model.apiKey = 'YOUR_API_KEY';
    }
    const base64Config = btoa(JSON.stringify(safeConfig));

    return `<script src="${WIDGET_CDN_URL}" data-config="${base64Config}" async></script>`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateCFCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={styles.container}>
      <div style={styles.instructions}>
        <h5 style={styles.instructionsTitle}>How to add via Cloudflare Snippets:</h5>
        <ol style={styles.instructionsList}>
          <li>Go to your Cloudflare dashboard</li>
          <li>Select your zone → Rules → Snippets</li>
          <li>Create a new snippet</li>
          <li>Paste the code below</li>
          <li>Set placement to "End of &lt;body&gt;"</li>
          <li>Deploy the snippet</li>
        </ol>
      </div>

      <div style={styles.codeBox}>
        <div style={styles.codeHeader}>
          <span style={styles.codeLabel}>Cloudflare Snippet</span>
          <button onClick={handleCopy} style={styles.copyButton(copied)}>
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
        <pre style={styles.code}>
          {generateCFCode()}
        </pre>
      </div>

      <div style={styles.note}>
        <strong>Tip:</strong> The single-line format with base64 config is recommended for Cloudflare Snippets
        to avoid any potential parsing issues.
      </div>

      <a
        href="https://dash.cloudflare.com/"
        target="_blank"
        rel="noopener noreferrer"
        style={styles.link}
      >
        Open Cloudflare Dashboard
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginLeft: '0.35rem' }}>
          <path d="M3.75 2h3.5a.75.75 0 010 1.5h-2.69l5.72 5.72a.75.75 0 11-1.06 1.06L3.5 4.56v2.69a.75.75 0 01-1.5 0v-3.5A.75.75 0 012.75 3h1zm8.5 3.5a.75.75 0 01.75.75v6A1.75 1.75 0 0111.25 14h-6A1.75 1.75 0 013.5 12.25v-6a.75.75 0 011.5 0v6c0 .138.112.25.25.25h6a.25.25 0 00.25-.25v-6a.75.75 0 01.75-.75z" />
        </svg>
      </a>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  instructions: {
    background: 'var(--bg-secondary)',
    padding: '1rem',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
  },
  instructionsTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '0 0 0.75rem 0',
  },
  instructionsList: {
    margin: 0,
    paddingLeft: '1.25rem',
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  codeBox: {
    background: 'var(--bg-primary)',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    overflow: 'hidden',
  },
  codeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--bg-tertiary)',
  },
  codeLabel: {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  copyButton: (copied) => ({
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    border: 'none',
    background: copied ? '#238636' : 'var(--accent-blue)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: 500,
  }),
  code: {
    margin: 0,
    padding: '0.75rem',
    overflow: 'auto',
    fontSize: '0.7rem',
    lineHeight: 1.5,
    color: 'var(--text-primary)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  note: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    padding: '0.75rem',
    background: 'rgba(88, 166, 255, 0.1)',
    borderRadius: '6px',
    border: '1px solid rgba(88, 166, 255, 0.2)',
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-blue)',
    fontSize: '0.85rem',
    textDecoration: 'none',
    fontWeight: 500,
  },
};

export default CloudflareDeployment;
