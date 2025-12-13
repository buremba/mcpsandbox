import React from 'react';
import ConfigBuilder from '../../ConfigBuilder';

const ConfigureStep = ({ config, onConfigChange, onValidationChange }) => {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Configure Your Widget</h3>
        <p style={styles.description}>
          Set up your AI model, MCP servers, security policies, and customize the appearance.
        </p>
      </div>
      <ConfigBuilder
        initialConfig={config}
        onConfigChange={onConfigChange}
        onValidationChange={onValidationChange}
        wizardMode={true}
      />
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
};

export default ConfigureStep;
