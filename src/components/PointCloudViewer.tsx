import React, { useEffect, useRef, useState } from 'react';
import { ServiceManager } from '../services/ServiceManager';
import type { RenderOptions } from '../services/point/PointCloud';

interface PointCloudViewerProps {
  className?: string;
}

export const PointCloudViewer: React.FC<PointCloudViewerProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const serviceManagerRef = useRef<ServiceManager | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState(500);
  const [renderOptions, setRenderOptions] = useState<RenderOptions>({
    pointSize: 2.0,
    colorMode: 'original',
    showBoundingBox: false,
    showAxes: true,
    backgroundColor: { r: 0.1, g: 0.1, b: 0.1 }
  });

  // Initialize service manager
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      const serviceManager = new ServiceManager();
      serviceManagerRef.current = serviceManager;

      // Set up event listeners
      serviceManager.on('initialized', handleInitialized);
      serviceManager.on('pointCloudLoaded', handlePointCloudLoaded);
      serviceManager.on('pointCloudLoading', handlePointCloudLoading);
      serviceManager.on('pointCloudError', handlePointCloudError);
      serviceManager.on('renderOptionsChanged', handleRenderOptionsChanged);
      serviceManager.on('pointCloudRendered', handlePointCloudRendered);
      serviceManager.on('fileLoadingStarted', handleFileLoadingStarted);
      serviceManager.on('fileLoadingCompleted', handleFileLoadingCompleted);
      serviceManager.on('fileLoadingError', handleFileLoadingError);

      // Initialize the service manager
      serviceManager.initialize(canvasRef.current);

      return () => {
        // Cleanup
        serviceManager.dispose();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
    }
  }, []);

  // Event handlers
  const handleInitialized = () => {
    // Service manager initialized
  };

  const handlePointCloudLoaded = (_data: any) => {
    setIsLoading(false);
    setError(null);
  };

  const handlePointCloudLoading = (_data: any) => {
    setIsLoading(true);
    setError(null);
  };

  const handlePointCloudError = (data: any) => {
    setIsLoading(false);
    setError(data.error || 'Unknown error occurred');
  };

  const handleRenderOptionsChanged = (options: RenderOptions) => {
    setRenderOptions(options);
  };

  const handlePointCloudRendered = (_data: any) => {
    // Point cloud rendered
  };

  const handleFileLoadingStarted = (_data: any) => {
    setIsLoading(true);
    setError(null);
  };

  const handleFileLoadingCompleted = (_data: any) => {
    setIsLoading(false);
    setError(null);
  };

  const handleFileLoadingError = (data: any) => {
    setIsLoading(false);
    setError(data.error || 'Failed to load file');
  };

  // Helper methods


  const loadSampleData = async () => {
    if (!serviceManagerRef.current) return;

    try {
      setIsLoading(true);
      setError(null);
      
      const sampleData = serviceManagerRef.current.generateSamplePointCloud('sample-1', 5000);
      await serviceManagerRef.current.loadPointCloud('sample-1', sampleData);
      
      // Set the sample data as active and trigger rendering
      serviceManagerRef.current.activePointCloudId = 'sample-1';
      serviceManagerRef.current.renderActivePointCloud();
      
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample data');
      setIsLoading(false);
    }
  };

  const handleFileLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file || !serviceManagerRef.current) {
      return;
    }

    try {
      // Check if file format is supported
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!serviceManagerRef.current.isSupportedFormat(extension)) {
        setError(`Unsupported file format: ${extension}. Supported formats: ${serviceManagerRef.current.getSupportedFormats().join(', ')}`);
        return;
      }
      // Load the file - batches will appear in scene as they load
      await serviceManagerRef.current.loadFile(file, batchSize);

    } catch (err) {
      console.error('PointCloudViewer: Error loading file:', err);
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      // Reset file input
      event.target.value = '';
    }
  };

  // UI event handlers
  const handleRenderOptionChange = (option: keyof RenderOptions, value: any) => {
    if (!serviceManagerRef.current) return;

    const newOptions = { ...renderOptions, [option]: value };
    setRenderOptions(newOptions);
    
    // Update render options through RenderService (for state management)
    serviceManagerRef.current.renderService.renderOptions = newOptions;
    
    // Update the active point cloud mesh with new options (this handles the actual rendering)
    const activeId = serviceManagerRef.current.activePointCloudId;
    if (activeId) {
      serviceManagerRef.current.pointService.updateRenderOptions(activeId, newOptions);
    }
  };



  return (
    <div className={`point-cloud-viewer-v2 ${className || ''}`}>
      <div className="viewer-controls">

        <div className="control-group">
          <label>Point Size:</label>
          <input
            type="range"
            min="0.1"
            max="20"
            step="0.1"
            value={renderOptions.pointSize}
            onChange={(e) => handleRenderOptionChange('pointSize', parseFloat(e.target.value))}
            style={{ width: '120px' }}
          />
          <span style={{ minWidth: '40px', textAlign: 'right' }}>{renderOptions.pointSize.toFixed(1)}</span>
        </div>

        <div className="control-group">
          <label>Color Mode:</label>
          <select 
            value={renderOptions.colorMode} 
            onChange={(e) => handleRenderOptionChange('colorMode', e.target.value)}
          >
            <option value="original">Original</option>
            <option value="intensity">Intensity</option>
            <option value="height">Height</option>
            <option value="classification">Classification</option>
          </select>
        </div>

        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={renderOptions.showBoundingBox}
              onChange={(e) => handleRenderOptionChange('showBoundingBox', e.target.checked)}
            />
            Show Bounding Box
          </label>
        </div>

        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={renderOptions.showAxes}
              onChange={(e) => handleRenderOptionChange('showAxes', e.target.checked)}
            />
            Show Axes
          </label>
        </div>

        <div className="control-group">
          <label>Batch Size:</label>
          <input
            type="number"
            min="100"
            max="2000"
            step="100"
            value={batchSize}
            onChange={(e) => setBatchSize(parseInt(e.target.value) || 500)}
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
          <button onClick={loadSampleData} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Load Sample Data'}
          </button>
          <button 
            onClick={() => {
              if (serviceManagerRef.current) {
                serviceManagerRef.current.clearAllPointClouds();
              }
            }} 
            disabled={isLoading}
            style={{ marginLeft: '8px' }}
          >
            Clear Scene
          </button>
        </div>

      </div>


      <div className="viewer-canvas-container">
        {error && (
          <div className="error-message">
            Error: {error}
          </div>
        )}
        
        
        <canvas
          ref={canvasRef}
          className="viewer-canvas"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};
