import React, { useState, useEffect, useRef } from 'react';
import { ServiceManager } from '../services/ServiceManager';
import { Log } from '../utils/Log';
import { WorkerManager } from '../services/tools/WorkerManager';
import { createVoxelDownsamplingHandlers } from './tools/VoxelDownsamplingHandlers';
import { createPointCloudSmoothingHandlers } from './tools/PointCloudSmoothingHandlers';
import { createVoxelDebugHandlers } from './tools/VoxelDebugHandlers';
import type { ToolCallbacks } from './tools/ToolsTypes';

interface ToolsProps {
  serviceManager: ServiceManager | null;
  className?: string;
  onWasmResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onWasmCppMainResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onTsResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onBeResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onWasmRustResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onBeRustResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onBePythonResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onRustWasmMainResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onCurrentToolChange?: (tool: 'voxel' | 'smoothing') => void;
}

export const Tools: React.FC<ToolsProps> = ({
  serviceManager,
  className,
  onWasmResults,
  onTsResults,
  onBeResults,
  onWasmRustResults,
  onBeRustResults,
  onBePythonResults,
  onWasmCppMainResults,
  onRustWasmMainResults,
  onCurrentToolChange,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [voxelSize] = useState(2.0); // Fixed voxel size for downsampling
  const [debugVoxelSize, setDebugVoxelSize] = useState(2.0); // Separate voxel size for debug visualization
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVoxelDebug, setShowVoxelDebug] = useState(false);

  // Point cloud smoothing state
  const [smoothingRadius, setSmoothingRadius] = useState(0.5);
  const [smoothingIterations, setSmoothingIterations] = useState(3);

  // Use ref to track processing state for event handlers
  const isProcessingRef = useRef(false);

  // Processing worker for WASM implementations (separate threads)
  const workerManager = useRef<WorkerManager | null>(null);
  const isInitializing = useRef(false);

  // Initialize workers for WASM threading
  useEffect(() => {
    const initWorkers = async () => {
      try {
        // Prevent double initialization
        if (workerManager.current || isInitializing.current) {
          Log.Info(
            'Tools',
            'WorkerManager already exists or initializing, skipping'
          );
          return;
        }

        isInitializing.current = true;
        Log.Info('Tools', 'Creating WorkerManager...');
        workerManager.current = new WorkerManager();
        Log.Info('Tools', 'Initializing WorkerManager...');
        await workerManager.current.initialize();
        Log.Info('Tools', 'Workers initialized for WASM threading');
        isInitializing.current = false;
      } catch (error) {
        Log.Error('Tools', 'Failed to initialize workers - FAILING', error);
        isInitializing.current = false;
        // Set workerManager to null to indicate complete failure
        workerManager.current = null;
        throw error; // Re-throw to make the failure visible
      }
    };

    initWorkers();

    return () => {
      if (workerManager.current && !isInitializing.current) {
        Log.Info('Tools', 'Cleaning up WorkerManager...');
        workerManager.current.dispose();
        workerManager.current = null;
      }
    };
  }, []);

  // Component uses its own default values for voxel size and smoothing parameters
  // These defaults are separate from service-level defaults to allow component-level control

  // Listen for clear scene button clicks to turn off voxel debug toggle
  useEffect(() => {
    if (!serviceManager) return;

    const handleSceneClearedByUser = () => {
      setShowVoxelDebug(false);
    };

    serviceManager.on('sceneClearedByUser', handleSceneClearedByUser);

    return () => {
      serviceManager.off('sceneClearedByUser', handleSceneClearedByUser);
    };
  }, [serviceManager]);

  // Listen for point cloud clearing events to reset processing state
  useEffect(() => {
    if (!serviceManager?.pointService) return;

    const handlePointCloudsCleared = () => {
      setIsProcessing(false);
    };

    serviceManager.pointService.on('cleared', handlePointCloudsCleared);

    return () => {
      serviceManager.pointService.off('cleared', handlePointCloudsCleared);
    };
  }, [serviceManager]);

  // Listen to tools processing events
  useEffect(() => {
    if (!serviceManager?.toolsService) return;

    const toolsService = serviceManager.toolsService;

    const handleProcessingFinished = () => {
      setIsProcessing(false);
      isProcessingRef.current = false;
    };
    const handleProcessingCancelled = () => {
      setIsProcessing(false);
      isProcessingRef.current = false;
    };

    toolsService.on('processingCompleted', handleProcessingFinished);
    toolsService.on('processingError', handleProcessingCancelled);

    return () => {
      toolsService.off('processingCompleted', handleProcessingFinished);
      toolsService.off('processingError', handleProcessingCancelled);
    };
  }, [serviceManager]);

  // Handle voxel size changes (for debug visualization only)
  const handleVoxelSizeChange = (newSize: number) => {
    setDebugVoxelSize(newSize); // Only update debug voxel size
    if (serviceManager?.toolsService) {
      // Update voxel debug visualization if it's currently visible
      if (showVoxelDebug) {
        // Update existing debug squares instead of creating new ones
        serviceManager.toolsService.updateVoxelSize(newSize);
      }
    }
  };

  // Handle voxel debug visualization
  const handleVoxelDebugToggle = () => {
    const newShowDebug = !showVoxelDebug;
    setShowVoxelDebug(newShowDebug);

    if (serviceManager?.toolsService) {
      if (newShowDebug) {
        // Show voxel debug grid
        serviceManager.toolsService.showVoxelDebug(debugVoxelSize, 'TS', 2000);
      } else {
        // Hide voxel debug grid
        serviceManager.toolsService.hideVoxelDebug();
      }
    }
  };

  // Handle cancellation
  const handleCancelProcessing = () => {
    if (serviceManager?.toolsService && isProcessing) {
      Log.Info('Tools', 'Cancelling processing...');
      // Cancellation is handled by the tools service
    }
  };

  // Create all tool handlers using factory functions
  const callbacks: ToolCallbacks = {
    onWasmResults,
    onWasmCppMainResults,
    onTsResults,
    onBeResults,
    onWasmRustResults,
    onBeRustResults,
    onBePythonResults,
    onRustWasmMainResults,
    onCurrentToolChange,
  };

  const toolHandlers = {
    serviceManager,
    callbacks,
    voxelSize,
    debugVoxelSize,
    smoothingRadius,
    smoothingIterations,
    showVoxelDebug,
    isProcessing,
    setIsProcessing,
    setShowVoxelDebug,
    setDebugVoxelSize,
    isProcessingRef,
    workerManager,
  };

  // Create handlers from separated modules
  const voxelDownsamplingHandlers =
    createVoxelDownsamplingHandlers(toolHandlers);
  const pointCloudSmoothingHandlers =
    createPointCloudSmoothingHandlers(toolHandlers);
  const voxelDebugHandlers = createVoxelDebugHandlers(toolHandlers);

  // Destructure handlers for use in UI
  const {
    handleRustWasmMainVoxelDownsampling,
    handleWasmVoxelDownsampling,
    handleBeVoxelDownsampling,
    handleBeRustVoxelDownsampling,
    handleBePythonVoxelDownsampling,
    handleTsVoxelDownsampling,
    handleWasmCppMainVoxelDownsampling,
    handleWasmRustVoxelDownsampling,
  } = voxelDownsamplingHandlers;

  const {
    handleRustWasmMainPointCloudSmoothing,
    handleWasmPointCloudSmoothing,
    handleWasmCppMainPointCloudSmoothing,
    handleWasmRustPointCloudSmoothing,
    handleTsPointCloudSmoothing,
    handleBePointCloudSmoothing,
    handleBeRustPointCloudSmoothing,
    handleBePythonPointCloudSmoothing,
  } = pointCloudSmoothingHandlers;

  const {
    handleTsVoxelDebug,
    handleWasmCppMainVoxelDebug,
    handleRustWasmMainVoxelDebug,
    handleCppWasmWorkerVoxelDebug,
    handleRustWasmWorkerVoxelDebug,
    handleBeVoxelDebug,
    handleBeRustVoxelDebug,
    handleBePythonVoxelDebug,
  } = voxelDebugHandlers;

  const tools = [
    {
      name: 'Voxel Downsampling',
      description: 'Reduce point count by averaging points in grid cells',
    },
    {
      name: 'Point Cloud Smoothing',
      description: 'Smooth point cloud using Gaussian filtering',
    },
  ];

  return (
    <>
      {/* Toggle Button */}
      <div className="tools-toggle">
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="tools-toggle-btn"
        >
          {isVisible ? 'Hide' : 'Tools'}
        </button>
      </div>

      {/* Tools Panel */}
      {isVisible && (
        <div className={`tools-panel ${className || ''}`}>
          <div className="tools-header">
            <h3>Point Cloud Tools</h3>
            <button onClick={() => setIsVisible(false)} className="tools-close">
              ×
            </button>
          </div>

          <div className="tools-content">
            <div className="tools-table">
              <div className="tools-table-header">
                <div className="tools-col-1">Tool</div>
                <div className="tools-col-2">Controls</div>
                <div className="tools-col-3">TS</div>
                <div className="tools-col-4">C++ Main</div>
                <div className="tools-col-5">Rust Main</div>
                <div className="tools-col-6">C++ Worker</div>
                <div className="tools-col-7">Rust Worker</div>
                <div className="tools-col-8">C++ BE</div>
                <div className="tools-col-9">Rust BE</div>
                <div className="tools-col-10">Python BE</div>
              </div>

              {tools.map((tool, index) => (
                <React.Fragment key={index}>
                  <div className="tools-table-row">
                    <div className="tools-col-1">
                      <div className="tool-name">{tool.name}</div>
                      <div className="tool-description">{tool.description}</div>
                    </div>
                    <div className="tools-col-2">
                      {tool.name === 'Voxel Downsampling' && (
                        <div className="tool-control">
                          {/* <div className="tool-batch-size">
                            <label>WASM Batch Size:</label>
                            <input
                              type="range"
                              min="100"
                              max="5000"
                              step="500"
                              value={wasmBatchSize}
                              onChange={e => handleWasmBatchSizeChange(parseInt(e.target.value))}
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <span style={{ marginLeft: '8px', fontSize: '12px' }}>
                              {wasmBatchSize}
                            </span>
                          </div> */}
                        </div>
                      )}
                      {tool.name === 'Point Cloud Smoothing' && (
                        <div className="tool-control">
                          <div className="tool-slider-container">
                            <label>Smoothing Radius:</label>
                            <input
                              type="range"
                              min="0.1"
                              max="2.0"
                              step="0.1"
                              value={smoothingRadius}
                              onChange={e =>
                                setSmoothingRadius(parseFloat(e.target.value))
                              }
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <div
                              className="tool-value"
                              style={{ marginLeft: '8px', fontSize: '12px' }}
                            >
                              {smoothingRadius.toFixed(1)}m
                            </div>
                          </div>
                          <div className="tool-slider-container">
                            <label>Iterations:</label>
                            <input
                              type="range"
                              min="1"
                              max="10"
                              step="1"
                              value={smoothingIterations}
                              onChange={e =>
                                setSmoothingIterations(parseInt(e.target.value))
                              }
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <div
                              className="tool-value"
                              style={{ marginLeft: '8px', fontSize: '12px' }}
                            >
                              {smoothingIterations}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="tools-col-3">
                      <button
                        className="tools-ts-btn"
                        onClick={
                          tool.name === 'Voxel Downsampling'
                            ? handleTsVoxelDownsampling
                            : tool.name === 'Point Cloud Smoothing'
                              ? handleTsPointCloudSmoothing
                              : undefined
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing &&
                        (tool.name === 'Voxel Downsampling' ||
                          tool.name === 'Point Cloud Smoothing')
                          ? 'Processing...'
                          : 'TS'}
                      </button>
                    </div>
                    <div className="tools-col-4">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <button
                          className="tools-wasm-main-btn"
                          onClick={
                            tool.name === 'Voxel Downsampling'
                              ? handleWasmCppMainVoxelDownsampling
                              : tool.name === 'Point Cloud Smoothing'
                                ? handleWasmCppMainPointCloudSmoothing
                                : undefined
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing &&
                          (tool.name === 'Voxel Downsampling' ||
                            tool.name === 'Point Cloud Smoothing')
                            ? 'Processing...'
                            : 'C++ Main'}
                        </button>
                        {isProcessing &&
                          (tool.name === 'Voxel Downsampling' ||
                            tool.name === 'Point Cloud Smoothing') && (
                            <button
                              className="tools-cancel-btn"
                              onClick={handleCancelProcessing}
                              style={{
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          )}
                      </div>
                    </div>
                    <div className="tools-col-5">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <button
                          className="tools-rust-wasm-main-btn"
                          onClick={
                            tool.name === 'Voxel Downsampling'
                              ? handleRustWasmMainVoxelDownsampling
                              : tool.name === 'Point Cloud Smoothing'
                                ? handleRustWasmMainPointCloudSmoothing
                                : undefined
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing &&
                          (tool.name === 'Voxel Downsampling' ||
                            tool.name === 'Point Cloud Smoothing')
                            ? 'Processing...'
                            : 'Rust Main'}
                        </button>
                        {isProcessing &&
                          (tool.name === 'Voxel Downsampling' ||
                            tool.name === 'Point Cloud Smoothing') && (
                            <button
                              className="tools-cancel-btn"
                              onClick={handleCancelProcessing}
                              style={{
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          )}
                      </div>
                    </div>
                    <div className="tools-col-6">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <button
                          className="tools-wasm-btn"
                          onClick={
                            tool.name === 'Voxel Downsampling'
                              ? handleWasmVoxelDownsampling
                              : tool.name === 'Point Cloud Smoothing'
                                ? handleWasmPointCloudSmoothing
                                : undefined
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing &&
                          (tool.name === 'Voxel Downsampling' ||
                            tool.name === 'Point Cloud Smoothing')
                            ? 'Processing...'
                            : 'C++ Worker'}
                        </button>
                        {isProcessing &&
                          (tool.name === 'Voxel Downsampling' ||
                            tool.name === 'Point Cloud Smoothing') && (
                            <button
                              className="tools-cancel-btn"
                              onClick={handleCancelProcessing}
                              style={{
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          )}
                      </div>
                    </div>
                    <div className="tools-col-7">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <button
                          className="tools-wasm-rust-btn"
                          onClick={
                            tool.name === 'Voxel Downsampling'
                              ? handleWasmRustVoxelDownsampling
                              : tool.name === 'Point Cloud Smoothing'
                                ? handleWasmRustPointCloudSmoothing
                                : undefined
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing &&
                          (tool.name === 'Voxel Downsampling' ||
                            tool.name === 'Point Cloud Smoothing')
                            ? 'Processing...'
                            : 'Rust Worker'}
                        </button>
                        {isProcessing &&
                          (tool.name === 'Voxel Downsampling' ||
                            tool.name === 'Point Cloud Smoothing') && (
                            <button
                              className="tools-cancel-btn"
                              onClick={handleCancelProcessing}
                              style={{
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          )}
                      </div>
                    </div>
                    <div className="tools-col-8">
                      <button
                        className="tools-be-btn"
                        onClick={
                          tool.name === 'Voxel Downsampling'
                            ? handleBeVoxelDownsampling
                            : tool.name === 'Point Cloud Smoothing'
                              ? handleBePointCloudSmoothing
                              : undefined
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing &&
                        (tool.name === 'Voxel Downsampling' ||
                          tool.name === 'Point Cloud Smoothing')
                          ? 'Processing...'
                          : 'C++ BE'}
                      </button>
                    </div>
                    <div className="tools-col-9">
                      <button
                        className="tools-be-rust-btn"
                        onClick={
                          tool.name === 'Voxel Downsampling'
                            ? handleBeRustVoxelDownsampling
                            : tool.name === 'Point Cloud Smoothing'
                              ? handleBeRustPointCloudSmoothing
                              : undefined
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing &&
                        (tool.name === 'Voxel Downsampling' ||
                          tool.name === 'Point Cloud Smoothing')
                          ? 'Processing...'
                          : 'Rust BE'}
                      </button>
                    </div>
                    <div className="tools-col-10">
                      <button
                        className="tools-be-python-btn"
                        onClick={
                          tool.name === 'Voxel Downsampling'
                            ? handleBePythonVoxelDownsampling
                            : tool.name === 'Point Cloud Smoothing'
                              ? handleBePythonPointCloudSmoothing
                              : undefined
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing &&
                        (tool.name === 'Voxel Downsampling' ||
                          tool.name === 'Point Cloud Smoothing')
                          ? 'Processing...'
                          : 'Python BE'}
                      </button>
                    </div>
                  </div>

                  {/* Debug Voxels Row - Show after Voxel Downsampling */}
                  {tool.name === 'Voxel Downsampling' && (
                    <div className="tools-table-row">
                      <div className="tools-col-1">
                        <div className="tool-name">Debug Voxels</div>
                        <div className="tool-description">
                          Visualize voxel grid for debugging
                        </div>
                      </div>
                      <div className="tools-col-2">
                        <div className="tool-control">
                          <div className="tool-debug-toggle">
                            <label>
                              <input
                                type="checkbox"
                                checked={showVoxelDebug}
                                onChange={handleVoxelDebugToggle}
                              />
                              Show Voxel Grid
                            </label>
                          </div>
                          <div className="tool-slider-container">
                            <label>Debug Voxel Size:</label>
                            <input
                              type="range"
                              min="0.01"
                              max="2.0"
                              step="0.01"
                              value={debugVoxelSize}
                              onChange={e =>
                                handleVoxelSizeChange(
                                  parseFloat(e.target.value)
                                )
                              }
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <div
                              className="tool-value"
                              style={{ marginLeft: '8px', fontSize: '12px' }}
                            >
                              {debugVoxelSize.toFixed(2)}m
                            </div>
                          </div>
                          {/* Max Voxels slider commented out - not providing performance benefits
                          <div className="tool-slider-container">
                            <label>Max Voxels:</label>
                            <input
                              type="range"
                              min="100"
                              max="10000"
                              step="100"
                              value={maxVoxels}
                              onChange={e => setMaxVoxels(parseInt(e.target.value))}
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <div className="tool-value" style={{ marginLeft: '8px', fontSize: '12px' }}>
                              {maxVoxels.toLocaleString()}
                            </div>
                          </div>
                          */}
                        </div>
                      </div>
                      <div className="tools-col-3">
                        <button
                          className="tools-ts-btn"
                          onClick={handleTsVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'TS'}
                        </button>
                      </div>
                      <div className="tools-col-4">
                        <button
                          className="tools-wasm-main-btn"
                          onClick={handleWasmCppMainVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'C++ Main'}
                        </button>
                      </div>
                      <div className="tools-col-5">
                        <button
                          className="tools-rust-wasm-main-btn"
                          onClick={handleRustWasmMainVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'Rust Main'}
                        </button>
                      </div>
                      <div className="tools-col-6">
                        <button
                          className="tools-wasm-btn"
                          onClick={handleCppWasmWorkerVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'C++ Worker'}
                        </button>
                      </div>
                      <div className="tools-col-7">
                        <button
                          className="tools-wasm-rust-btn"
                          onClick={handleRustWasmWorkerVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'Rust Worker'}
                        </button>
                      </div>
                      <div className="tools-col-8">
                        <button
                          className="tools-be-btn"
                          onClick={handleBeVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'C++ BE'}
                        </button>
                      </div>
                      <div className="tools-col-9">
                        <button
                          className="tools-be-rust-btn"
                          onClick={handleBeRustVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'Rust BE'}
                        </button>
                      </div>
                      <div className="tools-col-10">
                        <button
                          className="tools-be-python-btn"
                          onClick={handleBePythonVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'Python BE'}
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
