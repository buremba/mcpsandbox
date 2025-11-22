import React from 'react';

const Navbar = () => {
    return (
        <nav className="navbar">
            <div className="navbar-content">
                <div className="logo">1mcp</div>
                <div className="nav-links">
                    <a href="#features">Features</a>
                    <a href="#faq">FAQ</a>
                    <a href="https://github.com/buremba/1mcp" target="_blank" rel="noopener noreferrer">GitHub</a>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
