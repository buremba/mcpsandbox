import React from 'react';
import './HowItWorksSection.css';
import DemoSection from './DemoSection';

const StepCard = ({ number, title, description, icon, className = '' }) => (
    <div className={`step-card ${className}`}>
        <div className="step-number">{number}</div>
        <div className="step-icon">{icon}</div>
        <h3 className="step-title">{title}</h3>
        <p className="step-description">{description}</p>
    </div>
);

const HowItWorksSection = () => {
    return (
        <section className="how-it-works-section">
            <div className="section-header" style={{ textAlign: "center" }}>
                <h2 className="section-title">How It Works</h2>
            </div>
            <div className="hero-demo-wrapper">
                <DemoSection />
            </div>
        </section>
    );
};

export default HowItWorksSection;
