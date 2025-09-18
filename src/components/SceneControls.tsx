import React, { useState, useEffect } from 'react';
import { ServiceManager } from '../services/ServiceManager';

interface SceneControlsProps {
  className?: string;
  serviceManager: ServiceManager | null;
  isLoading: boolean;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
}

export const SceneControls: React.FC<SceneControlsProps> = ({
  className,
  serviceManager,
  isLoading,
  onLoadingChange,
  onErrorChange,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Internal state for controls
  const [pointSize, setPointSize] = useState(2.0);
  const [zoomSensitivity, setZoomSensitivity] = useState(0.005);
  const [panningSensitivity, setPanningSensitivity] = useState(0.05);
  const [targetEnabled, setTargetEnabled] = useState(true);

  // Initialize values from service manager
  useEffect(() => {
    if (serviceManager) {
      setZoomSensitivity(serviceManager.cameraService.zoomSensitivity);
      setPanningSensitivity(serviceManager.cameraService.panningSensitivity);
      setTargetEnabled(serviceManager.cameraService.targetEnabled);
    }
  }, [serviceManager]);

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
    serviceManager.cameraService.zoomSensitivity = newZoomSensitivity;
  };

  const handlePanningSensitivityChange = (newPanningSensitivity: number) => {
    if (!serviceManager) return;

    setPanningSensitivity(newPanningSensitivity);
    serviceManager.cameraService.panningSensitivity = newPanningSensitivity;
  };

  const handleTargetToggle = (enabled: boolean) => {
    if (!serviceManager) return;

    setTargetEnabled(enabled);
    serviceManager.cameraService.targetEnabled = enabled;
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
                onChange={e =>
                  handlePanningSensitivityChange(parseFloat(e.target.value))
                }
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
          </div>
        </div>
      )}
    </>
  );
};
