import React from 'react';

const ChatInput = ({ prompt, onStart, isRunning, demos, currentDemoIndex, onSelectDemo }) => {
    return (
        <div className="chat-input-container" style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
            <textarea
                value={prompt}
                readOnly
                style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '1rem',
                    fontFamily: 'var(--font-family)',
                    resize: 'none',
                    minHeight: '3rem'
                }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {demos && demos.map((demo, index) => (
                        <button
                            key={demo.id}
                            onClick={() => onSelectDemo(index)}
                            disabled={isRunning}
                            style={{
                                background: currentDemoIndex === index ? 'var(--bg-tertiary)' : 'transparent',
                                color: currentDemoIndex === index ? 'var(--text-primary)' : 'var(--text-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                padding: '0.25rem 0.75rem',
                                fontSize: '0.8rem',
                                cursor: isRunning ? 'default' : 'pointer',
                                opacity: isRunning ? 0.5 : 1,
                                transition: 'all 0.2s'
                            }}
                        >
                            {demo.label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={onStart}
                    disabled={isRunning}
                    className="primary-button"
                    style={{
                        fontSize: '0.85rem',
                        padding: '0.5rem 1rem',
                        border: '1px solid #000',
                        borderRadius: '4px',
                        opacity: isRunning ? 0.7 : 1,
                        cursor: isRunning ? 'default' : 'pointer',
                        background: isRunning ? 'var(--bg-tertiary)' : 'var(--accent-green)',
                        color: 'white'
                    }}
                >
                    {isRunning ? 'Running...' : 'Run Demo'}
                </button>
            </div>
        </div>
    );
};

export default ChatInput;
