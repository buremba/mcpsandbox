import React, { useState } from 'react';
import { DEPLOYMENT_OPTIONS } from '../deployment-options';

const DeployStep = ({ config }) => {
  const [selectedOption, setSelectedOption] = useState(null);

  const handleSelectOption = (optionId) => {
    setSelectedOption(selectedOption === optionId ? null : optionId);
  };

  const selectedDeployment = DEPLOYMENT_OPTIONS.find(o => o.id === selectedOption);
  const SelectedComponent = selectedDeployment?.component;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Deploy to Your Website</h3>
        <p style={styles.description}>
          Choose how you'd like to add the widget to your website.
        </p>
      </div>

      {/* Options Grid - just cards, no expanded content */}
      <div style={styles.optionsGrid}>
        {DEPLOYMENT_OPTIONS.map((option) => {
          const isSelected = selectedOption === option.id;

          return (
            <div
              key={option.id}
              onClick={() => handleSelectOption(option.id)}
              style={styles.optionCard(isSelected)}
            >
              <div style={styles.optionHeader}>
                <span style={styles.optionIcon}>{option.icon}</span>
                <h4 style={styles.optionTitle}>{option.title}</h4>
              </div>
              <p style={styles.optionDescription}>{option.description}</p>
            </div>
          );
        })}
      </div>

      {/* Expanded content below the grid */}
      {selectedOption && SelectedComponent && (
        <div style={styles.expandedPanel}>
          <div style={styles.expandedHeader}>
            <span style={styles.expandedIcon}>{selectedDeployment.icon}</span>
            <h4 style={styles.expandedTitle}>{selectedDeployment.title}</h4>
          </div>
          <SelectedComponent config={config} />
        </div>
      )}

      <div style={styles.helpText}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--text-secondary)" style={{ marginRight: '0.5rem', flexShrink: 0 }}>
          <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm6.5-.25A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 100-2 1 1 0 000 2z" />
        </svg>
        <span>
          Can't find your deployment method? You can always copy the embed code from the previous step
          and add it manually to your website's HTML.
        </span>
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
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
  },
  optionCard: (isSelected) => ({
    padding: '1.25rem',
    borderRadius: '12px',
    border: `2px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-color)'}`,
    background: isSelected ? 'rgba(88, 166, 255, 0.08)' : 'var(--bg-tertiary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'center',
  }),
  optionHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  optionIcon: {
    fontSize: '1.75rem',
  },
  optionTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  optionDescription: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
    margin: 0,
  },
  expandedPanel: {
    marginTop: '1.5rem',
    padding: '1.5rem',
    background: 'var(--bg-tertiary)',
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
  },
  expandedHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
    paddingBottom: '1rem',
    borderBottom: '1px solid var(--border-color)',
  },
  expandedIcon: {
    fontSize: '1.5rem',
  },
  expandedTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  helpText: {
    display: 'flex',
    alignItems: 'flex-start',
    marginTop: '1.5rem',
    padding: '1rem',
    background: 'var(--bg-tertiary)',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
};

export default DeployStep;
