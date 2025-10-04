import React, { useState } from 'react';

interface BenchmarkProps {
  className?: string;
  wasmResults?: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  } | null;
  tsResults?: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  } | null;
  beResults?: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  } | null;
  currentTool?: 'voxel' | 'smoothing';
}

export const Benchmark: React.FC<BenchmarkProps> = ({ className, wasmResults, tsResults, beResults, currentTool = 'voxel' }) => {
  const [isVisible, setIsVisible] = useState(false);

  // Determine if we're showing voxel downsampling or smoothing results
  const isVoxelTool = currentTool === 'voxel' || (wasmResults && wasmResults.downsampledCount !== undefined);
  const isSmoothingTool = currentTool === 'smoothing' || (wasmResults && wasmResults.smoothedCount !== undefined);

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
            {/* TypeScript Column */}
            <div className="benchmark-column">
              <h4>TYPESCRIPT</h4>
              <div className="benchmark-metrics">
                <div className="metric-item">
                  <span className="metric-label">Time Taken:</span>
                  <span className="metric-value">
                    {tsResults ? `${tsResults.processingTime.toFixed(0)} ms` : '-- ms'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Original Points:</span>
                  <span className="metric-value">
                    {tsResults ? tsResults.originalCount.toLocaleString() : '--'}
                  </span>
                </div>
                {isVoxelTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Downsampled:</span>
                      <span className="metric-value">
                        {tsResults ? tsResults.downsampledCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Reduction:</span>
                      <span className="metric-value">
                        {tsResults && tsResults.reductionRatio ? `${((tsResults.reductionRatio - 1) * 100).toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Voxels:</span>
                      <span className="metric-value">
                        {tsResults ? tsResults.voxelCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
                {isSmoothingTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Smoothed:</span>
                      <span className="metric-value">
                        {tsResults ? tsResults.smoothedCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Radius:</span>
                      <span className="metric-value">
                        {tsResults ? `${tsResults.smoothingRadius?.toFixed(1) || '--'}m` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Iterations:</span>
                      <span className="metric-value">
                        {tsResults ? tsResults.iterations?.toString() || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

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
                {isVoxelTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Downsampled:</span>
                      <span className="metric-value">
                        {wasmResults ? wasmResults.downsampledCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Reduction:</span>
                      <span className="metric-value">
                        {wasmResults && wasmResults.reductionRatio ? `${((wasmResults.reductionRatio - 1) * 100).toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Voxels:</span>
                      <span className="metric-value">
                        {wasmResults ? wasmResults.voxelCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
                {isSmoothingTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Smoothed:</span>
                      <span className="metric-value">
                        {wasmResults ? wasmResults.smoothedCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Radius:</span>
                      <span className="metric-value">
                        {wasmResults ? `${wasmResults.smoothingRadius?.toFixed(1) || '--'}m` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Iterations:</span>
                      <span className="metric-value">
                        {wasmResults ? wasmResults.iterations?.toString() || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
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
                {isVoxelTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Downsampled:</span>
                      <span className="metric-value">
                        {beResults ? beResults.downsampledCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Reduction:</span>
                      <span className="metric-value">
                        {beResults && beResults.reductionRatio ? `${((beResults.reductionRatio - 1) * 100).toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Voxels:</span>
                      <span className="metric-value">
                        {beResults ? beResults.voxelCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
                {isSmoothingTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Smoothed:</span>
                      <span className="metric-value">
                        {beResults ? beResults.smoothedCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Radius:</span>
                      <span className="metric-value">
                        {beResults ? `${beResults.smoothingRadius?.toFixed(1) || '--'}m` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Iterations:</span>
                      <span className="metric-value">
                        {beResults ? beResults.iterations?.toString() || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
