import React, { useState, useEffect } from 'react';
import { ServiceManager } from '../services/ServiceManager';

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
  const [batchSize, setBatchSize] = useState(500);
  const [supportedFormats, setSupportedFormats] = useState<string[]>([]);
  const [isVoxelProcessing, setIsVoxelProcessing] = useState(false);

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
        const isProcessing = serviceManager.toolsService.voxelDownsampling.isProcessing;
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
  const loadSampleData = async () => {
    if (!serviceManager) {
      console.error('Service manager not initialized');
      return;
    }

    try {
      onErrorChange(null);

      const sampleData = serviceManager.generateSamplePointCloud(
        'sample-1',
        5000
      );

      await serviceManager.loadPointCloud('sample-1', sampleData);

      // Set the sample data as active and trigger rendering
      serviceManager.activePointCloudId = 'sample-1';
      serviceManager.renderActivePointCloud();
    } catch (err) {
      console.error('Error loading sample data:', err);
      onErrorChange(
        err instanceof Error ? err.message : 'Failed to load sample data'
      );
    }
  };

  const handleFileLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !serviceManager) {
      return;
    }

    try {
      // Check if file format is supported
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!serviceManager.isSupportedFormat(extension)) {
        onErrorChange(
          `Unsupported file format: ${extension}. Supported formats: ${supportedFormats.join(', ')}`
        );
        return;
      }
      // Load the file - batches will appear in scene as they load
      await serviceManager.loadFile(file, batchSize);
    } catch (err) {
      console.error('LoadPoints: Error loading file:', err);
      onErrorChange(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      // Reset file input
      event.target.value = '';
    }
  };

  const handleCancelLoading = () => {
    if (serviceManager) {
      // Cancel file loading
      serviceManager.cancelLoading();
      onLoadingChange(false);
      
      // Cancel voxel downsampling if it's running
      if (isVoxelProcessing && serviceManager.toolsService) {
        console.log('Cancelling voxel downsampling from LoadPoints...');
        serviceManager.toolsService.voxelDownsampling.cancelProcessing();
      }
    }
  };

  const handleClearScene = () => {
    if (serviceManager) {
      serviceManager.clearAllPointClouds();
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
            <div className="control-group">
              <label>Batch Size:</label>
              <input
                type="number"
                min="100"
                max="2000"
                step="100"
                value={batchSize}
                onChange={e => setBatchSize(parseInt(e.target.value) || 500)}
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
              <button onClick={loadSampleData} disabled={isLoading || isVoxelProcessing}>
                {isLoading ? 'Loading...' : isVoxelProcessing ? 'Processing...' : 'Load Sample Data'}
              </button>
              <button 
                onClick={handleCancelLoading} 
                disabled={!isLoading && !isVoxelProcessing}
              >
                {isVoxelProcessing ? 'Cancel Processing' : 'Cancel Loading'}
              </button>
              <button onClick={handleClearScene} disabled={isLoading || isVoxelProcessing}>
                Clear Scene
              </button>
            </div>

            <div className="control-group">
              <label>Supported Formats:</label>
              <span
                style={{ marginLeft: '8px', fontSize: '0.9em', color: '#ccc' }}
              >
                {supportedFormats.join(', ')}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
