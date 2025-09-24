import React, { useEffect, useRef, useState } from 'react';
import { ServiceManager } from '../services/ServiceManager';
import { Log } from '../utils/Log';
import { Benchmark } from './Benchmark';
import { SceneControls } from './SceneControls';
import { LoadPoints } from './LoadPoints';
import { Tools } from './Tools';

interface PointCloudViewerProps {
  className?: string;
}

export const PointCloudViewer: React.FC<PointCloudViewerProps> = ({
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const serviceManagerRef = useRef<ServiceManager | null>(null);
  const initializationRef = useRef<boolean>(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceManager, setServiceManager] = useState<ServiceManager | null>(
    null
  );

  // Initialize service manager
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Prevent multiple initializations
    if (initializationRef.current) {
      return;
    }
    
    initializationRef.current = true;

    try {
      // Dispose existing service manager if it exists (for HMR scenarios)
      if (serviceManagerRef.current) {
        serviceManagerRef.current.dispose();
        serviceManagerRef.current = null;
      }

      const serviceManager = new ServiceManager();
      serviceManagerRef.current = serviceManager;

      // Set up event listeners
      serviceManager.on('initialized', handleInitialized);
      serviceManager.on('pointCloudLoaded', handlePointCloudLoaded);
      serviceManager.on('pointCloudLoading', handlePointCloudLoading);
      serviceManager.on('pointCloudError', handlePointCloudError);
      serviceManager.on('pointCloudRendered', handlePointCloudRendered);
      serviceManager.on('fileLoadingStarted', handleFileLoadingStarted);
      serviceManager.on('fileLoadingCompleted', handleFileLoadingCompleted);
      serviceManager.on('fileLoadingError', handleFileLoadingError);

      // Initialize the service manager
      serviceManager
        .initialize(canvasRef.current)
        .then(() => {
          setServiceManager(serviceManager);
        })
        .catch(err => {
          Log.Error('PointCloudViewer', 'Failed to initialize service manager', err);
        });

      // No cleanup function in development mode to prevent disposal
      if (process.env.NODE_ENV === 'production') {
        return () => {
          serviceManager?.dispose();
          initializationRef.current = false;
        };
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to initialize viewer'
      );
    }
  }, []);

  // Event handlers
  const handleInitialized = () => {
    // Service manager initialized
    Log.Info('PointCloudViewer', 'Service manager initialized');
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

  return (
    <div className={`point-cloud-viewer-v2 ${className || ''}`}>
      <div className="viewer-canvas-container">
        {error && <div className="error-message">Error: {error}</div>}

        <canvas
          ref={canvasRef}
          className="viewer-canvas"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {serviceManager && (
        <SceneControls
          serviceManager={serviceManager}
          isLoading={isLoading}
          onLoadingChange={setIsLoading}
          onErrorChange={setError}
        />
      )}
      <LoadPoints
        serviceManager={serviceManager}
        isLoading={isLoading}
        onLoadingChange={setIsLoading}
        onErrorChange={setError}
      />
      <Benchmark />
      <Tools serviceManager={serviceManager} />
    </div>
  );
};
