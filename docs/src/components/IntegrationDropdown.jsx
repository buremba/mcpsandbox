import React, { useState, useRef, useEffect } from 'react';
import IntegrationModal from './IntegrationModal';
import './IntegrationDropdown.css';

const INTEGRATIONS = [
    { id: 'ai-sdk', label: 'AI SDK', type: 'scroll' },
    {
        id: 'claude',
        label: 'Claude Code',
        type: 'modal',
        title: 'Connect to Claude Code',
        language: 'bash',
        content: `
# Run directly with npx
npx -y @1mcp/server
`
    },
    {
        id: 'cursor',
        label: 'Cursor',
        type: 'modal',
        title: 'Connect to Cursor',
        language: 'json',
        content: `
/* Add to your Cursor MCP settings */
{
  "mcpServers": {
    "1mcp": {
      "command": "npx",
      "args": ["-y", "@1mcp/server"]
    }
  }
}
`
    },
    {
        id: 'mcp-client',
        label: 'Any MCP Client',
        type: 'modal',
        title: 'Connect to any MCP Client',
        language: 'bash',
        content: `
# Use this command for any stdio-based MCP client
npx -y @1mcp/server
`
    }
];

const IntegrationDropdown = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIntegration, setSelectedIntegration] = useState(null);
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
        setIsOpen(false);

        if (integration.type === 'scroll') {
            const element = document.getElementById('features');
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
            }
        } else {
            setSelectedIntegration(integration);
        }
    };

    return (
        <>
            <div className="integration-dropdown" ref={dropdownRef}>
                <button
                    className="integration-button"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    Integrate
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

            <IntegrationModal
                isOpen={!!selectedIntegration}
                onClose={() => setSelectedIntegration(null)}
                title={selectedIntegration?.title || ''}
                content={selectedIntegration?.content || ''}
                language={selectedIntegration?.language || 'json'}
            />
        </>
    );
};

export default IntegrationDropdown;
