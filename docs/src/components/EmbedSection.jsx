import React, { useState, useCallback } from 'react';
import WizardStepIndicator from './wizard/WizardStepIndicator';
import WizardNavigation from './wizard/WizardNavigation';
import ConfigureStep from './wizard/steps/ConfigureStep';
import CopyStep from './wizard/steps/CopyStep';
import DeployStep from './wizard/steps/DeployStep';

const STEPS = [
  { number: 1, label: 'Configure' },
  { number: 2, label: 'Copy' },
  { number: 3, label: 'Deploy' },
];

const EmbedSection = ({ config: initialConfig, onConfigChange }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState(initialConfig || {});
  const [isConfigValid, setIsConfigValid] = useState(true);
  const [hasCopied, setHasCopied] = useState(false);

  const handleConfigChange = useCallback((newConfig) => {
    setConfig(newConfig);
    if (onConfigChange) {
      onConfigChange(newConfig);
    }
  }, [onConfigChange]);

  const handleValidationChange = useCallback((isValid) => {
    setIsConfigValid(isValid);
  }, []);

  const handleCopied = useCallback(() => {
    setHasCopied(true);
  }, []);

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = currentStep === 1 ? isConfigValid : true;

  return (
    <section id="embed" style={styles.section}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>Embed on Your Website</h2>
          <p style={styles.subtitle}>
            Configure your AI widget, copy the code, and deploy it to your website.
          </p>
        </div>

        <WizardStepIndicator steps={STEPS} currentStep={currentStep} />

        <div style={styles.stepContent}>
          {currentStep === 1 && (
            <ConfigureStep
              config={config}
              onConfigChange={handleConfigChange}
              onValidationChange={handleValidationChange}
            />
          )}
          {currentStep === 2 && (
            <CopyStep
              config={config}
              onCopied={handleCopied}
            />
          )}
          {currentStep === 3 && (
            <DeployStep config={config} />
          )}
        </div>

        <WizardNavigation
          currentStep={currentStep}
          totalSteps={STEPS.length}
          onNext={handleNext}
          onBack={handleBack}
          canProceed={canProceed}
        />
      </div>
    </section>
  );
};

const styles = {
  section: {
    padding: '4rem 2rem',
    background: 'var(--bg-secondary)',
  },
  container: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  title: {
    fontSize: 'clamp(1.5rem, 4vw, 2rem)',
    fontWeight: 700,
    marginBottom: '0.75rem',
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: '1rem',
    color: 'var(--text-secondary)',
    maxWidth: '600px',
    margin: '0 auto',
  },
  stepContent: {
    minHeight: '400px',
  },
};

export default EmbedSection;
