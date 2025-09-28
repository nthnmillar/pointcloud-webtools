import React, { useState } from 'react';

interface BenchmarkProps {
  className?: string;
  wasmResults?: {
    originalCount: number;
    downsampledCount: number;
    processingTime: number;
    reductionRatio: number;
    voxelCount: number;
  } | null;
  beResults?: {
    originalCount: number;
    downsampledCount: number;
    processingTime: number;
    reductionRatio: number;
  } | null;
}

export const Benchmark: React.FC<BenchmarkProps> = ({ className, wasmResults, beResults }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      {/* Toggle Button */}
      <div className="benchmark-toggle">
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="benchmark-toggle-btn"
        >
          {isVisible ? 'Hide' : 'Benchmark'}
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
                  <span className="metric-value">
                    {wasmResults ? `${wasmResults.processingTime.toFixed(0)} ms` : '-- ms'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Original Points:</span>
                  <span className="metric-value">
                    {wasmResults ? wasmResults.originalCount.toLocaleString() : '--'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Downsampled:</span>
                  <span className="metric-value">
                    {wasmResults ? wasmResults.downsampledCount.toLocaleString() : '--'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Reduction:</span>
                  <span className="metric-value">
                    {wasmResults ? `${((wasmResults.reductionRatio - 1) * 100).toFixed(1)}%` : '--'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Voxels:</span>
                  <span className="metric-value">
                    {wasmResults ? wasmResults.voxelCount.toLocaleString() : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Backend Column */}
            <div className="benchmark-column">
              <h4>BACKEND</h4>
              <div className="benchmark-metrics">
                <div className="metric-item">
                  <span className="metric-label">Time Taken:</span>
                  <span className="metric-value">
                    {beResults ? `${beResults.processingTime.toFixed(0)} ms` : '-- ms'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Original Points:</span>
                  <span className="metric-value">
                    {beResults ? beResults.originalCount.toLocaleString() : '--'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Downsampled:</span>
                  <span className="metric-value">
                    {beResults ? beResults.downsampledCount.toLocaleString() : '--'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Reduction:</span>
                  <span className="metric-value">
                    {beResults ? `${((beResults.reductionRatio - 1) * 100).toFixed(1)}%` : '--'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Method:</span>
                  <span className="metric-value">
                    {beResults ? 'Node.js' : '--'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
