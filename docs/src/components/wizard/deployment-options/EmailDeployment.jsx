import React, { useState, useMemo } from 'react';

const WIDGET_CDN_URL = 'https://1mcp.dev/widget.js';

const EmailDeployment = ({ config }) => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const embedCode = useMemo(() => {
    const safeConfig = JSON.parse(JSON.stringify(config || {}));
    if (safeConfig.model?.apiKey) {
      safeConfig.model.apiKey = 'YOUR_API_KEY';
    }
    const configJson = JSON.stringify(safeConfig, null, 2);

    return `<!-- 1mcp AI Widget -->
<script>
window.$1mcp = ${configJson};
</script>
<script src="${WIDGET_CDN_URL}" async></script>`;
  }, [config]);

  const handleSendEmail = () => {
    if (!email) return;

    const subject = encodeURIComponent('1mcp AI Widget - Installation Instructions');
    const body = encodeURIComponent(`Hi,

Please add the following code to our website before the closing </body> tag:

${embedCode}

For more information, visit: https://1mcp.dev

Thanks!`);

    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  const isValidEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <div style={styles.container}>
      <p style={styles.description}>
        Send installation instructions to a teammate who manages your website.
      </p>

      <div style={styles.inputGroup}>
        <label style={styles.label}>Recipient Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="developer@company.com"
          style={styles.input}
        />
      </div>

      <button
        onClick={handleSendEmail}
        disabled={!isValidEmail}
        style={{
          ...styles.sendButton,
          ...(isValidEmail ? {} : styles.sendButtonDisabled),
        }}
      >
        {sent ? (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '0.5rem' }}>
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
            Email Client Opened!
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '0.5rem' }}>
              <path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0114.25 14H1.75A1.75 1.75 0 010 12.25v-8.5C0 2.784.784 2 1.75 2zM1.5 12.25c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V5.809L8.38 9.397a.75.75 0 01-.76 0L1.5 5.809v6.441zm13-8.181v-.319a.25.25 0 00-.25-.25H1.75a.25.25 0 00-.25.25v.319l6.5 3.924 6.5-3.924z" />
            </svg>
            Send Instructions
          </>
        )}
      </button>

      <div style={styles.note}>
        <strong>Note:</strong> This will open your default email client with pre-filled
        instructions and the embed code.
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  description: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    margin: 0,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  input: {
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  sendButton: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--accent-blue)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  note: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    padding: '0.75rem',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
  },
};

export default EmailDeployment;
