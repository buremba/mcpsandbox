import React from 'react';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-links">
                    <a href="https://github.com/buremba/1mcp" target="_blank" rel="noopener noreferrer">GitHub</a>
                    <a href="https://twitter.com/buremba" target="_blank" rel="noopener noreferrer">Twitter</a>
                </div>
                <p className="copyright">© {new Date().getFullYear()} 1mcp. Open source software.</p>
            </div>
        </footer>
    );
};

export default Footer;
