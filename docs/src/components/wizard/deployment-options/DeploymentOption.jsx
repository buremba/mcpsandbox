import React from 'react';

const DeploymentOption = ({ title, description, icon, isSelected, onClick, children }) => {
  return (
    <div
      onClick={onClick}
      style={styles.card(isSelected)}
    >
      <div style={styles.header}>
        <span style={styles.icon}>{icon}</span>
        <h4 style={styles.title}>{title}</h4>
      </div>
      <p style={styles.description}>{description}</p>
      {isSelected && children && (
        <div style={styles.content} onClick={e => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
};

const styles = {
  card: (isSelected) => ({
    padding: '1.25rem',
    borderRadius: '12px',
    border: `2px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-color)'}`,
    background: isSelected ? 'rgba(88, 166, 255, 0.08)' : 'var(--bg-tertiary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }),
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.5rem',
  },
  icon: {
    fontSize: '1.5rem',
  },
  title: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  description: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
    margin: 0,
  },
  content: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid var(--border-color)',
  },
};

export default DeploymentOption;
