import React, { useState, useEffect } from 'react';
import { ServiceManager } from '../services/ServiceManager';

interface ToolsProps {
  serviceManager: ServiceManager | null;
  className?: string;
}

export const Tools: React.FC<ToolsProps> = ({ serviceManager, className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [voxelSize, setVoxelSize] = useState(0.1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVoxelDebug, setShowVoxelDebug] = useState(false);

  // Initialize voxel size from service
  useEffect(() => {
    if (serviceManager?.toolsService) {
      setVoxelSize(
        serviceManager.toolsService.voxelDownsampling.currentVoxelSize
      );
    }
  }, [serviceManager]);

  // Listen to voxel downsampling events
  useEffect(() => {
    if (!serviceManager?.toolsService) return;

    const voxelTool = serviceManager.toolsService.voxelDownsampling;

    const handleProcessingStarted = () => setIsProcessing(true);
    const handleProcessingFinished = () => setIsProcessing(false);

    voxelTool.on('processingStarted', handleProcessingStarted);
    voxelTool.on('processingFinished', handleProcessingFinished);

    return () => {
      voxelTool.off('processingStarted', handleProcessingStarted);
      voxelTool.off('processingFinished', handleProcessingFinished);
    };
  }, [serviceManager]);

  // Handle voxel size changes
  const handleVoxelSizeChange = (newSize: number) => {
    setVoxelSize(newSize);
    if (serviceManager?.toolsService) {
      serviceManager.toolsService.voxelDownsampling.setVoxelSize(newSize);
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

  // WASM Processing Functions
  const handleWasmVoxelDownsampling = async () => {
    console.log('=== Starting WASM Voxel Downsampling ===');
    if (!serviceManager?.toolsService) {
      console.error('Tools service not available');
      return;
    }

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      console.log('Found point cloud IDs:', allPointCloudIds);
      
      if (allPointCloudIds.length === 0) {
        console.error('No point clouds found in scene');
        return;
      }

      console.log('Processing all point clouds:', allPointCloudIds);

      // Store original point clouds before processing
      const originalPointClouds = new Map();
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;
      
      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        console.log(`Checking point cloud ${pointCloudId}:`, pointCloud ? 'found' : 'not found', pointCloud?.points?.length || 0, 'points');
        
        if (pointCloud && pointCloud.points) {
          originalPointClouds.set(pointCloudId, pointCloud);
          
          // Calculate global bounding box
          for (const point of pointCloud.points) {
            globalMinX = Math.min(globalMinX, point.position.x);
            globalMinY = Math.min(globalMinY, point.position.y);
            globalMinZ = Math.min(globalMinZ, point.position.z);
            globalMaxX = Math.max(globalMaxX, point.position.x);
            globalMaxY = Math.max(globalMaxY, point.position.y);
            globalMaxZ = Math.max(globalMaxZ, point.position.z);
          }
          
        }
      }

      // Collect ALL points from all point clouds into a single array FIRST
      const allPositions: number[] = [];
      for (const [pointCloudId, pointCloud] of originalPointClouds) {
        console.log('Collecting points from:', pointCloudId, 'points:', pointCloud.points?.length);
        if (pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
          }
        }
      }


      console.log('Global bounding box:', {
        min: [globalMinX, globalMinY, globalMinZ],
        max: [globalMaxX, globalMaxY, globalMaxZ],
        size: [globalMaxX - globalMinX, globalMaxY - globalMinY, globalMaxZ - globalMinZ]
      });

      // Clear the scene after collecting all the data
      serviceManager.pointService?.clearAllPointClouds();

      console.log('Total positions collected:', allPositions.length);
      console.log('First few positions:', allPositions.slice(0, 9)); // First 3 points (9 values)

      // Debug: Check data scale for ALL points
      const xValues = allPositions.filter((_, i) => i % 3 === 0);
      const yValues = allPositions.filter((_, i) => i % 3 === 1);
      const zValues = allPositions.filter((_, i) => i % 3 === 2);
      
      console.log('Global data scale analysis:', {
        xRange: [Math.min(...xValues), Math.max(...xValues)],
        yRange: [Math.min(...yValues), Math.max(...yValues)],
        zRange: [Math.min(...zValues), Math.max(...zValues)],
        currentVoxelSize: voxelSize,
        dataSpan: {
          x: Math.max(...xValues) - Math.min(...xValues),
          y: Math.max(...yValues) - Math.min(...yValues),
          z: Math.max(...zValues) - Math.min(...zValues)
        }
      });
      
      // Debug: Check if we have sample data and log its characteristics
      const hasSampleData = allPointCloudIds.includes('sample-1');
      if (hasSampleData) {
        const dataSpanX = Math.max(...xValues) - Math.min(...xValues);
        const dataSpanY = Math.max(...yValues) - Math.min(...yValues);
        const dataSpanZ = Math.max(...zValues) - Math.min(...zValues);
        const expectedVoxels = Math.ceil(dataSpanX / voxelSize) * 
                              Math.ceil(dataSpanY / voxelSize) * 
                              Math.ceil(dataSpanZ / voxelSize);
        const pointsPerVoxel = (allPositions.length / 3) / expectedVoxels;
        
        console.log('Sample data detected in processing:', {
          totalPoints: allPositions.length / 3,
          voxelSize,
          dataSpan: { x: dataSpanX, y: dataSpanY, z: dataSpanZ },
          expectedVoxels,
          pointsPerVoxel: pointsPerVoxel.toFixed(2),
          voxelSizeAppropriate: pointsPerVoxel > 1 ? 'YES' : 'NO (too small)'
        });
      }
      
      // Suggest appropriate voxel size for large datasets
      const dataSpan = Math.max(
        Math.max(...xValues) - Math.min(...xValues),
        Math.max(...yValues) - Math.min(...yValues),
        Math.max(...zValues) - Math.min(...zValues)
      );
      const suggestedVoxelSize = dataSpan / 100; // 1% of data span
      console.log('Global data span:', dataSpan, 'Suggested voxel size:', suggestedVoxelSize);
      
      // Auto-adjust voxel size only if it's extremely inappropriate for the data scale
      let effectiveVoxelSize = voxelSize;
      if (hasSampleData && voxelSize > dataSpan / 2) {
        // Only auto-adjust if voxel size is more than 50% of data span (clearly too large)
        effectiveVoxelSize = dataSpan / 10; // 10% of data span for sample data
        console.log(`Auto-adjusting voxel size from ${voxelSize} to ${effectiveVoxelSize} for sample data (was too large)`);
      } else if (hasSampleData) {
        console.log(`Using user-specified voxel size ${voxelSize} for sample data`);
      }
      console.log('Current voxel size:', voxelSize, 'vs suggested:', suggestedVoxelSize);

      const pointCloudData = new Float32Array(allPositions);
      console.log('Converted to Float32Array:', pointCloudData.length);

      console.log('Calling voxelDownsampleWasm with voxelSize:', effectiveVoxelSize);
      
      const result =
        await serviceManager.toolsService.voxelDownsampling.voxelDownsampleWasm(
          {
            voxelSize: effectiveVoxelSize,
            pointCloudData,
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

      if (result.success) {
        console.log('WASM voxel downsampling completed:', result);
        console.log('Result downsampledPoints:', result.downsampledPoints);
        console.log('Result downsampledPoints length:', result.downsampledPoints?.length);
        console.log('Reduction ratio:', result.downsampledCount, '/', result.originalCount, '=', (result.downsampledCount! / result.originalCount!).toFixed(3));
        
        if (hasSampleData) {
          console.log('Sample data downsampling result:', {
            originalCount: result.originalCount,
            downsampledCount: result.downsampledCount,
            reductionRatio: (result.downsampledCount! / result.originalCount!).toFixed(3),
            voxelSize: effectiveVoxelSize
          });
        }

        if (!result.downsampledPoints || result.downsampledPoints.length === 0) {
          console.error('WASM result has no downsampled points!');
          return;
        }

        // Convert Float32Array back to PointCloudPoint array
        // The downsampled points are in robotics coordinates, so we keep them as-is
        // since PointMesh will apply the coordinate transformation during rendering
        const downsampledPoints = [];
        for (let i = 0; i < result.downsampledPoints!.length; i += 3) {
             downsampledPoints.push({
               position: {
                 x: result.downsampledPoints![i],
                 y: result.downsampledPoints![i + 1],
                 z: result.downsampledPoints![i + 2],
               },
               color: { r: 0, g: 1, b: 0 }, // Green color for downsampled points (easier to see)
               intensity: 1,
               classification: 0,
             });
        }

        console.log(
          'Downsampled points sample:',
          Array.isArray(downsampledPoints) ? downsampledPoints.slice(0, 3) : 'Not an array'
        );
        if (Array.isArray(downsampledPoints)) {
          console.log('Downsampled points bounds:', {
            minX: Math.min(...downsampledPoints.map(p => p.position.x)),
            maxX: Math.max(...downsampledPoints.map(p => p.position.x)),
            minY: Math.min(...downsampledPoints.map(p => p.position.y)),
            maxY: Math.max(...downsampledPoints.map(p => p.position.y)),
            minZ: Math.min(...downsampledPoints.map(p => p.position.z)),
            maxZ: Math.max(...downsampledPoints.map(p => p.position.z)),
          });
        } else {
          console.log('Downsampled points bounds: Cannot calculate - not an array');
        }

        // Create new point cloud with downsampled data
        const downsampledPointCloud = {
          points: downsampledPoints,
          metadata: {
            name: 'Downsampled Point Cloud',
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
                 originalCount: allPositions.length / 3,
                 downsampledCount: downsampledPoints.length,
                 voxelSize: effectiveVoxelSize,
            processingTime: result.processingTime,
          },
        };

        // Create new point cloud with downsampled data
        const downsampledId = 'downsampled_point_cloud';
        await serviceManager.pointService?.loadPointCloud(
          downsampledId,
          downsampledPointCloud
        );

        console.log(
          `Added downsampled point cloud: ${downsampledId} with ${downsampledPoints.length} points`
        );
      } else {
        console.error('WASM voxel downsampling failed:', result.error);
      }
     } catch (error) {
       console.error('WASM voxel downsampling error:', error);
     }
  };

  const handleBeVoxelDownsampling = async () => {
    if (!serviceManager?.toolsService) {
      console.error('Tools service not available');
      return;
    }

    try {
      // Get current point cloud data
      const activePointCloud = serviceManager.activePointCloud;
      if (!activePointCloud) {
        console.error('No active point cloud to process');
        return;
      }

      // Extract positions from the point cloud data
      if (!activePointCloud.points || activePointCloud.points.length === 0) {
        console.error('No points found in point cloud');
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
        console.log('BE voxel downsampling completed:', result);
        // TODO: Update the point cloud with downsampled data
        // serviceManager.pointService.updatePointCloud(activePointCloud.id, result.downsampledPoints);
      } else {
        console.error('BE voxel downsampling failed:', result.error);
      }
    } catch (error) {
      console.error('BE voxel downsampling error:', error);
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
