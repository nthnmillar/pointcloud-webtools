import React, { useState, useEffect } from 'react';
import { ServiceManager } from '../services/ServiceManager';
import { Log } from '../utils/Log';

interface ToolsProps {
  serviceManager: ServiceManager | null;
  className?: string;
}

export const Tools: React.FC<ToolsProps> = ({ serviceManager, className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [voxelSize, setVoxelSize] = useState(0.1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVoxelDebug, setShowVoxelDebug] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  // Initialize voxel size from service
  useEffect(() => {
    if (serviceManager?.toolsService) {
      setVoxelSize(
        serviceManager.toolsService.voxelDownsampling.currentVoxelSize
      );
    }
  }, [serviceManager]);

  // Listen for point cloud clearing events to reset voxel debug state
  useEffect(() => {
    if (!serviceManager?.pointService) return;

    const handlePointCloudsCleared = () => {
      // Reset voxel debug state and processing state when point clouds are cleared
      setShowVoxelDebug(false);
      setIsProcessing(false);
      setIsCancelled(false);
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
      setIsCancelled(false);
    };
    const handleProcessingFinished = () => setIsProcessing(false);
    const handleProcessingCancelled = () => {
      setIsProcessing(false);
      setIsCancelled(true);
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
        serviceManager.toolsService.voxelDownsampling.updateVoxelDebug(newSize);
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

  // WASM Processing Functions
  const handleWasmVoxelDownsampling = async () => {
    Log.Info('Tools', '=== Starting WASM Voxel Downsampling ===');
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

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
        Log.Debug('Tools', `Checking point cloud ${pointCloudId}:`, pointCloud ? 'found' : 'not found', pointCloud?.points?.length || 0, 'points');
        
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

      // Process each point cloud batch individually and add to scene immediately
      // This works like the LAZ loader - showing results as they're processed
      let totalOriginalPoints = 0;
      let totalDownsampledPoints = 0;
      let batchCount = 0;

      for (const [pointCloudId, pointCloud] of originalPointClouds) {
        // Check for cancellation before processing each batch
        if (isCancelled) {
          Log.Info('Tools', 'Voxel downsampling cancelled during batch processing');
          break;
        }
        if (!pointCloud.points || pointCloud.points.length === 0) {
          continue;
        }

        Log.Debug('Tools', `Processing batch: ${pointCloudId} with ${pointCloud.points.length} points`);

        // Convert points to Float32Array for this batch
        const batchPositions: number[] = [];
        for (const point of pointCloud.points) {
          batchPositions.push(point.position.x, point.position.y, point.position.z);
        }

        const batchPointCloudData = new Float32Array(batchPositions);
        totalOriginalPoints += batchPositions.length / 3;

        // Process this batch with WASM worker
        const batchResult = await serviceManager.toolsService.voxelDownsampling.voxelDownsampleBatchWasm(
          {
            batchId: pointCloudId,
            points: batchPointCloudData,
            voxelSize: effectiveVoxelSize,
            globalBounds: {
              minX: globalMinX,
              minY: globalMinY,
              minZ: globalMinZ,
              maxX: globalMaxX,
              maxY: globalMaxY,
              maxZ: globalMaxZ,
            }
          }
        );

        if (batchResult.success && batchResult.downsampledPoints) {
          // Convert downsampled points to PointCloudPoint array
          const downsampledPoints = [];
          for (let i = 0; i < batchResult.downsampledPoints.length; i += 3) {
            downsampledPoints.push({
              position: {
                x: batchResult.downsampledPoints[i],
                y: batchResult.downsampledPoints[i + 1],
                z: batchResult.downsampledPoints[i + 2],
              },
              color: { r: 0, g: 1, b: 0 }, // Green color for downsampled points
              intensity: 1,
              classification: 0,
            });
          }

          totalDownsampledPoints += downsampledPoints.length;
          batchCount++;

          // Create point cloud for this batch and add to scene immediately
          const batchPointCloud = {
            points: downsampledPoints,
            metadata: {
              name: `Downsampled Batch ${batchCount}`,
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
              originalCount: batchPositions.length / 3,
              downsampledCount: downsampledPoints.length,
              voxelSize: effectiveVoxelSize,
              processingTime: batchResult.processingTime,
            },
          };

          // Add this batch to the scene immediately
          const batchId = `downsampled_batch_${batchCount}`;
          await serviceManager.pointService?.loadPointCloud(batchId, batchPointCloud);

          Log.Debug('Tools', `Added downsampled batch ${batchCount}: ${downsampledPoints.length} points`);
        } else {
          // Check if it's a cancellation (expected) or actual error
          if (batchResult.error === 'Processing was cancelled') {
            Log.Info('Tools', `Batch ${pointCloudId} processing cancelled`);
          } else {
            Log.Error('Tools', `Batch ${pointCloudId} processing failed`, batchResult.error);
          }
        }
      }

      Log.Info('Tools', `Incremental processing complete: ${totalOriginalPoints} original → ${totalDownsampledPoints} downsampled points in ${batchCount} batches`);

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
      // Get current point cloud data
      const activePointCloud = serviceManager.activePointCloud;
      if (!activePointCloud) {
        Log.Error('Tools', 'No active point cloud to process');
        return;
      }

      // Extract positions from the point cloud data
      if (!activePointCloud.points || activePointCloud.points.length === 0) {
        Log.Error('Tools', 'No points found in point cloud');
        return;
      }

      // Extract positions from points array
      const positions: number[] = [];
      for (const point of activePointCloud.points) {
        positions.push(point.position.x, point.position.y, point.position.z);
      }

      const pointCloudData = new Float32Array(positions);

      const result =
        await serviceManager.toolsService.voxelDownsampling.voxelDownsampleBackend(
          {
            voxelSize,
            pointCloudData,
          }
        );

      if (result.success) {
        Log.Info('Tools', 'BE voxel downsampling completed', result);
        // TODO: Update the point cloud with downsampled data
        // serviceManager.pointService.updatePointCloud(activePointCloud.id, result.downsampledPoints);
      } else {
        Log.Error('Tools', 'BE voxel downsampling failed', result.error);
      }
    } catch (error) {
      Log.Error('Tools', 'BE voxel downsampling error', error);
    }
  };

  const tools = [
    {
      name: 'Voxel Downsampling',
      description: 'Reduce point count by averaging points in grid cells',
    },
    {
      name: 'Pass-Through Filtering',
      description: 'Filter by coordinate ranges (X, Y, Z)',
    },
    {
      name: 'Statistical Outlier Removal',
      description: 'Remove noise points (isolated points)',
    },
    {
      name: 'Plane Segmentation',
      description: 'Find and extract flat surfaces (ground, walls)',
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
                        <div className="tool-slider-container">
                          <input
                            type="range"
                            min="0.01"
                            max="2.0"
                            step="0.01"
                            value={voxelSize}
                            onChange={e =>
                              handleVoxelSizeChange(parseFloat(e.target.value))
                            }
                            className="tool-slider"
                          />
                          <div className="tool-value">
                            {voxelSize.toFixed(2)}m
                          </div>
                        </div>
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
            </div>
          </div>
        </div>
      )}
    </>
  );
};
