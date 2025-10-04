import React, { useState, useEffect } from 'react';
import { ServiceManager } from '../services/ServiceManager';
import { Log } from '../utils/Log';

interface SceneControlsProps {
  className?: string;
  serviceManager: ServiceManager | null;
}

export const SceneControls: React.FC<SceneControlsProps> = ({
  className,
  serviceManager,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Internal state for controls
  const [pointSize, setPointSize] = useState(2.0);
  const [zoomSensitivity, setZoomSensitivity] = useState(0.005);
  const [panningSensitivity, setPanningSensitivity] = useState(0.1);
  const [targetEnabled, setTargetEnabled] = useState(true);
  
  // Debug camera state
  const [currentCamera, setCurrentCamera] = useState<'main' | 'debug'>('main');
  const [showFrustum, setShowFrustum] = useState(false);

  // Initialize values from service manager
  useEffect(() => {
    if (serviceManager?.sceneService) {
      // Set default values since we removed CameraService
      setZoomSensitivity(0.005);
      setPanningSensitivity(0.1);
      setTargetEnabled(true);
    }
  }, [serviceManager?.sceneService]); // Only run when sceneService changes

  // Event handlers
  const handlePointSizeChange = (newPointSize: number) => {
    if (!serviceManager) return;

    setPointSize(newPointSize);

    // Update all point cloud meshes with new point size
    if (serviceManager.pointService.pointMeshInstance) {
      serviceManager.pointService.pointMeshInstance.updateAllPointSizes(
        newPointSize
      );
    }
  };

  const handleZoomSensitivityChange = (newZoomSensitivity: number) => {
    if (!serviceManager) return;

    setZoomSensitivity(newZoomSensitivity);
    // Use CameraService setter which handles the active camera
    serviceManager.cameraService.zoomSensitivity = newZoomSensitivity;
  };

  const handlePanningSensitivityChange = (newPanningSensitivity: number) => {
    if (!serviceManager) return;

    setPanningSensitivity(newPanningSensitivity);
    // Use CameraService setter which handles the active camera
    serviceManager.cameraService.panningSensitivity = newPanningSensitivity;
  };

  const handleTargetToggle = (enabled: boolean) => {
    if (!serviceManager) {
      Log.Warn('SceneControls', 'No service manager available');
      return;
    }

    setTargetEnabled(enabled);
    
    // Use CameraService to toggle target
    serviceManager.cameraService.targetEnabled = enabled;
  };

  // Debug camera handlers
  const handleToggleFrustum = () => {
    if (!serviceManager) return;

    const newShowFrustum = !showFrustum;
    setShowFrustum(newShowFrustum);
    serviceManager.cameraService.showFrustum(newShowFrustum);
  };

  const handleSwitchCamera = (camera: 'main' | 'debug') => {
    if (!serviceManager) return;

    if (camera === 'main') {
      serviceManager.cameraService.switchToMainCamera();
      setCurrentCamera('main');
    } else {
      serviceManager.cameraService.switchToDebugCamera();
      setCurrentCamera('debug');
    }
  };


  return (
    <>
      {/* Toggle Button */}
      <div className="scene-controls-toggle">
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="scene-controls-toggle-btn"
        >
          {isVisible ? 'Hide' : 'Scene Controls'}
        </button>
      </div>

      {/* Scene Controls Panel */}
      {isVisible && (
        <div className={`scene-controls-panel ${className || ''}`}>
          <div className="scene-controls-header">
            <h3>Scene Controls</h3>
            <button
              onClick={() => setIsVisible(false)}
              className="scene-controls-close"
            >
              ×
            </button>
          </div>

          <div className="scene-controls-content">
            <div className="control-group">
              <label>Point Size:</label>
              <input
                type="range"
                min="0.1"
                max="20"
                step="0.1"
                value={pointSize}
                onChange={e =>
                  handlePointSizeChange(parseFloat(e.target.value))
                }
                style={{ width: '120px' }}
              />
              <span style={{ minWidth: '20px', textAlign: 'right' }}>
                {pointSize.toFixed(1)}
              </span>
            </div>

            <div className="control-group">
              <label>Zoom Sensitivity:</label>
              <input
                type="range"
                min="0.001"
                max="0.1"
                step="0.001"
                value={zoomSensitivity}
                onChange={e =>
                  handleZoomSensitivityChange(parseFloat(e.target.value))
                }
                style={{ width: '120px' }}
              />
              <span style={{ minWidth: '30px', textAlign: 'right' }}>
                {zoomSensitivity.toFixed(3)}
              </span>
            </div>

            <div className="control-group">
              <label>Panning Sensitivity:</label>
              <input
                type="range"
                min="0.01"
                max="0.5"
                step="0.01"
                value={panningSensitivity}
                onChange={e => handlePanningSensitivityChange(parseFloat(e.target.value))}
                style={{ width: '120px' }}
              />
              <span style={{ minWidth: '30px', textAlign: 'right' }}>
                {panningSensitivity.toFixed(2)}
              </span>
            </div>

            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={targetEnabled}
                  onChange={e => handleTargetToggle(e.target.checked)}
                />
                Camera Target
              </label>
            </div>

            {/* Debug Camera Controls */}
            <div className="control-group">
              <label>Camera:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleSwitchCamera('main')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: currentCamera === 'main' ? '#007bff' : 'rgba(255,255,255,0.1)',
                    color: currentCamera === 'main' ? '#fff' : '#ccc',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Main
                </button>
                <button
                  onClick={() => handleSwitchCamera('debug')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: currentCamera === 'debug' ? '#007bff' : 'rgba(255,255,255,0.1)',
                    color: currentCamera === 'debug' ? '#fff' : '#ccc',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Debug
                </button>
              </div>
            </div>

            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={showFrustum}
                  onChange={handleToggleFrustum}
                />
                Show Frustum
              </label>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
