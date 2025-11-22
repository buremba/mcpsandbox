import React from 'react';
import './HowItWorksSection.css';

const StepCard = ({ number, title, description, icon }) => (
    <div className="step-card">
        <div className="step-number">{number}</div>
        <div className="step-icon">{icon}</div>
        <h3 className="step-title">{title}</h3>
        <p className="step-description">{description}</p>
    </div>
);

const HowItWorksSection = () => {
    return (
        <section className="how-it-works-section">
            <div className="section-header">
                <h2 className="section-title">How It Works</h2>
                <p className="section-subtitle">Three steps to browser-based agent execution</p>
            </div>

            <div className="steps-container">
                <StepCard
                    number="01"
                    title="Agent Plans"
                    description="Your agent generates standard JavaScript code instead of making multiple expensive tool calls."
                    icon="🤖"
                />

                <div className="step-connector">→</div>

                <StepCard
                    number="02"
                    title="1mcp Relays"
                    description="The relay server bundles the code into a secure, signed capsule with strict policy enforcement."
                    icon="🛡️"
                />

                <div className="step-connector">→</div>

                <StepCard
                    number="03"
                    title="Browser Executes"
                    description="The client receives the capsule and executes it safely in a local WASM worker."
                    icon="⚡"
                />
            </div>
        </section>
    );
};

export default HowItWorksSection;
