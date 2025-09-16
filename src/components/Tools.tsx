import React, { useState } from 'react';

interface ToolsProps {
  className?: string;
}

export const Tools: React.FC<ToolsProps> = ({ className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [voxelSize, setVoxelSize] = useState(0.1);

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
                            onChange={(e) => setVoxelSize(parseFloat(e.target.value))}
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
                    <button className="tools-wasm-btn">WASM</button>
                  </div>
                  <div className="tools-col-4">
                    <button className="tools-be-btn">BE</button>
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
