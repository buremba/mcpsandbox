import React, { useState } from 'react';
import IntegrationDropdown from './IntegrationDropdown';

const HeroSection = () => {
    const [selectedIntegration, setSelectedIntegration] = useState(null);
    const [copied, setCopied] = useState(false);

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <section className="hero-section">
            <div className="hero-content">
                <h1 className="hero-title">
                    Build your custom agent in minutes
                </h1>
                <p className="hero-subtitle">
                    .
                </p>

                <div className="hero-cta">
                    <a href="https://github.com/buremba/1mcp" target="_blank" rel="noopener noreferrer" className="github-button">
                        <svg height="20" viewBox="0 0 16 16" version="1.1" width="20" aria-hidden="true" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                        </svg>
                        Star on GitHub
                    </a>
                    <IntegrationDropdown
                        selectedIntegration={selectedIntegration}
                        onSelect={setSelectedIntegration}
                    />
                </div>

                {selectedIntegration && (selectedIntegration.type === 'command' || selectedIntegration.type === 'instructions') && (
                    <div className="integration-inline-content" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                        <div className="code-snippet">
                            <code>{selectedIntegration.content}</code>
                            <button
                                className="copy-btn-inline"
                                onClick={() => copyToClipboard(selectedIntegration.content)}
                            >
                                {copied ? '✓' : 'Copy'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Value Prop Strip */}
            <div className="value-props">
                <div className="value-prop">
                    <span className="value-icon">⚡</span>
                    <span>10ms cold start</span>
                </div>
                <div className="value-prop">
                    <span className="value-icon">🌐</span>
                    <span>Browser or server execution</span>
                </div>
                <div className="value-prop">
                    <span className="value-icon">🔒</span>
                    <span>WASM sandboxing</span>
                </div>
            </div>

            {/* CTA to scroll to embed section */}
            <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
                <a
                    href="#embed"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.875rem 2rem',
                        background: 'var(--accent-blue)',
                        color: '#fff',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontSize: '1rem',
                        fontWeight: 600,
                        transition: 'all 0.2s ease',
                    }}
                >
                    Get Started
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path fillRule="evenodd" d="M8 4a.5.5 0 01.5.5v5.793l2.146-2.147a.5.5 0 01.708.708l-3 3a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L7.5 10.293V4.5A.5.5 0 018 4z" />
                    </svg>
                </a>
            </div>
        </section>
    );
};

export default HeroSection;
