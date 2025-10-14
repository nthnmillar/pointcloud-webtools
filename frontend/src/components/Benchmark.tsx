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
  wasmRustResults?: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  } | null;
  wasmCppMainResults?: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  } | null;
  rustWasmMainResults?: {
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

export const Benchmark: React.FC<BenchmarkProps> = ({ className, wasmResults, tsResults, beResults, wasmRustResults, wasmCppMainResults, rustWasmMainResults, currentTool = 'voxel' }) => {
  const [isVisible, setIsVisible] = useState(false);

  // Debug logging for WASM Rust results
  React.useEffect(() => {
    if (wasmRustResults) {
      console.log('🔧 Benchmark: WASM Rust results received:', wasmRustResults);
    }
  }, [wasmRustResults]);

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

            {/* WASM C++ Main Column */}
            <div className="benchmark-column">
              <h4>C++ Main</h4>
              <div className="benchmark-metrics">
                <div className="metric-item">
                  <span className="metric-label">Time Taken:</span>
                  <span className="metric-value">
                    {wasmCppMainResults ? `${wasmCppMainResults.processingTime.toFixed(0)} ms` : '-- ms'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Original Points:</span>
                  <span className="metric-value">
                    {wasmCppMainResults ? wasmCppMainResults.originalCount.toLocaleString() : '--'}
                  </span>
                </div>
                {isVoxelTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Downsampled:</span>
                      <span className="metric-value">
                        {wasmCppMainResults ? wasmCppMainResults.downsampledCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Reduction:</span>
                      <span className="metric-value">
                        {wasmCppMainResults && wasmCppMainResults.reductionRatio ? `${((wasmCppMainResults.reductionRatio - 1) * 100).toFixed(1)}%` : '--'}
                      </span>
                    </div>
                  </>
                )}
                {isSmoothingTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Smoothed:</span>
                      <span className="metric-value">
                        {wasmCppMainResults ? wasmCppMainResults.smoothedCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Radius:</span>
                      <span className="metric-value">
                        {wasmCppMainResults ? `${wasmCppMainResults.smoothingRadius?.toFixed(1) || '--'}m` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Iterations:</span>
                      <span className="metric-value">
                        {wasmCppMainResults ? wasmCppMainResults.iterations || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Rust WASM Main Column */}
            <div className="benchmark-column">
              <h4>Rust Main</h4>
              <div className="benchmark-metrics">
                <div className="metric-item">
                  <span className="metric-label">Time Taken:</span>
                  <span className="metric-value">
                    {rustWasmMainResults ? `${rustWasmMainResults.processingTime.toFixed(0)} ms` : '-- ms'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Original Points:</span>
                  <span className="metric-value">
                    {rustWasmMainResults ? rustWasmMainResults.originalCount.toLocaleString() : '--'}
                  </span>
                </div>
                {isVoxelTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Downsampled:</span>
                      <span className="metric-value">
                        {rustWasmMainResults ? rustWasmMainResults.downsampledCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Reduction:</span>
                      <span className="metric-value">
                        {rustWasmMainResults && rustWasmMainResults.reductionRatio ? `${((rustWasmMainResults.reductionRatio - 1) * 100).toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Voxels:</span>
                      <span className="metric-value">
                        {rustWasmMainResults ? rustWasmMainResults.voxelCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
                {isSmoothingTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Smoothed:</span>
                      <span className="metric-value">
                        {rustWasmMainResults ? rustWasmMainResults.smoothedCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Radius:</span>
                      <span className="metric-value">
                        {rustWasmMainResults ? rustWasmMainResults.smoothingRadius || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Iterations:</span>
                      <span className="metric-value">
                        {rustWasmMainResults ? rustWasmMainResults.iterations || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* WASM C++ Worker Column */}
            <div className="benchmark-column">
              <h4>C++ Worker</h4>
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

            {/* WASM Rust Column */}
            <div className="benchmark-column">
              <h4>Rust Worker</h4>
              <div className="benchmark-metrics">
                <div className="metric-item">
                  <span className="metric-label">Time Taken:</span>
                  <span className="metric-value">
                    {wasmRustResults ? `${wasmRustResults.processingTime.toFixed(0)} ms` : '-- ms'}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Original Points:</span>
                  <span className="metric-value">
                    {wasmRustResults ? wasmRustResults.originalCount.toLocaleString() : '--'}
                  </span>
                </div>
                {isVoxelTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Downsampled:</span>
                      <span className="metric-value">
                        {wasmRustResults ? wasmRustResults.downsampledCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Reduction:</span>
                      <span className="metric-value">
                        {wasmRustResults && wasmRustResults.reductionRatio ? `${((wasmRustResults.reductionRatio - 1) * 100).toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Voxels:</span>
                      <span className="metric-value">
                        {wasmRustResults ? wasmRustResults.voxelCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
                {isSmoothingTool && (
                  <>
                    <div className="metric-item">
                      <span className="metric-label">Smoothed:</span>
                      <span className="metric-value">
                        {wasmRustResults ? wasmRustResults.smoothedCount?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Radius:</span>
                      <span className="metric-value">
                        {wasmRustResults ? `${wasmRustResults.smoothingRadius?.toFixed(2) || '--'}m` : '--'}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Iterations:</span>
                      <span className="metric-value">
                        {wasmRustResults ? wasmRustResults.iterations?.toLocaleString() || '--' : '--'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Backend Column */}
            <div className="benchmark-column">
              <h4>BE C++</h4>
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
