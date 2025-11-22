import React from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import './IntegrationModal.css';

const IntegrationModal = ({ isOpen, onClose, title, content, language = 'json' }) => {
    React.useEffect(() => {
        if (isOpen) {
            Prism.highlightAll();
        }
    }, [isOpen, content]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <pre className="code-block">
                        <code className={`language-${language}`}>{content.trim()}</code>
                    </pre>
                </div>
            </div>
        </div>
    );
};

export default IntegrationModal;
