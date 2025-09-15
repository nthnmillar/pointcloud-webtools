import React, { useState } from 'react';

interface BenchmarkProps {
  className?: string;
}

export const Benchmark: React.FC<BenchmarkProps> = ({ className }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      {/* Toggle Button */}
      <div className="benchmark-toggle">
        <button 
          onClick={() => setIsVisible(!isVisible)}
          className="benchmark-toggle-btn"
        >
          {isVisible ? 'Hide' : 'Show'} Benchmark
        </button>
      </div>

      {/* Benchmark Panel */}
      {isVisible && (
        <div className={`benchmark-panel ${className || ''}`}>
          <div className="benchmark-header">
            <h3>Performance Benchmark</h3>
            <button 
              onClick={() => setIsVisible(false)}
              className="benchmark-close"
            >
              ×
            </button>
          </div>
          
          <div className="benchmark-content">
            {/* WASM Column */}
            <div className="benchmark-column">
              <h4>WASM</h4>
              <div className="benchmark-metrics">
                <div className="metric-item">
                  <span className="metric-label">Time Taken:</span>
                  <span className="metric-value">-- ms</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">GPU:</span>
                  <span className="metric-value">-- MB</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Draw Calls:</span>
                  <span className="metric-value">--</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Memory:</span>
                  <span className="metric-value">-- MB</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Points:</span>
                  <span className="metric-value">--</span>
                </div>
              </div>
            </div>

            {/* Backend Column */}
            <div className="benchmark-column">
              <h4>BACKEND</h4>
              <div className="benchmark-metrics">
                <div className="metric-item">
                  <span className="metric-label">Time Taken:</span>
                  <span className="metric-value">-- ms</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">GPU:</span>
                  <span className="metric-value">-- MB</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Draw Calls:</span>
                  <span className="metric-value">--</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Memory:</span>
                  <span className="metric-value">-- MB</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Points:</span>
                  <span className="metric-value">--</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
