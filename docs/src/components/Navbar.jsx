import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navbar = () => {
    const location = useLocation();
    const isHome = location.pathname === '/';

    return (
        <nav className="navbar">
            <div className="navbar-content">
                <Link to="/" className="logo" style={{ textDecoration: 'none', color: 'inherit' }}>
                    1mcp
                </Link>
                <div className="nav-links">
                    <Link
                        to="/product"
                        style={{
                            color: location.pathname === '/product' ? 'var(--accent-blue)' : 'inherit'
                        }}
                    >
                        Product
                    </Link>
                    {isHome && (
                        <>
                            <a href="#embed">Embed</a>
                            <a href="#faq">FAQ</a>
                        </>
                    )}
                    <a href="https://github.com/anthropics/1mcp" target="_blank" rel="noopener noreferrer">
                        GitHub
                    </a>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
