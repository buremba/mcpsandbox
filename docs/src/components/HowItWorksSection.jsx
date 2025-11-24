import React from 'react';
import './HowItWorksSection.css';

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
            <div className="steps-container">
                <StepCard
                    title="🤖 Agent Plans"
                    description="Your agent generates standard JavaScript code instead of making multiple expensive tool calls."
                />

                <div className="step-connector">→</div>

                <StepCard
                    title="🛡️ 1mcp"
                    description="1mcp packages dependencies into a secure bundle, reverse proxies to your MCPs, and enforces policies."
                />

                <div className="step-connector">↔</div>

                <StepCard
                    title="🌐 User Browser"
                    description="The client executes generated Javascript code safely in a local WASM worker with QuickJS."
                />
            </div>
        </section>
    );
};

export default HowItWorksSection;
