import React, { useState, useEffect, useCallback } from 'react';
import ChatInput from './ChatInput';
import ProcessView from './ProcessView';
import '../index.css';

import { DEMOS } from '../data/demos';

function DemoSection() {
  const [isRunning, setIsRunning] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [currentDemoIndex, setCurrentDemoIndex] = useState(0);
  const [restartCount, setRestartCount] = useState(0);

  const currentDemo = DEMOS[currentDemoIndex];

  const startDemo = () => {
    setIsRunning(true);
    setCompletedCount(0);
    setRestartCount(prev => prev + 1);
  };

  const handleSelectDemo = (index) => {
    if (index === currentDemoIndex) return;
    setIsRunning(false);
    setCompletedCount(0);
    setCurrentDemoIndex(index);
  };

  useEffect(() => {
    startDemo();
  }, [currentDemoIndex]);

  const handleComplete = useCallback(() => {
    setCompletedCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 2) {
        setIsRunning(false);
      }
      return newCount;
    });
  }, []);

  return (
    <div className="demo-container">
      <div className="header">
        <ChatInput
          prompt={currentDemo.prompt}
          onStart={startDemo}
          isRunning={isRunning}
          demos={DEMOS}
          currentDemoIndex={currentDemoIndex}
          onSelectDemo={handleSelectDemo}
        />
      </div>

      <div className="grid">
        <div className="column" style={{ paddingTop: '0' }}>
          <div className="column-header">
            <span>Without 1mcp</span>
          </div>
          <ProcessView
            key={`standard-${currentDemo.id}-${restartCount}`}
            mode="standard"
            stepsData={currentDemo.standardSteps}
            isRunning={isRunning}
            onComplete={handleComplete}
          />
        </div>

        <div className="column" style={{ paddingTop: '0' }}>
          <div className="column-header">
            <span>With 1mcp</span>
          </div>
          <ProcessView
            key={`optimized-${currentDemo.id}-${restartCount}`}
            mode="optimized"
            stepsData={currentDemo.optimizedSteps}
            isRunning={isRunning}
            onComplete={handleComplete}
          />
        </div>
      </div>
    </div>
  );
}

export default DemoSection;
