import React from 'react';
import './ResourcesSection.css';

const ResourcesSection = () => {
    return (
        <section className="resources-section">
            <div className="community-links">
                <a href="https://github.com/buremba/1mcp/issues" target="_blank" rel="noopener noreferrer" className="community-link">
                    <span className="community-icon">💬</span>
                    <span>GitHub Discussions</span>
                </a>
                <a href="https://github.com/buremba/1mcp/issues/new" target="_blank" rel="noopener noreferrer" className="community-link">
                    <span className="community-icon">🐞</span>
                    <span>Report an Issue</span>
                </a>
            </div>
        </section >
    );
};

export default ResourcesSection;
