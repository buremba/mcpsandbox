import React from 'react';

const WizardNavigation = ({ currentStep, totalSteps, onNext, onBack, canProceed = true }) => {
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;

  return (
    <div style={styles.container}>
      <button
        onClick={onBack}
        disabled={isFirstStep}
        style={{
          ...styles.button,
          ...styles.backButton,
          ...(isFirstStep ? styles.buttonDisabled : {}),
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '0.5rem' }}>
          <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" />
        </svg>
        Back
      </button>

      <button
        onClick={onNext}
        disabled={!canProceed}
        style={{
          ...styles.button,
          ...styles.nextButton,
          ...(!canProceed ? styles.buttonDisabled : {}),
        }}
      >
        {isLastStep ? 'Done' : 'Next'}
        {!isLastStep && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ marginLeft: '0.5rem' }}>
            <path fillRule="evenodd" d="M8.22 3.47a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.53a.75.75 0 010-1.06z" />
          </svg>
        )}
      </button>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '2rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid var(--border-color)',
  },
  button: {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s ease',
  },
  backButton: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
  },
  nextButton: {
    background: 'var(--accent-blue)',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

export default WizardNavigation;
