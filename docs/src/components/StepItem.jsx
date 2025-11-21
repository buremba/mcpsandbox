import React, { useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';

const StepItem = ({ type, content, isThinking, language }) => {
    // type: 'thinking' | 'tool-call' | 'result' | 'final'

    useEffect(() => {
        if (language) {
            Prism.highlightAll();
        }
    }, [content, language]);

    let borderColor = 'var(--border-color)';
    let icon = '○';
    let textColor = 'var(--text-secondary)';
    let label = '';

    if (type === 'thinking') {
        icon = '💭';
        textColor = 'var(--text-secondary)';
        label = 'Thinking';
    } else if (type === 'tool-call') {
        borderColor = 'var(--accent-blue)';
        icon = '⚡';
        textColor = 'var(--accent-blue)';
        label = 'Tool Call';
    } else if (type === 'partial-result') {
        icon = '🔸';
        textColor = 'var(--text-secondary)';
        label = 'Result';
    } else if (type === 'result') {
        icon = '✅';
        textColor = 'var(--accent-green)';
        label = 'Final Answer';
    }

    const isCode = !!language;

    return (
        <div className="step-item" style={{
            display: 'flex',
            gap: '0.25rem',
            padding: '0.5rem 0.75rem',
            borderLeft: `2px solid ${borderColor}`,
            background: 'rgba(255,255,255,0.02)',
            fontSize: '0.9rem',
            alignItems: 'flex-start',
            borderRadius: '0 6px 6px 0'
        }}>
            <div style={{ minWidth: '1.5rem', display: 'flex', justifyContent: 'center', paddingTop: '2px', fontSize: '1.1rem' }}>{icon}</div>
            <div style={{ flex: 1, overflow: 'hidden', textAlign: 'left' }}>
                {label && (
                    <div style={{
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-secondary)',
                        marginBottom: '0.25rem',
                        opacity: 0.7
                    }}>
                        {label}
                    </div>
                )}

                <div className="font-mono" style={{
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-primary)',
                    opacity: 0.9,
                    fontSize: isCode ? '0.85rem' : '0.9rem',
                    background: isCode ? '#1e1e1e' : 'transparent',
                    padding: isCode ? '0.75rem' : '0',
                    borderRadius: '6px',
                    border: isCode ? '1px solid var(--border-color)' : 'none'
                }}>
                    {isCode ? (
                        <pre style={{ margin: 0, padding: 0, background: 'transparent', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            <code className={`language-${language}`} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</code>
                        </pre>
                    ) : (
                        <>
                            {content}
                            {isThinking && <span className="cursor-blink">_</span>}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StepItem;
