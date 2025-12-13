import React from 'react';

const WizardStepIndicator = ({ steps, currentStep }) => {
  return (
    <div style={styles.container}>
      {steps.map((step, index) => {
        const isActive = currentStep === step.number;
        const isCompleted = currentStep > step.number;
        const isLast = index === steps.length - 1;

        return (
          <React.Fragment key={step.number}>
            <div style={styles.step}>
              <div style={styles.number(isActive, isCompleted)}>
                {isCompleted ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span style={styles.label(isActive, isCompleted)}>{step.label}</span>
            </div>
            {!isLast && <div style={styles.connector(isCompleted)} />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    marginBottom: '2.5rem',
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  number: (isActive, isCompleted) => ({
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: isActive
      ? 'var(--accent-blue)'
      : isCompleted
      ? 'var(--accent-green)'
      : 'var(--bg-tertiary)',
    color: isActive || isCompleted ? '#fff' : 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: '0.95rem',
    border: isActive ? 'none' : '1px solid var(--border-color)',
    transition: 'all 0.2s ease',
  }),
  label: (isActive, isCompleted) => ({
    fontSize: '0.9rem',
    fontWeight: isActive ? 600 : 400,
    color: isActive
      ? 'var(--text-primary)'
      : isCompleted
      ? 'var(--accent-green)'
      : 'var(--text-secondary)',
    transition: 'all 0.2s ease',
  }),
  connector: (isCompleted) => ({
    width: '60px',
    height: '2px',
    background: isCompleted ? 'var(--accent-green)' : 'var(--border-color)',
    margin: '0 0.5rem',
    transition: 'all 0.2s ease',
  }),
};

export default WizardStepIndicator;
