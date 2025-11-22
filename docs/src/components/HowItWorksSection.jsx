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
                    title="🛡️ 1mcp Relays"
                    description="The relay server bundles the code into a secure, signed capsule with strict policy enforcement."
                />

                <div className="step-connector">→</div>

                <div className="step-column">
                    <StepCard
                        title="🌐 Browser Executes"
                        description="For web apps: The client executes it safely in a local WASM worker."
                        className="step-card-small"
                    />
                    <StepCard
                        title="☁️ Server Executes"
                        description="For backend: The server executes it in a sandboxed WASM environment."
                        className="step-card-small"
                    />
                </div>
            </div>
        </section>
    );
};

export default HowItWorksSection;
