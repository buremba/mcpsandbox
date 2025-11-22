import React, { useState, useEffect } from 'react';
import StepItem from './StepItem';

const ProcessView = ({ mode, isRunning, onComplete, stepsData }) => {
    const [steps, setSteps] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    const allSteps = stepsData;

    const bottomRef = React.useRef(null);

    useEffect(() => {
        if (bottomRef.current) {
            const container = bottomRef.current.closest('.column');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }
    }, [steps]);

    useEffect(() => {
        if (isRunning) {
            setSteps([]);
            setCurrentIndex(0);
        }
    }, [isRunning]);

    useEffect(() => {
        if (!isRunning) return;

        if (currentIndex >= allSteps.length) {
            if (onComplete) onComplete();
            return;
        }

        const timeout = setTimeout(() => {
            setSteps(prev => [...prev, allSteps[currentIndex]]);
            setCurrentIndex(prev => prev + 1);
        }, mode === 'standard' ? 800 : 1500);

        return () => clearTimeout(timeout);
    }, [isRunning, currentIndex, mode, allSteps, onComplete]);

    return (
        <div className="process-view step-list">
            {steps.map((step, i) => (
                <StepItem key={i} {...step} isThinking={step.type === 'thinking' && i === steps.length - 1 && currentIndex < allSteps.length} />
            ))}
            <div ref={bottomRef} />
        </div>
    );
};

export default ProcessView;
