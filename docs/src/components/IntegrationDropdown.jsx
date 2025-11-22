import React, { useState, useRef, useEffect } from 'react';
import './IntegrationDropdown.css';

const INTEGRATIONS = [
    {
        id: 'ai-sdk',
        label: 'AI SDK',
        type: 'link',
        linkTo: '#features'
    },
    {
        id: 'react',
        label: 'React',
        type: 'link',
        linkTo: '#features'
    },
    {
        id: 'claude-code',
        label: 'Claude Code',
        type: 'command',
        language: 'bash',
        content: `claude mcp add --transport stdio 1mcp npx -y 1mcp`
    },
    {
        id: 'claude-desktop',
        label: 'Claude Desktop',
        type: 'instructions',
        content: 'Open Claude Desktop → Settings → Connectors → Add Custom Connector. Name: 1mcp, Command: npx, Args: -y 1mcp'
    },
    {
        id: 'cursor',
        label: 'Cursor',
        type: 'link',
        linkTo: 'cursor://mcp/add?name=1mcp&command=npx&args=-y,1mcp'
    },
    {
        id: 'amp',
        label: 'Amp',
        type: 'command',
        language: 'bash',
        content: `amp mcp add 1mcp npx -y 1mcp`
    }
];

const IntegrationDropdown = ({ selectedIntegration, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (integration) => {
        if (integration.type === 'link') {
            if (integration.linkTo.startsWith('#')) {
                const element = document.querySelector(integration.linkTo);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            } else {
                // External link (like Cursor deeplink)
                window.location.href = integration.linkTo;
            }
            setIsOpen(false);
        } else {
            onSelect(integration);
            setIsOpen(false);
        }
    };

    const getButtonText = () => {
        if (selectedIntegration) {
            return `Integrate ${selectedIntegration.label}`;
        }
        return 'Integrate';
    };

    return (
        <div className="integration-wrapper">
            <div className="integration-dropdown" ref={dropdownRef}>
                <button
                    className="integration-button"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {getButtonText()}
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className={`dropdown-arrow ${isOpen ? 'open' : ''}`}
                    >
                        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                {isOpen && (
                    <div className="dropdown-menu">
                        {INTEGRATIONS.map((item) => (
                            <button
                                key={item.id}
                                className="dropdown-item"
                                onClick={() => handleSelect(item)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default IntegrationDropdown;
