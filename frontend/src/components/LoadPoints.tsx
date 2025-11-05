import React, { useState, useEffect } from 'react';
import { ServiceManager } from '../services/ServiceManager';
import { Log } from '../utils/Log';

interface LoadPointsProps {
  className?: string;
  serviceManager: ServiceManager | null;
  isLoading: boolean;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
}

export const LoadPoints: React.FC<LoadPointsProps> = ({
  className,
  serviceManager,
  isLoading,
  onLoadingChange,
  onErrorChange,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  // Loading-related state
  const [batchSize, setBatchSize] = useState(2000);
  const [supportedFormats, setSupportedFormats] = useState<string[]>([]);
  const [isVoxelProcessing, setIsVoxelProcessing] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [pointCount, setPointCount] = useState<number>(0);

  // Get point count from all loaded point clouds
  useEffect(() => {
    if (!serviceManager) return;
    
    const updatePointCount = () => {
      if (!serviceManager.pointService) return;
      
      // Get all point clouds and sum their point counts
      let totalPoints = 0;
      const pointCloudIds = serviceManager.pointCloudIds;
      
      for (const id of pointCloudIds) {
        const pointCloud = serviceManager.getPointCloud(id);
        if (pointCloud?.metadata?.totalPoints) {
          totalPoints += pointCloud.metadata.totalPoints;
        }
      }
      
      setPointCount(totalPoints);
    };

    // Check immediately
    updatePointCount();

    // Also check periodically to catch updates
    const interval = setInterval(updatePointCount, 500);
    return () => clearInterval(interval);
  }, [serviceManager]);

  // Initialize supported formats from service manager
  useEffect(() => {
    if (serviceManager) {
      setSupportedFormats(serviceManager.getSupportedFormats());
    }
  }, [serviceManager]);

  // Check if voxel downsampling is processing by checking the tools service directly
  useEffect(() => {
    const checkVoxelProcessing = () => {
      if (serviceManager?.toolsService) {
        const isProcessing = serviceManager.toolsService.processing;
        if (isProcessing !== isVoxelProcessing) {
          setIsVoxelProcessing(isProcessing);
        }
      }
    };

    // Check immediately
    checkVoxelProcessing();

    // Set up interval to check periodically (like LAZ loader)
    const interval = setInterval(checkVoxelProcessing, 100);

    return () => clearInterval(interval);
  }, [serviceManager, isVoxelProcessing]);

  // Event handlers
  const loadSampleData = async (retryCount = 0) => {
    if (!serviceManager) {
      Log.Error('LoadPoints', 'Service manager not initialized');
      return;
    }

    // Debounce rapid clicks (prevent multiple calls within 1 second)
    const now = Date.now();
    if (now - lastClickTime < 1000) {
      Log.Info('LoadPoints', 'Click debounced - too soon after last click');
      return;
    }
    setLastClickTime(now);

    // Prevent multiple simultaneous calls
    if (isLoading) {
      Log.Info('LoadPoints', 'Sample data already loading, skipping');
      return;
    }

    // Wait for service manager to be fully initialized
    if (!serviceManager.isInitialized) {
      if (retryCount >= 5) {
        Log.Error('LoadPoints', 'Service manager still not initialized after 5 retries');
        return;
      }
      Log.Info('LoadPoints', 'Service manager not fully initialized, waiting...', { retryCount });
      // Wait a bit and try again
      setTimeout(() => {
        if (serviceManager && serviceManager.isInitialized) {
          loadSampleData(retryCount + 1);
        } else {
          Log.Error('LoadPoints', 'Service manager still not initialized after waiting');
        }
      }, 200);
      return;
    }

    // Additional safety check - ensure all services are ready
    if (!serviceManager._pointService || !serviceManager._sceneService) {
      if (retryCount >= 5) {
        Log.Error('LoadPoints', 'Services still not ready after 5 retries');
        return;
      }
      Log.Info('LoadPoints', 'Services not ready, waiting...', { retryCount });
      setTimeout(() => {
        if (serviceManager && serviceManager.isInitialized) {
          loadSampleData(retryCount + 1);
        }
      }, 200);
      return;
    }


    try {
      onErrorChange(null);
      onLoadingChange(true);

      // Clear existing point clouds and turn off debug before loading sample data
      serviceManager.clearAllPointClouds();
      serviceManager.toolsService?.hideVoxelDebug();

      const sampleData = serviceManager.generateSamplePointCloud(
        'sample-1',
        5000
      );

      await serviceManager.loadPointCloud('sample-1', sampleData);

      // Note: loadPointCloud already handles rendering and camera positioning
      // No need to call renderActivePointCloud() again as it causes duplicate rendering
    } catch (err) {
      Log.Error('LoadPoints', 'Error loading sample data', err);
      onErrorChange(
        err instanceof Error ? err.message : 'Failed to load sample data'
      );
    } finally {
      onLoadingChange(false);
    }
  };

  const handleFileLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !serviceManager) {
      return;
    }

    // Clear the input value immediately to allow selecting the same file again
    event.target.value = '';

    try {
      // Check if file format is supported
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!serviceManager.isSupportedFormat(extension)) {
        onErrorChange(
          `Unsupported file format: ${extension}. Supported formats: ${supportedFormats.join(', ')}`
        );
        return;
      }

      // Clear existing point clouds and turn off debug before loading new file
      serviceManager.clearAllPointClouds();
      serviceManager.toolsService?.hideVoxelDebug();

      // Set loading state
      onLoadingChange(true);
      onErrorChange(null);

      // Small delay to ensure scene clearing completes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Load the file - batches will appear in scene as they load
      await serviceManager.loadFile(file, batchSize);
    } catch (err) {
      Log.Error('LoadPoints', 'Error loading file', err);
      onErrorChange(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      // Reset loading state and file input
      onLoadingChange(false);
      event.target.value = '';
    }
  };

  const handleCancelLoading = () => {
    if (serviceManager) {
      // Cancel file loading
      serviceManager.cancelLoading();
      onLoadingChange(false);
      
      // Cancel processing if it's running
      if (isVoxelProcessing && serviceManager.toolsService) {
        Log.Info('LoadPoints', 'Cancelling processing from LoadPoints...');
        // Note: Cancellation will be re-implemented in unified service
      }
    }
  };

  const handleClearScene = () => {
    if (serviceManager) {
      serviceManager.clearAllPointClouds();
      
      // Also hide voxel debug when clearing the scene
      if (serviceManager.toolsService) {
        serviceManager.toolsService.hideVoxelDebug();
      }
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <div className="load-points-toggle">
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="load-points-toggle-btn"
        >
          {isVisible ? 'Hide' : 'Load Points'}
        </button>
      </div>

      {/* Load Points Panel */}
      {isVisible && (
        <div className={`load-points-panel ${className || ''}`}>
          <div className="load-points-header">
            <h3>Load Points</h3>
            <button
              onClick={() => setIsVisible(false)}
              className="load-points-close"
            >
              ×
            </button>
          </div>

          <div className="load-points-content">
            {/* Point Count Display - Always visible */}
            <div className="control-group">
              <label>Points Loaded:</label>
              <span style={{ color: '#61dafb', fontWeight: 500, marginLeft: '8px' }}>
                {pointCount.toLocaleString()}
              </span>
            </div>

            <div className="control-group">
              <label>Batch Size:</label>
              <input
                type="number"
                min="100"
                max="5000"
                step="100"
                value={batchSize}
                onChange={e => setBatchSize(parseInt(e.target.value) || 2000)}
                style={{ width: '80px', marginLeft: '8px' }}
              />
              <span style={{ marginLeft: '8px' }}>points per batch</span>
            </div>

            <div className="control-group">
              <label>
                Load LAZ File:
                <input
                  type="file"
                  accept=".laz,.las"
                  onChange={handleFileLoad}
                  disabled={isLoading}
                  style={{ marginLeft: '8px' }}
                />
              </label>
            </div>

            <div className="control-group">
              <label>
                Load COPC File:
                <input
                  type="file"
                  accept=".copc,.copc.laz"
                  onChange={handleFileLoad}
                  disabled={isLoading}
                  style={{ marginLeft: '8px' }}
                />
              </label>
            </div>

            <div className="control-group">
              <button onClick={() => loadSampleData()} disabled={isLoading || isVoxelProcessing}>
                {isLoading ? 'Loading...' : isVoxelProcessing ? 'Processing...' : 'Load Sample Data'}
              </button>
              <button 
                onClick={handleCancelLoading} 
                disabled={!(isLoading || isVoxelProcessing)}
              >
                {isVoxelProcessing ? 'Cancel Processing' : 'Cancel Loading'}
              </button>
              <button onClick={handleClearScene} disabled={isLoading || isVoxelProcessing}>
                Clear Scene
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
