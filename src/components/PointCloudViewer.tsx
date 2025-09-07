import React, { useEffect, useRef, useState } from 'react';
import { PointCloudManager } from '../core/PointCloudManager';
import { BabylonSceneManager } from '../rendering/BabylonSceneManager';
import type { PointCloudEvent, RenderOptions, CameraSettings } from '../types/PointCloud';

interface PointCloudViewerProps {
  className?: string;
}

export const PointCloudViewer: React.FC<PointCloudViewerProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointCloudManagerRef = useRef<PointCloudManager | null>(null);
  const sceneManagerRef = useRef<BabylonSceneManager | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePointCloudId, setActivePointCloudId] = useState<string | null>(null);
  const [pointCloudIds, setPointCloudIds] = useState<string[]>([]);
  const [renderOptions, setRenderOptions] = useState<RenderOptions>({
    pointSize: 2.0,
    colorMode: 'original',
    showBoundingBox: false,
    showAxes: true,
    backgroundColor: { r: 0.1, g: 0.1, b: 0.1 }
  });

  // Initialize managers
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      // Initialize point cloud manager
      const pointCloudManager = new PointCloudManager();
      pointCloudManagerRef.current = pointCloudManager;

      // Initialize scene manager
      const sceneManager = new BabylonSceneManager(canvasRef.current);
      sceneManagerRef.current = sceneManager;

      // Set up event listeners
      pointCloudManager.on('loaded', handlePointCloudLoaded);
      pointCloudManager.on('loading', handlePointCloudLoading);
      pointCloudManager.on('error', handlePointCloudError);
      pointCloudManager.on('selectionChanged', handleSelectionChanged);
      pointCloudManager.on('renderOptionsChanged', handleRenderOptionsChanged);

      // Load sample data
      loadSampleData();

      return () => {
        // Cleanup
        pointCloudManager.removeAllListeners();
        sceneManager.dispose();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
    }
  }, []);

  // Handle point cloud loaded
  const handlePointCloudLoaded = (event: PointCloudEvent) => {
    setIsLoading(false);
    setError(null);
    updatePointCloudList();
    renderActivePointCloud();
  };

  // Handle point cloud loading
  const handlePointCloudLoading = (event: PointCloudEvent) => {
    setIsLoading(true);
    setError(null);
  };

  // Handle point cloud error
  const handlePointCloudError = (event: PointCloudEvent) => {
    setIsLoading(false);
    setError(event.data?.error || 'Unknown error occurred');
  };

  // Handle selection changed
  const handleSelectionChanged = (event: PointCloudEvent) => {
    setActivePointCloudId(event.data?.activeId || null);
    renderActivePointCloud();
  };

  // Handle render options changed
  const handleRenderOptionsChanged = (event: PointCloudEvent) => {
    setRenderOptions(event.data);
    renderActivePointCloud();
  };

  // Update point cloud list
  const updatePointCloudList = () => {
    if (pointCloudManagerRef.current) {
      setPointCloudIds(pointCloudManagerRef.current.getPointCloudIds());
    }
  };

  // Render active point cloud
  const renderActivePointCloud = () => {
    if (!pointCloudManagerRef.current || !sceneManagerRef.current) return;

    const activePointCloud = pointCloudManagerRef.current.getActivePointCloud();
    if (activePointCloud) {
      const currentOptions = pointCloudManagerRef.current.getRenderOptions();
      sceneManagerRef.current.renderPointCloud(
        pointCloudManagerRef.current.getActivePointCloudId()!,
        activePointCloud,
        currentOptions
      );
    }
  };

  // Load sample data
  const loadSampleData = async () => {
    if (!pointCloudManagerRef.current) return;

    try {
      const sampleData = pointCloudManagerRef.current.generateSamplePointCloud('sample-1', 5000);
      await pointCloudManagerRef.current.loadPointCloud('sample-1', sampleData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample data');
    }
  };

  // Handle render options change
  const handleRenderOptionChange = (option: keyof RenderOptions, value: any) => {
    if (!pointCloudManagerRef.current) return;

    const newOptions = { ...renderOptions, [option]: value };
    setRenderOptions(newOptions);
    pointCloudManagerRef.current.updateRenderOptions(newOptions);
  };

  // Handle point cloud selection
  const handlePointCloudSelect = (id: string) => {
    if (pointCloudManagerRef.current) {
      pointCloudManagerRef.current.setActivePointCloud(id);
    }
  };

  return (
    <div className={`point-cloud-viewer ${className || ''}`}>
      <div className="viewer-controls">
        <div className="control-group">
          <label>Point Cloud:</label>
          <select 
            value={activePointCloudId || ''} 
            onChange={(e) => handlePointCloudSelect(e.target.value)}
          >
            <option value="">Select a point cloud</option>
            {pointCloudIds.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>Point Size:</label>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={renderOptions.pointSize}
            onChange={(e) => handleRenderOptionChange('pointSize', parseFloat(e.target.value))}
          />
          <span>{renderOptions.pointSize}</span>
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
          <button onClick={loadSampleData} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Load Sample Data'}
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
