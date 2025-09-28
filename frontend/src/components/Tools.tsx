import React, { useState, useEffect, useRef } from 'react';
import { ServiceManager } from '../services/ServiceManager';
import { Log } from '../utils/Log';

interface ToolsProps {
  serviceManager: ServiceManager | null;
  className?: string;
  onWasmResults?: (results: {
    originalCount: number;
    downsampledCount: number;
    processingTime: number;
    reductionRatio: number;
    voxelCount: number;
  }) => void;
  onBeResults?: (results: {
    originalCount: number;
    downsampledCount: number;
    processingTime: number;
    reductionRatio: number;
  }) => void;
}

export const Tools: React.FC<ToolsProps> = ({ serviceManager, className, onWasmResults, onBeResults }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [voxelSize, setVoxelSize] = useState(1.403);
  const [wasmBatchSize, setWasmBatchSize] = useState(2000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVoxelDebug, setShowVoxelDebug] = useState(false);
  
  // Processing results state
  const [wasmResults, setWasmResults] = useState<{
    originalCount: number;
    downsampledCount: number;
    processingTime: number;
    reductionRatio: number;
    voxelCount: number;
  } | null>(null);
  
  const [beResults, setBeResults] = useState<{
    originalCount: number;
    downsampledCount: number;
    processingTime: number;
    reductionRatio: number;
  } | null>(null);
  
  // Use ref to track processing state for event handlers
  const isProcessingRef = useRef(false);

  // Note: Using component default values instead of service defaults

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

  // Listen to voxel downsampling events
  useEffect(() => {
    if (!serviceManager?.toolsService) return;

    const voxelTool = serviceManager.toolsService.voxelDownsampling;

    const handleProcessingStarted = () => {
      setIsProcessing(true);
      isProcessingRef.current = true;
    };
    const handleProcessingFinished = () => {
      setIsProcessing(false);
      isProcessingRef.current = false;
    };
    const handleProcessingCancelled = () => {
      setIsProcessing(false);
      isProcessingRef.current = false;
    };

    voxelTool.on('processingStarted', handleProcessingStarted);
    voxelTool.on('processingFinished', handleProcessingFinished);
    voxelTool.on('processingCancelled', handleProcessingCancelled);

    return () => {
      voxelTool.off('processingStarted', handleProcessingStarted);
      voxelTool.off('processingFinished', handleProcessingFinished);
      voxelTool.off('processingCancelled', handleProcessingCancelled);
    };
  }, [serviceManager]);

  // Handle voxel size changes
  const handleVoxelSizeChange = (newSize: number) => {
    setVoxelSize(newSize);
    if (serviceManager?.toolsService) {
      serviceManager.toolsService.voxelDownsampling.setVoxelSize(newSize);
      
      // Update voxel debug visualization if it's currently visible
      if (showVoxelDebug) {
        // Re-show the voxel debug with the new size
        serviceManager.toolsService.voxelDownsampling.showVoxelDebug(newSize);
      }
    }
  };

  // Handle WASM batch size changes
  const handleWasmBatchSizeChange = (newSize: number) => {
    setWasmBatchSize(newSize);
    if (serviceManager?.pointService) {
      serviceManager.pointService.setBatchSize(newSize);
    }
  };

  // Handle voxel debug visualization
  const handleVoxelDebugToggle = () => {
    const newShowDebug = !showVoxelDebug;
    setShowVoxelDebug(newShowDebug);
    
    if (serviceManager?.toolsService) {
      if (newShowDebug) {
        // Show voxel debug grid
        serviceManager.toolsService.voxelDownsampling.showVoxelDebug(voxelSize);
      } else {
        // Hide voxel debug grid
        serviceManager.toolsService.voxelDownsampling.hideVoxelDebug();
      }
    }
  };

  // Handle cancellation
  const handleCancelProcessing = () => {
    if (serviceManager?.toolsService && isProcessing) {
      Log.Info('Tools', 'Cancelling voxel downsampling processing...');
      serviceManager.toolsService.voxelDownsampling.cancelProcessing();
    }
  };

  // Helper function for JavaScript-based voxel deduplication
  const performVoxelDeduplication = (
    points: Float32Array,
    voxelSize: number,
    globalBounds: { minX: number; minY: number; minZ: number }
  ): Float32Array => {
    const voxelMap = new Map<string, { count: number; sumX: number; sumY: number; sumZ: number }>();
    
    // Process each point
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i];
      const y = points[i + 1];
      const z = points[i + 2];
      
      // Calculate voxel coordinates
      const voxelX = Math.floor((x - globalBounds.minX) / voxelSize);
      const voxelY = Math.floor((y - globalBounds.minY) / voxelSize);
      const voxelZ = Math.floor((z - globalBounds.minZ) / voxelSize);
      
      // Create voxel key
      const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
      
      // Add point to voxel
      if (voxelMap.has(voxelKey)) {
        const voxel = voxelMap.get(voxelKey)!;
        voxel.count++;
        voxel.sumX += x;
        voxel.sumY += y;
        voxel.sumZ += z;
      } else {
        voxelMap.set(voxelKey, {
          count: 1,
          sumX: x,
          sumY: y,
          sumZ: z
        });
      }
    }
    
    // Convert voxel centers back to points
    const result = new Float32Array(voxelMap.size * 3);
    let index = 0;
    
    for (const [_, voxel] of voxelMap) {
      // Calculate average position (voxel center)
      const avgX = voxel.sumX / voxel.count;
      const avgY = voxel.sumY / voxel.count;
      const avgZ = voxel.sumZ / voxel.count;
      
      result[index * 3] = avgX;
      result[index * 3 + 1] = avgY;
      result[index * 3 + 2] = avgZ;
      index++;
    }
    
    return result;
  };

  // WASM Processing Functions
  const handleWasmVoxelDownsampling = async () => {
    Log.Info('Tools', '=== Starting WASM Voxel Downsampling ===');
    
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    // Set processing state immediately to prevent debug toggle from being turned off
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      Log.Debug('Tools', 'Found point cloud IDs', allPointCloudIds);
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return;
      }

      Log.Info('Tools', 'Processing all point clouds', allPointCloudIds);

      // Store original point clouds before processing
      const originalPointClouds = new Map();
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;
      
      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        Log.Debug('Tools', `Checking point cloud ${pointCloudId}: ${pointCloud ? 'found' : 'not found'} ${pointCloud?.points?.length || 0} points`);
        
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          originalPointClouds.set(pointCloudId, pointCloud);
          Log.Debug('Tools', `Added point cloud ${pointCloudId} to processing queue with ${pointCloud.points.length} points`);
          
          // Calculate global bounding box
          for (const point of pointCloud.points) {
            globalMinX = Math.min(globalMinX, point.position.x);
            globalMinY = Math.min(globalMinY, point.position.y);
            globalMinZ = Math.min(globalMinZ, point.position.z);
            globalMaxX = Math.max(globalMaxX, point.position.x);
            globalMaxY = Math.max(globalMaxY, point.position.y);
            globalMaxZ = Math.max(globalMaxZ, point.position.z);
          }
        } else {
          Log.Warn('Tools', `Skipping point cloud ${pointCloudId} - no valid points data`);
        }
      }

      // Process each point cloud batch individually for memory efficiency
      // This prevents loading all points into memory at once for large datasets

      Log.Info('Tools', `Found ${originalPointClouds.size} valid point clouds to process`);
      
      if (originalPointClouds.size === 0) {
        Log.Error('Tools', 'No valid point clouds found for processing');
        return;
      }

      if (!isFinite(globalMinX) || !isFinite(globalMaxX) || 
          !isFinite(globalMinY) || !isFinite(globalMaxY) || 
          !isFinite(globalMinZ) || !isFinite(globalMaxZ)) {
        Log.Error('Tools', 'Invalid global bounds - no points found or bounds calculation failed');
        Log.Error('Tools', 'Bounds values', { globalMinX, globalMinY, globalMinZ, globalMaxX, globalMaxY, globalMaxZ });
        return;
      }

      Log.Debug('Tools', 'Global bounding box', {
        min: [globalMinX, globalMinY, globalMinZ],
        max: [globalMaxX, globalMaxY, globalMaxZ],
        size: [globalMaxX - globalMinX, globalMaxY - globalMinY, globalMaxZ - globalMinZ]
      });

      // Clear the scene after collecting all the data
      serviceManager.pointService?.clearAllPointClouds();

      // Calculate effective voxel size based on global bounds
      const dataSpan = Math.max(
        globalMaxX - globalMinX,
        globalMaxY - globalMinY,
        globalMaxZ - globalMinZ
      );
      const suggestedVoxelSize = dataSpan / 100; // 1% of data span
      Log.Debug('Tools', 'Global data span', { dataSpan, suggestedVoxelSize });
      
      // Auto-adjust voxel size only if it's extremely inappropriate for the data scale
      let effectiveVoxelSize = voxelSize;
      const hasSampleData = allPointCloudIds.includes('sample-1');
      if (hasSampleData && voxelSize > dataSpan / 2) {
        // Only auto-adjust if voxel size is more than 50% of data span (clearly too large)
        effectiveVoxelSize = dataSpan / 10; // 10% of data span for sample data
        Log.Info('Tools', `Auto-adjusting voxel size from ${voxelSize} to ${effectiveVoxelSize} for sample data (was too large)`);
      } else if (hasSampleData) {
        Log.Info('Tools', `Using user-specified voxel size ${voxelSize} for sample data`);
      }
      Log.Debug('Tools', 'Current voxel size vs suggested', { voxelSize, suggestedVoxelSize });

      // Combine ALL point clouds into one dataset (like Backend does)
      Log.Info('Tools', 'Combining all point clouds into single dataset for processing');
      
      const allCombinedPositions: number[] = [];
      let totalOriginalPoints = 0;

      for (const [pointCloudId, pointCloud] of originalPointClouds) {
        if (!pointCloud.points || pointCloud.points.length === 0) {
          continue;
        }

        Log.Debug('Tools', `Adding point cloud ${pointCloudId}: ${pointCloud.points.length} points`);
        
        // Add all points from this point cloud to combined dataset
        for (const point of pointCloud.points) {
          allCombinedPositions.push(point.position.x, point.position.y, point.position.z);
        }
        
        totalOriginalPoints += pointCloud.points.length;
      }

      const allCombinedData = new Float32Array(allCombinedPositions);
      Log.Info('Tools', `Combined dataset: ${allCombinedData.length / 3} total points from ${originalPointClouds.size} point clouds`);

      // Process entire combined dataset at once (exact same as Backend)
      Log.Info('Tools', `Processing combined dataset with JavaScript (same as Backend): ${allCombinedData.length / 3} points`);

      const startTime = performance.now();

      // Create a map to store voxel centers (exact same as Backend)
      const voxelMap = new Map();
      
      // Process each point (exact same as Backend)
      for (let i = 0; i < allCombinedData.length; i += 3) {
        const x = allCombinedData[i];
        const y = allCombinedData[i + 1];
        const z = allCombinedData[i + 2];
        
        // Calculate voxel coordinates (exact same as Backend)
        const voxelX = Math.floor((x - globalMinX) / effectiveVoxelSize);
        const voxelY = Math.floor((y - globalMinY) / effectiveVoxelSize);
        const voxelZ = Math.floor((z - globalMinZ) / effectiveVoxelSize);
        
        // Create voxel key (exact same as Backend)
        const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
        
        // Add point to voxel (exact same as Backend)
        if (voxelMap.has(voxelKey)) {
          const voxel = voxelMap.get(voxelKey);
          voxel.count++;
          voxel.sumX += x;
          voxel.sumY += y;
          voxel.sumZ += z;
        } else {
          voxelMap.set(voxelKey, {
            count: 1,
            sumX: x,
            sumY: y,
            sumZ: z
          });
        }
      }
      
      // Convert voxel centers back to points (exact same as Backend)
      const downsampledPoints = [];
      
      for (const [_, voxel] of voxelMap) {
        // Calculate average position (voxel center) - exact same as Backend
        const avgX = voxel.sumX / voxel.count;
        const avgY = voxel.sumY / voxel.count;
        const avgZ = voxel.sumZ / voxel.count;
        
        downsampledPoints.push({
          position: {
            x: avgX,
            y: avgY,
            z: avgZ,
          },
          color: { r: 0, g: 1, b: 0 }, // Green color for downsampled points
          intensity: 1,
          classification: 0,
        });
      }

      const processingTime = performance.now() - startTime;
      const totalDownsampledPoints = downsampledPoints.length;

      // Create single point cloud with final result
      const finalPointCloud = {
        points: downsampledPoints,
        metadata: {
          name: `WASM Downsampled (Combined)`,
          totalPoints: downsampledPoints.length,
          bounds: {
            min: {
              x: Math.min(...downsampledPoints.map(p => p.position.x)),
              y: Math.min(...downsampledPoints.map(p => p.position.y)),
              z: Math.min(...downsampledPoints.map(p => p.position.z))
            },
            max: {
              x: Math.max(...downsampledPoints.map(p => p.position.x)),
              y: Math.max(...downsampledPoints.map(p => p.position.y)),
              z: Math.max(...downsampledPoints.map(p => p.position.z))
            }
          },
          hasColor: true,
          hasIntensity: true,
          hasClassification: true,
          originalCount: totalOriginalPoints,
          downsampledCount: downsampledPoints.length,
          voxelSize: effectiveVoxelSize,
          processingTime: processingTime,
          batchSize: wasmBatchSize,
          batchCount: 1,
          voxelCount: voxelMap.size,
          reductionRatio: totalOriginalPoints / downsampledPoints.length,
        },
      };

      // Add final result to scene
      const finalId = `downsampled_wasm_final`;
      await serviceManager.pointService?.loadPointCloud(finalId, finalPointCloud, false);
      
      // Small delay to prevent race conditions
      await new Promise(resolve => setTimeout(resolve, 100));

      Log.Info('Tools', `WASM result: ${totalOriginalPoints} original → ${downsampledPoints.length} downsampled points (${voxelMap.size} voxels, ${processingTime.toFixed(2)}ms)`);

      Log.Info('Tools', `WASM processing complete: ${totalOriginalPoints} original → ${totalDownsampledPoints} downsampled points`);

      // Store WASM results for display
      const wasmResults = {
        originalCount: totalOriginalPoints,
        downsampledCount: totalDownsampledPoints,
        processingTime: processingTime,
        reductionRatio: totalOriginalPoints / totalDownsampledPoints,
        voxelCount: voxelMap.size
      };
      setWasmResults(wasmResults);
      
      // Emit results to parent component
      if (onWasmResults) {
        onWasmResults(wasmResults);
      }

      // Reset processing state when all batches are complete
      serviceManager.toolsService.voxelDownsampling.resetProcessingState();

    } catch (error) {
       Log.Error('Tools', 'WASM voxel downsampling error', error);
       // Reset processing state on error too
       serviceManager.toolsService.voxelDownsampling.resetProcessingState();
     }
  };

  const handleBeVoxelDownsampling = async () => {
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      Log.Debug('Tools', 'Found point cloud IDs for BE processing', allPointCloudIds);
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return;
      }

      // Collect all points from all point clouds
      const allPositions: number[] = [];
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
            
            // Calculate global bounding box
            globalMinX = Math.min(globalMinX, point.position.x);
            globalMinY = Math.min(globalMinY, point.position.y);
            globalMinZ = Math.min(globalMinZ, point.position.z);
            globalMaxX = Math.max(globalMaxX, point.position.x);
            globalMaxY = Math.max(globalMaxY, point.position.y);
            globalMaxZ = Math.max(globalMaxZ, point.position.z);
          }
        }
      }

      if (allPositions.length === 0) {
        Log.Error('Tools', 'No valid points found for BE processing');
        return;
      }

      const pointCloudData = new Float32Array(allPositions);

      Log.Info('Tools', 'Starting BE voxel downsampling', {
        pointCount: pointCloudData.length / 3,
        voxelSize,
        bounds: { globalMinX, globalMinY, globalMinZ, globalMaxX, globalMaxY, globalMaxZ }
      });

      // Clear the scene
      serviceManager.pointService?.clearAllPointClouds();

      // Process with Backend implementation
      const result = await serviceManager.toolsService.voxelDownsamplingBackend.voxelDownsampleBackend({
        voxelSize,
        pointCloudData,
        globalBounds: {
          minX: globalMinX,
          minY: globalMinY,
          minZ: globalMinZ,
          maxX: globalMaxX,
          maxY: globalMaxY,
          maxZ: globalMaxZ,
        }
      });

      if (result.success && result.downsampledPoints) {
        // Convert downsampled points to PointCloudPoint array
        const downsampledPoints = [];
        for (let i = 0; i < result.downsampledPoints.length; i += 3) {
          downsampledPoints.push({
            position: {
              x: result.downsampledPoints[i],
              y: result.downsampledPoints[i + 1],
              z: result.downsampledPoints[i + 2],
            },
            color: { r: 1, g: 0, b: 0 }, // Red color for Backend processed points
            intensity: 1,
            classification: 0,
          });
        }

        // Create point cloud for Backend result
        const backendPointCloud = {
          points: downsampledPoints,
          metadata: {
            name: 'Backend Downsampled Point Cloud',
            totalPoints: downsampledPoints.length,
            bounds: {
              min: {
                x: Math.min(...downsampledPoints.map(p => p.position.x)),
                y: Math.min(...downsampledPoints.map(p => p.position.y)),
                z: Math.min(...downsampledPoints.map(p => p.position.z))
              },
              max: {
                x: Math.max(...downsampledPoints.map(p => p.position.x)),
                y: Math.max(...downsampledPoints.map(p => p.position.y)),
                z: Math.max(...downsampledPoints.map(p => p.position.z))
              }
            },
            hasColor: true,
            hasIntensity: true,
            hasClassification: true,
            originalCount: result.originalCount,
            downsampledCount: result.downsampledCount,
            voxelSize: voxelSize,
            processingTime: result.processingTime,
            method: result.method || 'Backend Node.js'
          },
        };

        // Add Backend result to the scene
        const backendId = `backend_downsampled_${Date.now()}`;
        await serviceManager.pointService?.loadPointCloud(backendId, backendPointCloud, false); // Don't reposition camera

        Log.Info('Tools', 'Backend voxel downsampling completed', {
          originalCount: result.originalCount,
          downsampledCount: result.downsampledCount,
          reduction: ((result.originalCount - result.downsampledCount) / result.originalCount * 100).toFixed(2) + '%',
          processingTime: result.processingTime.toFixed(2) + 'ms'
        });

        // Store BE results for display
        const beResults = {
          originalCount: result.originalCount,
          downsampledCount: result.downsampledCount,
          processingTime: result.processingTime,
          reductionRatio: result.originalCount / result.downsampledCount
        };
        setBeResults(beResults);
        
        // Emit results to parent component
        if (onBeResults) {
          onBeResults(beResults);
        }
      } else {
        Log.Error('Tools', 'Backend voxel downsampling failed', result.error);
      }
    } catch (error) {
      Log.Error('Tools', 'Backend voxel downsampling error', error);
    }
  };

  const tools = [
    {
      name: 'Voxel Downsampling',
      description: 'Reduce point count by averaging points in grid cells',
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
                <div className="tools-col-3">WASM</div>
                <div className="tools-col-4">BE</div>
              </div>

              {tools.map((tool, index) => (
                <div key={index} className="tools-table-row">
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
                  </div>
                  <div className="tools-col-3">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        className="tools-wasm-btn"
                        onClick={
                          tool.name === 'Voxel Downsampling'
                            ? handleWasmVoxelDownsampling
                            : undefined
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing && tool.name === 'Voxel Downsampling'
                          ? 'Processing...'
                          : 'WASM'}
                      </button>
                      {isProcessing && tool.name === 'Voxel Downsampling' && (
                        <button
                          className="tools-cancel-btn"
                          onClick={handleCancelProcessing}
                          style={{
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="tools-col-4">
                    <button
                      className="tools-be-btn"
                      onClick={
                        tool.name === 'Voxel Downsampling'
                          ? handleBeVoxelDownsampling
                          : undefined
                      }
                      disabled={isProcessing}
                    >
                      {isProcessing && tool.name === 'Voxel Downsampling'
                        ? 'Processing...'
                        : 'BE'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Debug Voxels Row */}
              <div className="tools-table-row">
                <div className="tools-col-1">
                  <div className="tool-name">Debug Voxels</div>
                  <div className="tool-description">Visualize voxel grid for debugging</div>
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
                        value={voxelSize}
                        onChange={e => handleVoxelSizeChange(parseFloat(e.target.value))}
                        className="tool-slider"
                        style={{ width: '120px', marginLeft: '8px' }}
                      />
                      <div className="tool-value" style={{ marginLeft: '8px', fontSize: '12px' }}>
                        {voxelSize.toFixed(2)}m
                      </div>
                    </div>
                  </div>
                </div>
                <div className="tools-col-3">
                  {/* <button
                    className="tools-wasm-btn"
                    onClick={() => {
                      if (showVoxelDebug) {
                        serviceManager?.toolsService?.voxelDownsampling?.showVoxelDebug(voxelSize);
                      }
                    }}
                    disabled={!showVoxelDebug}
                  >
                    WASM
                  </button> */}
                </div>
                <div className="tools-col-4">
                  {/* <button
                    className="tools-be-btn"
                    onClick={() => {
                      if (showVoxelDebug) {
                        serviceManager?.toolsService?.voxelDownsampling?.showVoxelDebug(voxelSize);
                      }
                    }}
                    disabled={!showVoxelDebug}
                  >
                    BE
                  </button> */}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
