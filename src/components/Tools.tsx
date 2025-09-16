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

  // Initialize voxel size from service
  useEffect(() => {
    if (serviceManager?.toolsService) {
      setVoxelSize(serviceManager.toolsService.voxelDownsampling.currentVoxelSize);
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

  // WASM Processing Functions
  const handleWasmVoxelDownsampling = async () => {
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

      // Convert point cloud data to Float32Array format
      const pointCloudData = new Float32Array(activePointCloud.positions);

      const result = await serviceManager.toolsService.voxelDownsampling.voxelDownsampleWasm({
        voxelSize,
        pointCloudData
      });

      if (result.success) {
        console.log('WASM voxel downsampling completed:', result);
        // TODO: Update the point cloud with downsampled data
        // serviceManager.pointService.updatePointCloud(activePointCloud.id, result.downsampledPoints);
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

      // Convert point cloud data to Float32Array format
      const pointCloudData = new Float32Array(activePointCloud.positions);

      const result = await serviceManager.toolsService.voxelDownsampling.voxelDownsampleBackend({
        voxelSize,
        pointCloudData
      });

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
    { name: 'Voxel Downsampling', description: 'Reduce point count by averaging points in grid cells' },
    { name: 'Pass-Through Filtering', description: 'Filter by coordinate ranges (X, Y, Z)' },
    { name: 'Statistical Outlier Removal', description: 'Remove noise points (isolated points)' },
    { name: 'Plane Segmentation', description: 'Find and extract flat surfaces (ground, walls)' }
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
            <button 
              onClick={() => setIsVisible(false)}
              className="tools-close"
            >
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
                            max="1.0"
                            step="0.01"
                            value={voxelSize}
                            onChange={(e) => handleVoxelSizeChange(parseFloat(e.target.value))}
                            className="tool-slider"
                          />
                          <div className="tool-value">
                            {voxelSize.toFixed(2)}m
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="tools-col-3">
                    <button 
                      className="tools-wasm-btn"
                      onClick={tool.name === 'Voxel Downsampling' ? handleWasmVoxelDownsampling : undefined}
                      disabled={isProcessing}
                    >
                      {isProcessing && tool.name === 'Voxel Downsampling' ? 'Processing...' : 'WASM'}
                    </button>
                  </div>
                  <div className="tools-col-4">
                    <button 
                      className="tools-be-btn"
                      onClick={tool.name === 'Voxel Downsampling' ? handleBeVoxelDownsampling : undefined}
                      disabled={isProcessing}
                    >
                      {isProcessing && tool.name === 'Voxel Downsampling' ? 'Processing...' : 'BE'}
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
