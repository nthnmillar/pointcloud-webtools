import React, { useState, useEffect, useRef } from 'react';
import { ServiceManager } from '../services/ServiceManager';
import { Log } from '../utils/Log';
import { WorkerManager } from '../services/tools/WorkerManager';

interface ToolsProps {
  serviceManager: ServiceManager | null;
  className?: string;
  onWasmResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onWasmCppMainResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onTsResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onBeResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onWasmRustResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onRustWasmMainResults?: (results: {
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    reductionRatio?: number;
    voxelCount?: number;
    smoothingRadius?: number;
    iterations?: number;
  }) => void;
  onCurrentToolChange?: (tool: 'voxel' | 'smoothing') => void;
}

export const Tools: React.FC<ToolsProps> = ({ serviceManager, className, onWasmResults, onTsResults, onBeResults, onWasmRustResults, onWasmCppMainResults, onRustWasmMainResults, onCurrentToolChange }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [voxelSize, setVoxelSize] = useState(2.0);
  const [maxVoxels, setMaxVoxels] = useState(2000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVoxelDebug, setShowVoxelDebug] = useState(false);
  

  // Point cloud smoothing state
  const [smoothingRadius, setSmoothingRadius] = useState(0.5);
  const [smoothingIterations, setSmoothingIterations] = useState(3);
  
  
  // Use ref to track processing state for event handlers
  const isProcessingRef = useRef(false);

  // Processing worker for WASM implementations (separate threads)
  const workerManager = useRef<WorkerManager | null>(null);
  const isInitializing = useRef(false);

  // Initialize workers for WASM threading
  useEffect(() => {
    const initWorkers = async () => {
      try {
        // Prevent double initialization
        if (workerManager.current || isInitializing.current) {
          Log.Info('Tools', 'WorkerManager already exists or initializing, skipping');
          return;
        }
        
        isInitializing.current = true;
        Log.Info('Tools', 'Creating WorkerManager...');
        workerManager.current = new WorkerManager();
        Log.Info('Tools', 'Initializing WorkerManager...');
        await workerManager.current.initialize();
        Log.Info('Tools', 'Workers initialized for WASM threading');
        isInitializing.current = false;
      } catch (error) {
        Log.Error('Tools', 'Failed to initialize workers - FAILING', error);
        isInitializing.current = false;
        // Set workerManager to null to indicate complete failure
        workerManager.current = null;
        throw error; // Re-throw to make the failure visible
      }
    };

    initWorkers();

    return () => {
      if (workerManager.current && !isInitializing.current) {
        Log.Info('Tools', 'Cleaning up WorkerManager...');
        workerManager.current.dispose();
        workerManager.current = null;
      }
    };
  }, []);

  // Note: Using component default values instead of service defaults

  // Listen for clear scene button clicks to turn off voxel debug toggle
  useEffect(() => {
    if (!serviceManager) return;

    const handleSceneClearedByUser = () => {
      setShowVoxelDebug(false);
    };

    serviceManager.on('sceneClearedByUser', handleSceneClearedByUser);

    return () => {
      serviceManager.off('sceneClearedByUser', handleSceneClearedByUser);
    };
  }, [serviceManager]);

  // Listen for point cloud clearing events to reset processing state
  useEffect(() => {
    if (!serviceManager?.pointService) return;

    const handlePointCloudsCleared = () => {
      setIsProcessing(false);
    };

    serviceManager.pointService.on('cleared', handlePointCloudsCleared);

    return () => {
      serviceManager.pointService.off('cleared', handlePointCloudsCleared);
    };
  }, [serviceManager]);

  // Listen to tools processing events
  useEffect(() => {
    if (!serviceManager?.toolsService) return;

    const toolsService = serviceManager.toolsService;

    const handleProcessingFinished = () => {
      setIsProcessing(false);
      isProcessingRef.current = false;
    };
    const handleProcessingCancelled = () => {
      setIsProcessing(false);
      isProcessingRef.current = false;
    };

    toolsService.on('processingCompleted', handleProcessingFinished);
    toolsService.on('processingError', handleProcessingCancelled);

    return () => {
      toolsService.off('processingCompleted', handleProcessingFinished);
      toolsService.off('processingError', handleProcessingCancelled);
    };
  }, [serviceManager]);

  // Handle voxel size changes
  const handleVoxelSizeChange = (newSize: number) => {
    console.log('🎚️ Slider changed to:', newSize, 'showVoxelDebug:', showVoxelDebug);
    setVoxelSize(newSize);
    if (serviceManager?.toolsService) {
      // Update voxel debug visualization if it's currently visible
      if (showVoxelDebug) {
        // Update existing debug squares instead of creating new ones
        console.log('🔧 Updating voxel size for existing debug visualization:', newSize);
        serviceManager.toolsService.updateVoxelSize(newSize);
      } else {
        console.log('🔧 Debug visualization not visible, skipping update');
      }
    } else {
      console.log('🔧 Service manager not available');
    }
  };


  // Handle voxel debug visualization
  const handleVoxelDebugToggle = () => {
    const newShowDebug = !showVoxelDebug;
    setShowVoxelDebug(newShowDebug);
    
    if (serviceManager?.toolsService) {
      if (newShowDebug) {
        // Show voxel debug grid
        serviceManager.toolsService.showVoxelDebug(voxelSize, 'TS', 2000);
      } else {
        // Hide voxel debug grid
        serviceManager.toolsService.hideVoxelDebug();
      }
    }
  };

  // Debug voxel handlers for benchmarking
  const handleTsVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(voxelSize, 'TS', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'TS Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      // Emit benchmark results for debug voxel generation
      if (onTsResults) {
        onTsResults({
          originalCount: 0, // Debug voxels don't have original point count
          processingTime: processingTime,
          voxelCount: result?.voxelCount || 0,
        });
      }
    } catch (error) {
      Log.Error('Tools', 'TS Debug Voxel generation failed', error);
    }
  };

  const handleWasmVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(voxelSize, 'WASM', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'WASM Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      // Emit benchmark results for debug voxel generation
      if (onWasmResults) {
        onWasmResults({
          originalCount: 0, // Debug voxels don't have original point count
          processingTime: processingTime,
          voxelCount: result?.voxelCount || 0,
        });
      }
    } catch (error) {
      Log.Error('Tools', 'WASM Debug Voxel generation failed', error);
    }
  };

  const handleWasmCppMainVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(voxelSize, 'WASM_MAIN', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'WASM C++ Main Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      // Emit benchmark results for debug voxel generation
      if (onWasmCppMainResults) {
        onWasmCppMainResults({
          originalCount: 0, // Debug voxels don't have original point count
          processingTime: processingTime,
          voxelCount: result?.voxelCount || 0,
        });
      }
    } catch (error) {
      Log.Error('Tools', 'WASM C++ Main Debug Voxel generation failed', error);
    }
  };

  const handleRustWasmMainVoxelDownsampling = async () => {
    Log.Info('Tools', '=== Starting Rust WASM Main Thread Voxel Downsampling ===');
    
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      Log.Debug('Tools', 'Found point cloud IDs', allPointCloudIds);
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return;
      }

      // Collect all points from all point clouds
      const allPositions: number[] = [];
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
            
            // Calculate global bounding box
            globalMinX = Math.min(globalMinX, point.position.x);
            globalMinY = Math.min(globalMinY, point.position.y);
            globalMinZ = Math.min(globalMinZ, point.position.z);
            globalMaxX = Math.max(globalMaxX, point.position.x);
            globalMaxY = Math.max(globalMaxY, point.position.y);
            globalMaxZ = Math.max(globalMaxZ, point.position.z);
          }
        }
      }

      if (allPositions.length === 0) {
        Log.Error('Tools', 'No valid points found for Rust WASM Main processing');
        return;
      }

      const pointCloudData = new Float32Array(allPositions);

      Log.Info('Tools', 'Starting Rust WASM Main voxel downsampling', {
        pointCount: pointCloudData.length / 3,
        voxelSize,
        bounds: { globalMinX, globalMinY, globalMinZ, globalMaxX, globalMaxY, globalMaxZ }
      });

      // Clear the scene
      serviceManager.pointService?.clearAllPointClouds();

      // Set current tool for benchmark display
      onCurrentToolChange?.('voxel');

      // Process with Rust WASM Main thread - NO FALLBACKS
      const result = await serviceManager.toolsService.performVoxelDownsamplingRustWasmMain({
        pointCloudData,
        voxelSize,
        globalBounds: {
          minX: globalMinX,
          minY: globalMinY,
          minZ: globalMinZ,
          maxX: globalMaxX,
          maxY: globalMaxY,
          maxZ: globalMaxZ,
        }
      });

      if (result.success && result.downsampledPoints) {
        Log.Info('Tools', 'Rust WASM Main result received', {
          success: result.success,
          downsampledPointsLength: result.downsampledPoints.length,
          originalCount: result.originalCount,
          downsampledCount: result.downsampledCount
        });

        // Convert result to point cloud format
        const downsampledPoints = [];
        for (let i = 0; i < result.downsampledPoints.length; i += 3) {
          downsampledPoints.push({
            position: { 
              x: result.downsampledPoints[i], 
              y: result.downsampledPoints[i + 1], 
              z: result.downsampledPoints[i + 2] 
            },
            color: { r: 1, g: 0.4, b: 0.28 }, // Orange/red color for Rust WASM Main processed points
            intensity: 1,
            classification: 0,
          });
        }

        const rustWasmMainPointCloud = {
          points: downsampledPoints,
          metadata: {
            name: 'Rust WASM Main Downsampled Point Cloud',
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
            originalCount: result.originalCount,
            downsampledCount: result.downsampledCount,
            voxelSize: voxelSize,
            processingTime: result.processingTime || 0
          },
        };

        const rustWasmMainId = `rust_wasm_main_downsampled_${Date.now()}`;
        await serviceManager.pointService?.loadPointCloud(rustWasmMainId, rustWasmMainPointCloud, false);

        if (rustWasmMainPointCloud) {
          onRustWasmMainResults?.({
            originalCount: result.originalCount || 0,
            downsampledCount: result.downsampledCount || 0,
            processingTime: result.processingTime || 0
          });

          Log.Info('Tools', 'Rust WASM Main voxel downsampling completed', {
            originalCount: result.originalCount,
            downsampledCount: result.downsampledCount,
            processingTime: result.processingTime
          });
        }
      } else {
        Log.Error('Tools', 'Rust WASM Main voxel downsampling failed', result.error);
      }
    } catch (error) {
      Log.Error('Tools', 'Rust WASM Main voxel downsampling error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleRustWasmMainPointCloudSmoothing = async () => {
    Log.Info('Tools', '=== Starting Rust WASM Main Thread Point Cloud Smoothing ===');
    
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      Log.Debug('Tools', 'Found point cloud IDs', allPointCloudIds);
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return;
      }

      // Collect all points from all point clouds
      const allPositions: number[] = [];

      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
          }
        }
      }

      if (allPositions.length === 0) {
        Log.Error('Tools', 'No valid points found for Rust WASM Main processing');
        return;
      }

      const pointCloudData = new Float32Array(allPositions);

      Log.Info('Tools', 'Starting Rust WASM Main point cloud smoothing', {
        pointCount: pointCloudData.length / 3,
        smoothingRadius,
        iterations: smoothingIterations
      });

      // Clear the scene
      serviceManager.pointService?.clearAllPointClouds();

      // Set current tool for benchmark display
      onCurrentToolChange?.('smoothing');

      // Process with Rust WASM Main thread - NO FALLBACKS
      const result = await serviceManager.toolsService.performPointCloudSmoothingRustWasmMain({
        points: pointCloudData,
        smoothingRadius,
        iterations: smoothingIterations
      });

      if (result.success && result.smoothedPoints) {
        Log.Info('Tools', 'Rust WASM Main smoothing result received', {
          success: result.success,
          smoothedPointsLength: result.smoothedPoints.length,
          originalCount: result.originalCount,
          smoothedCount: result.smoothedCount
        });

        // Convert result to point cloud format
        const smoothedPoints = [];
        for (let i = 0; i < result.smoothedPoints.length; i += 3) {
          smoothedPoints.push({
            position: { 
              x: result.smoothedPoints[i], 
              y: result.smoothedPoints[i + 1], 
              z: result.smoothedPoints[i + 2] 
            },
            color: { r: 1, g: 0.4, b: 0.28 }, // Orange/red color for Rust WASM Main smoothed points
            intensity: 1,
            classification: 0,
          });
        }

        const rustWasmMainPointCloud = {
          points: smoothedPoints,
          metadata: {
            name: 'Rust WASM Main Smoothed Point Cloud',
            totalPoints: smoothedPoints.length,
            bounds: {
              min: { 
                x: Math.min(...smoothedPoints.map(p => p.position.x)), 
                y: Math.min(...smoothedPoints.map(p => p.position.y)), 
                z: Math.min(...smoothedPoints.map(p => p.position.z)) 
              },
              max: { 
                x: Math.max(...smoothedPoints.map(p => p.position.x)), 
                y: Math.max(...smoothedPoints.map(p => p.position.y)), 
                z: Math.max(...smoothedPoints.map(p => p.position.z)) 
              }
            },
            hasColor: true,
            hasIntensity: true,
            hasClassification: true,
            originalCount: result.originalCount,
            smoothedCount: result.smoothedCount,
            smoothingRadius: smoothingRadius,
            iterations: smoothingIterations,
            processingTime: result.processingTime || 0
          },
        };

        const rustWasmMainId = `rust_wasm_main_smoothed_${Date.now()}`;
        await serviceManager.pointService?.loadPointCloud(rustWasmMainId, rustWasmMainPointCloud, false);

        if (rustWasmMainPointCloud) {
          onRustWasmMainResults?.({
            originalCount: result.originalCount || 0,
            smoothedCount: result.smoothedCount || 0,
            processingTime: result.processingTime || 0,
            smoothingRadius: smoothingRadius,
            iterations: smoothingIterations
          });

          Log.Info('Tools', 'Rust WASM Main point cloud smoothing completed', {
            originalCount: result.originalCount,
            smoothedCount: result.smoothedCount,
            processingTime: result.processingTime
          });
        }
      } else {
        Log.Error('Tools', 'Rust WASM Main point cloud smoothing failed', result.error);
      }
    } catch (error) {
      Log.Error('Tools', 'Rust WASM Main point cloud smoothing error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleRustWasmMainVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(voxelSize, 'RUST_WASM_MAIN', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'Rust WASM Main Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      // Emit benchmark results for debug voxel generation
      if (onRustWasmMainResults) {
        onRustWasmMainResults({
          originalCount: 0, // Debug voxels don't have original point count
          processingTime: processingTime,
          voxelCount: result?.voxelCount || 0,
        });
      }
    } catch (error) {
      Log.Error('Tools', 'Rust WASM Main Debug Voxel generation failed', error);
    }
  };

  const handleBeVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(voxelSize, 'BE', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'BE Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      // Emit benchmark results for debug voxel generation
      if (onBeResults) {
        onBeResults({
          originalCount: 0, // Debug voxels don't have original point count
          processingTime: processingTime,
          voxelCount: result?.voxelCount || 0,
        });
      }
    } catch (error) {
      Log.Error('Tools', 'BE Debug Voxel generation failed', error);
    }
  };

  const handleWasmRustVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(voxelSize, 'WASM_RUST', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'WASM Rust Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      // Emit benchmark results for debug voxel generation
      if (onWasmRustResults) {
        onWasmRustResults({
          originalCount: 0, // Debug voxels don't have original point count
          processingTime: processingTime,
          voxelCount: result?.voxelCount || 0,
        });
      }
    } catch (error) {
      Log.Error('Tools', 'WASM Rust Debug Voxel generation failed', error);
    }
  };

  // Handle cancellation
  const handleCancelProcessing = () => {
    if (serviceManager?.toolsService && isProcessing) {
      Log.Info('Tools', 'Cancelling processing...');
      // Note: Cancellation will be re-implemented in unified service
    }
  };


  // WASM Processing Functions
  const handleWasmVoxelDownsampling = async () => {
    Log.Info('Tools', '=== Starting WASM Voxel Downsampling ===');
    
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    // Set processing state immediately to prevent debug toggle from being turned off
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      Log.Debug('Tools', 'Found point cloud IDs', allPointCloudIds);
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return;
      }

      // Collect all points from all point clouds
      const allPositions: number[] = [];
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
            
            // Calculate global bounding box
            globalMinX = Math.min(globalMinX, point.position.x);
            globalMinY = Math.min(globalMinY, point.position.y);
            globalMinZ = Math.min(globalMinZ, point.position.z);
            globalMaxX = Math.max(globalMaxX, point.position.x);
            globalMaxY = Math.max(globalMaxY, point.position.y);
            globalMaxZ = Math.max(globalMaxZ, point.position.z);
          }
        }
      }

      if (allPositions.length === 0) {
        Log.Error('Tools', 'No valid points found for WASM processing');
        return;
      }

      const pointCloudData = new Float32Array(allPositions);

      Log.Info('Tools', 'Starting WASM voxel downsampling', {
        pointCount: pointCloudData.length / 3,
        voxelSize,
        bounds: { globalMinX, globalMinY, globalMinZ, globalMaxX, globalMaxY, globalMaxZ }
      });

      // Clear the scene
      serviceManager.pointService?.clearAllPointClouds();

      // Set current tool for benchmark display
      onCurrentToolChange?.('voxel');

      // Process with WASM C++ worker - NO FALLBACKS
      if (!workerManager.current) {
        Log.Error('Tools', 'Worker manager not available for C++ WASM');
        throw new Error('Worker manager not available for C++ WASM');
      }

      if (!workerManager.current.isReady) {
        Log.Error('Tools', 'Workers not initialized - FAILING');
        throw new Error('Workers not initialized - C++ WASM worker system failed');
      }

      Log.Info('Tools', 'Calling worker for WASM C++ voxel downsampling');
      const workerResult = await workerManager.current.processVoxelDownsampling(
        'WASM_CPP',
        pointCloudData,
        voxelSize,
        {
          minX: globalMinX,
          minY: globalMinY,
          minZ: globalMinZ,
          maxX: globalMaxX,
          maxY: globalMaxY,
          maxZ: globalMaxZ,
        }
      );

      if (workerResult.type !== 'SUCCESS' || !workerResult.data?.downsampledPoints) {
        Log.Error('Tools', 'WASM C++ voxel downsampling failed in worker', workerResult.error);
        throw new Error(`WASM C++ voxel downsampling failed: ${workerResult.error}`);
      }

      // Convert worker result to expected format
      const result = {
        success: true,
        downsampledPoints: workerResult.data.downsampledPoints,
        originalCount: workerResult.data.originalCount,
        downsampledCount: workerResult.data.downsampledCount,
        processingTime: workerResult.data.processingTime,
        voxelCount: workerResult.data.downsampledCount
      };

      if (result.success && result.downsampledPoints) {
          Log.Info('Tools', 'WASM result received', {
            success: result.success,
            downsampledPointsLength: result.downsampledPoints.length,
            originalCount: result.originalCount,
            downsampledCount: result.downsampledCount
          });
          
          // Convert downsampled points to PointCloudPoint array
          const downsampledPoints = [];
          for (let i = 0; i < result.downsampledPoints.length; i += 3) {
            downsampledPoints.push({
              position: {
                x: result.downsampledPoints[i],
                y: result.downsampledPoints[i + 1],
                z: result.downsampledPoints[i + 2],
              },
              color: { r: 0, g: 1, b: 0 }, // Green color for WASM processed points
              intensity: 1,
              classification: 0,
            });
          }
          
          Log.Info('Tools', 'Converted downsampled points', {
            downsampledPointsArrayLength: downsampledPoints.length
          });

          // Create point cloud for WASM result
          const wasmPointCloud = {
            points: downsampledPoints,
            metadata: {
              name: 'WASM Downsampled Point Cloud',
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
              originalCount: result.originalCount,
              downsampledCount: result.downsampledCount,
              voxelSize: voxelSize,
              processingTime: result.processingTime || 0
            },
          };

          // Add WASM result to the scene
          const wasmId = `wasm_downsampled_${Date.now()}`;
          await serviceManager.pointService?.loadPointCloud(wasmId, wasmPointCloud, false);

          Log.Info('Tools', 'WASM voxel downsampling completed', {
            originalCount: result.originalCount || 0,
            downsampledCount: result.downsampledCount || 0,
            reduction: result.originalCount && result.downsampledCount ? ((result.originalCount - result.downsampledCount) / result.originalCount * 100).toFixed(2) + '%' : '--',
            processingTime: result.processingTime ? result.processingTime.toFixed(2) + 'ms' : '--'
          });

          // Emit results to parent component
          if (onWasmResults) {
            onWasmResults({
              originalCount: result.originalCount || 0,
              downsampledCount: result.downsampledCount || 0,
              processingTime: result.processingTime || 0,
              reductionRatio: result.originalCount && result.downsampledCount ? result.originalCount / result.downsampledCount : 1,
              voxelCount: result.downsampledCount || 0
            });
          }
        }
    } catch (error) {
      Log.Error('Tools', 'WASM voxel downsampling error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleBeVoxelDownsampling = async () => {
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      Log.Debug('Tools', 'Found point cloud IDs for BE processing', allPointCloudIds);
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return;
      }

      // Collect all points from all point clouds
      const allPositions: number[] = [];
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
            
            // Calculate global bounding box
            globalMinX = Math.min(globalMinX, point.position.x);
            globalMinY = Math.min(globalMinY, point.position.y);
            globalMinZ = Math.min(globalMinZ, point.position.z);
            globalMaxX = Math.max(globalMaxX, point.position.x);
            globalMaxY = Math.max(globalMaxY, point.position.y);
            globalMaxZ = Math.max(globalMaxZ, point.position.z);
          }
        }
      }

      if (allPositions.length === 0) {
        Log.Error('Tools', 'No valid points found for BE processing');
        return;
      }

      const pointCloudData = new Float32Array(allPositions);

      Log.Info('Tools', 'Starting BE voxel downsampling', {
        pointCount: pointCloudData.length / 3,
        voxelSize,
        bounds: { globalMinX, globalMinY, globalMinZ, globalMaxX, globalMaxY, globalMaxZ }
      });

      // Clear the scene
      serviceManager.pointService?.clearAllPointClouds();

      // Set current tool for benchmark display
      onCurrentToolChange?.('voxel');

      // Process with BE C++ service
      const result = await serviceManager.toolsService.voxelDownsampleBackend({
        pointCloudData,
        voxelSize,
        globalBounds: {
          minX: globalMinX,
          minY: globalMinY,
          minZ: globalMinZ,
          maxX: globalMaxX,
          maxY: globalMaxY,
          maxZ: globalMaxZ,
        }
      });

      if (result.success && result.downsampledPoints) {
        // Convert downsampled points to PointCloudPoint array
        const downsampledPoints = [];
        for (let i = 0; i < result.downsampledPoints.length; i += 3) {
          downsampledPoints.push({
            position: {
              x: result.downsampledPoints[i],
              y: result.downsampledPoints[i + 1],
              z: result.downsampledPoints[i + 2],
            },
            color: { r: 1, g: 0, b: 0 }, // Red color for Backend processed points
            intensity: 1,
            classification: 0,
          });
        }

        // Create point cloud for Backend result
        const backendPointCloud = {
          points: downsampledPoints,
          metadata: {
            name: 'Backend Downsampled Point Cloud',
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
            originalCount: result.originalCount,
            downsampledCount: result.downsampledCount,
            voxelSize: voxelSize,
            processingTime: result.processingTime || 0
          },
        };

        // Add Backend result to the scene
        const backendId = `backend_downsampled_${Date.now()}`;
        await serviceManager.pointService?.loadPointCloud(backendId, backendPointCloud, false); // Don't reposition camera

        Log.Info('Tools', 'Backend voxel downsampling completed', {
          originalCount: result.originalCount || 0,
          downsampledCount: result.downsampledCount || 0,
          reduction: result.originalCount && result.downsampledCount ? ((result.originalCount - result.downsampledCount) / result.originalCount * 100).toFixed(2) + '%' : '--',
          processingTime: result.processingTime ? result.processingTime.toFixed(2) + 'ms' : '--'
        });

        // Calculate voxel count for BE results (same as WASM calculation)
        const voxelCount = result.downsampledCount || 0; // Each downsampled point represents one voxel
        
        // Emit results to parent component
        if (onBeResults) {
          onBeResults({
            originalCount: result.originalCount || 0,
            downsampledCount: result.downsampledCount || 0,
            processingTime: result.processingTime || 0,
            reductionRatio: result.originalCount && result.downsampledCount ? result.originalCount / result.downsampledCount : 1,
            voxelCount: voxelCount
          });
        }
      } else {
        Log.Error('Tools', 'Backend voxel downsampling failed', result.error);
      }
    } catch (error) {
      Log.Error('Tools', 'Backend voxel downsampling error', error);
    }
  };

  const handleTsVoxelDownsampling = async () => {
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      Log.Debug('Tools', 'Found point cloud IDs for TS processing', allPointCloudIds);
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return;
      }

      // Collect all points from all point clouds
      const allPositions: number[] = [];
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
            
            // Calculate global bounding box
            globalMinX = Math.min(globalMinX, point.position.x);
            globalMinY = Math.min(globalMinY, point.position.y);
            globalMinZ = Math.min(globalMinZ, point.position.z);
            globalMaxX = Math.max(globalMaxX, point.position.x);
            globalMaxY = Math.max(globalMaxY, point.position.y);
            globalMaxZ = Math.max(globalMaxZ, point.position.z);
          }
        }
      }

      if (allPositions.length === 0) {
        Log.Error('Tools', 'No valid points found for TS processing');
        return;
      }

      const pointCloudData = new Float32Array(allPositions);

      Log.Info('Tools', 'Starting TS voxel downsampling', {
        pointCount: pointCloudData.length / 3,
        voxelSize,
        bounds: { globalMinX, globalMinY, globalMinZ, globalMaxX, globalMaxY, globalMaxZ }
      });

      // Clear the scene
      serviceManager.pointService?.clearAllPointClouds();

      // Set current tool for benchmark display
      onCurrentToolChange?.('voxel');

      // Process with TypeScript service
      const result = await serviceManager.toolsService.voxelDownsampleTS({
        pointCloudData,
        voxelSize,
        globalBounds: {
          minX: globalMinX,
          minY: globalMinY,
          minZ: globalMinZ,
          maxX: globalMaxX,
          maxY: globalMaxY,
          maxZ: globalMaxZ,
        }
      });

      if (result.success && result.downsampledPoints) {
        // Convert downsampled points to PointCloudPoint array
        const downsampledPoints = [];
        for (let i = 0; i < result.downsampledPoints.length; i += 3) {
          downsampledPoints.push({
            position: {
              x: result.downsampledPoints[i],
              y: result.downsampledPoints[i + 1],
              z: result.downsampledPoints[i + 2],
            },
            color: { r: 0, g: 0, b: 1 }, // Blue color for TypeScript downsampled points
            intensity: 1,
            classification: 0,
          });
        }

        // Create point cloud for TypeScript result
        const tsPointCloud = {
          points: downsampledPoints,
          metadata: {
            name: 'TypeScript Downsampled Point Cloud',
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
            originalCount: result.originalCount,
            downsampledCount: result.downsampledCount,
            voxelSize: voxelSize,
            processingTime: result.processingTime,
            method: 'TypeScript'
          },
        };

        // Add TypeScript result to the scene
        const tsId = `ts_downsampled_${Date.now()}`;
        await serviceManager.pointService?.loadPointCloud(tsId, tsPointCloud, false); // Don't reposition camera

        Log.Info('Tools', 'TypeScript voxel downsampling completed', {
          originalCount: result.originalCount,
          downsampledCount: result.downsampledCount,
          reduction: result.originalCount && result.downsampledCount ? ((result.originalCount - result.downsampledCount) / result.originalCount * 100).toFixed(2) + '%' : '--',
          processingTime: result.processingTime ? result.processingTime.toFixed(2) + 'ms' : '--'
        });

        // Calculate voxel count for TS results (same as WASM calculation)
        const voxelCount = result.downsampledCount || 0; // Each downsampled point represents one voxel
        
        // Emit results to parent component
        if (onTsResults) {
          onTsResults({
            originalCount: result.originalCount || 0,
            downsampledCount: result.downsampledCount || 0,
            processingTime: result.processingTime || 0,
            reductionRatio: result.originalCount && result.downsampledCount ? result.originalCount / result.downsampledCount : 1,
            voxelCount: voxelCount
          });
        }
      } else {
        Log.Error('Tools', 'TypeScript voxel downsampling failed', result.error);
      }
    } catch (error) {
      Log.Error('Tools', 'TypeScript voxel downsampling error', error);
    }
  };

  // Point Cloud Smoothing - Core processing function
  const processPointCloudSmoothing = async (method: 'TS' | 'WASM' | 'WASM_CPP_MAIN' | 'WASM_RUST' | 'BE'): Promise<{
    originalCount: number;
    smoothedCount?: number;
    processingTime: number;
    smoothingRadius?: number;
    iterations?: number;
  } | null> => {
    Log.Info('Tools', '=== Starting WASM Point Cloud Smoothing ===', { method, timestamp: Date.now() });
    
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return null;
    }

    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return null;
      }

      // Collect all points from all point clouds
      const allPositions: number[] = [];

      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
          }
        }
      }

      if (allPositions.length === 0) {
        Log.Error('Tools', 'No valid points found for smoothing');
        return null;
      }

      const pointCloudData = new Float32Array(allPositions);

      Log.Info('Tools', 'Starting WASM point cloud smoothing', {
        pointCount: pointCloudData.length / 3,
        smoothingRadius,
        iterations: smoothingIterations
      });

      // Clear the scene
      serviceManager.pointService?.clearAllPointClouds();

      // Set current tool for benchmark display
      onCurrentToolChange?.('smoothing');

      // Use appropriate threading based on method
      let result;
      
      if (method === 'TS' || method === 'BE' || method === 'WASM_CPP_MAIN') {
        // TS, BE, and WASM_CPP_MAIN run on main thread (TS is lightweight, BE is separate process, WASM_CPP_MAIN is main thread WASM)
        if (method === 'TS') {
          result = await serviceManager.toolsService.performPointCloudSmoothingTS({
            points: pointCloudData,
            smoothingRadius,
            iterations: smoothingIterations
          });
        } else if (method === 'BE') {
          result = await serviceManager.toolsService.performPointCloudSmoothingBECPP({
            points: pointCloudData,
            smoothingRadius,
            iterations: smoothingIterations
          });
        } else {
          // WASM_CPP_MAIN - use main thread WASM C++
          result = await serviceManager.toolsService.performPointCloudSmoothingWASMCPP({
            points: pointCloudData,
            smoothingRadius,
            iterations: smoothingIterations
          });
        }
      } else {
        // WASM implementations - both C++ and Rust WASM use workers - NO FALLBACKS
        if (method === 'WASM') {
          // C++ WASM uses worker thread for fair benchmarking
          if (!workerManager.current) {
            Log.Error('Tools', 'Worker manager not available for C++ WASM');
            throw new Error('Worker manager not available for C++ WASM');
          }

          if (!workerManager.current.isReady) {
            Log.Error('Tools', 'Workers not initialized - FAILING');
            throw new Error('Workers not initialized - C++ WASM worker system failed');
          }

          Log.Info('Tools', 'Workers are ready, using worker for C++ WASM');
          Log.Info('Tools', `Calling worker for ${method} point cloud smoothing`);
          const workerResult = await workerManager.current.processPointCloudSmoothing(
            'WASM_CPP',
            pointCloudData,
            smoothingRadius,
            smoothingIterations
          );

          Log.Info('Tools', 'Worker result received', { 
            type: workerResult.type, 
            hasData: !!workerResult.data,
            dataKeys: workerResult.data ? Object.keys(workerResult.data) : 'no data',
            hasSmoothedPoints: !!workerResult.data?.smoothedPoints
          });

          if (workerResult.type !== 'SUCCESS' || !workerResult.data?.smoothedPoints) {
            Log.Error('Tools', `${method} point cloud smoothing failed in worker`, workerResult.error);
            throw new Error(`WASM C++ point cloud smoothing failed: ${workerResult.error}`);
          }

          result = {
            success: true,
            smoothedPoints: workerResult.data.smoothedPoints,
            originalCount: workerResult.data.originalCount,
            smoothedCount: workerResult.data.smoothedCount,
            processingTime: workerResult.data.processingTime
          };
        } else if (method === 'WASM_RUST') {
          // Rust WASM uses worker thread for fair benchmarking - NO FALLBACKS
          if (!workerManager.current) {
            Log.Error('Tools', 'Worker manager not available for Rust WASM');
            throw new Error('Worker manager not available for Rust WASM');
          }

          if (!workerManager.current.isReady) {
            Log.Error('Tools', 'Workers not initialized - FAILING');
            throw new Error('Workers not initialized - Rust WASM worker system failed');
          }

          Log.Info('Tools', `Calling worker for ${method} point cloud smoothing`);
          const workerResult = await workerManager.current.processPointCloudSmoothing(
            'WASM_RUST',
            pointCloudData,
            smoothingRadius,
            smoothingIterations
          );

          if (workerResult.type !== 'SUCCESS' || !workerResult.data?.smoothedPoints) {
            Log.Error('Tools', `${method} point cloud smoothing failed in worker`, workerResult.error);
            throw new Error(`WASM Rust point cloud smoothing failed: ${workerResult.error}`);
          }
          
          Log.Info('Tools', 'Worker result check passed, proceeding to conversion');
          
          // Convert worker result to service result format
          result = {
            success: true,
            smoothedPoints: workerResult.data.smoothedPoints,
            originalCount: workerResult.data.originalCount,
            smoothedCount: workerResult.data.smoothedCount,
            processingTime: workerResult.data.processingTime
          };
          Log.Info('Tools', 'Worker result converted successfully', { 
            success: result.success, 
            hasSmoothedPoints: !!result.smoothedPoints 
          });
        } else {
          Log.Error('Tools', `Unknown WASM method: ${method}`);
          return null;
        }
      }

      Log.Info('Tools', 'Checking result before processing', { 
        hasResult: !!result, 
        resultSuccess: result?.success, 
        hasSmoothedPoints: !!result?.smoothedPoints,
        resultKeys: result ? Object.keys(result) : 'no result'
      });
      
      if (result.success && result.smoothedPoints) {
        // Convert smoothed points to PointCloudPoint array
        const smoothedPoints = [];
        for (let i = 0; i < result.smoothedPoints.length; i += 3) {
          smoothedPoints.push({
            position: {
              x: result.smoothedPoints[i],
              y: result.smoothedPoints[i + 1],
              z: result.smoothedPoints[i + 2],
            },
            color: { r: 1, g: 1, b: 0 }, // Yellow color for smoothed points
            intensity: 1,
            classification: 0,
          });
        }

        // Create point cloud for smoothed result
        const smoothedPointCloud = {
          points: smoothedPoints,
          metadata: {
            name: 'WASM Smoothed Point Cloud',
            totalPoints: smoothedPoints.length,
            bounds: {
              min: {
                x: Math.min(...smoothedPoints.map(p => p.position.x)),
                y: Math.min(...smoothedPoints.map(p => p.position.y)),
                z: Math.min(...smoothedPoints.map(p => p.position.z))
              },
              max: {
                x: Math.max(...smoothedPoints.map(p => p.position.x)),
                y: Math.max(...smoothedPoints.map(p => p.position.y)),
                z: Math.max(...smoothedPoints.map(p => p.position.z))
              }
            },
            hasColor: true,
            hasIntensity: true,
            hasClassification: true,
            originalCount: result.originalCount || 0,
            smoothedCount: result.smoothedCount || 0,
            smoothingRadius: smoothingRadius,
            iterations: smoothingIterations,
            processingTime: result.processingTime || 0
          },
        };

        // Add smoothed result to the scene
        const smoothedId = `wasm_smoothed_${Date.now()}`;
        await serviceManager.pointService?.loadPointCloud(smoothedId, smoothedPointCloud, false);

        Log.Info('Tools', 'WASM point cloud smoothing completed', {
          originalCount: result.originalCount || 0,
          smoothedCount: result.smoothedCount || 0,
          processingTime: result.processingTime ? result.processingTime.toFixed(2) + 'ms' : '--'
        });

        // Store smoothing results for benchmark display
        const smoothingResults = {
          originalCount: result.originalCount || 0,
          smoothedCount: result.smoothedCount || 0,
          processingTime: result.processingTime || 0,
          smoothingRadius: smoothingRadius,
          iterations: smoothingIterations
        };
        // Don't set WASM results here - let each handler set its own
        return smoothingResults;
      } else {
        Log.Error('Tools', 'WASM point cloud smoothing failed', result.error);
        return null;
      }
    } catch (error) {
      Log.Error('Tools', 'WASM point cloud smoothing error', error);
      throw error;
    }
  };

  
  // Point Cloud Smoothing Handlers
  const handleWasmPointCloudSmoothing = async () => {
    const results = await processPointCloudSmoothing('WASM');
    if (results) {
      onWasmResults?.(results);
    }
  };

  // WASM C++ Main Thread Processing Functions
  const handleWasmCppMainVoxelDownsampling = async () => {
    Log.Info('Tools', '=== Starting WASM C++ Main Thread Voxel Downsampling ===');
    
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    // Set processing state immediately
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return;
      }

      // Collect all points from all point clouds
      const allPositions: number[] = [];
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
            
            // Calculate global bounding box
            globalMinX = Math.min(globalMinX, point.position.x);
            globalMinY = Math.min(globalMinY, point.position.y);
            globalMinZ = Math.min(globalMinZ, point.position.z);
            globalMaxX = Math.max(globalMaxX, point.position.x);
            globalMaxY = Math.max(globalMaxY, point.position.y);
            globalMaxZ = Math.max(globalMaxZ, point.position.z);
          }
        }
      }

      if (allPositions.length === 0) {
        Log.Error('Tools', 'No point data found');
        return;
      }

      const pointCloudData = new Float32Array(allPositions);

      Log.Info('Tools', 'Starting WASM C++ Main voxel downsampling', {
        pointCount: pointCloudData.length / 3,
        voxelSize,
        bounds: { minX: globalMinX, minY: globalMinY, minZ: globalMinZ, maxX: globalMaxX, maxY: globalMaxY, maxZ: globalMaxZ }
      });

      // Clear the scene
      serviceManager.pointService?.clearAllPointClouds();

      // Set current tool for benchmark display
      onCurrentToolChange?.('voxel');

      // Use WASM C++ Main Thread (no worker)
      const result = await serviceManager.toolsService.performVoxelDownsamplingWASMCPP({
        pointCloudData,
        voxelSize,
        globalBounds: {
          minX: globalMinX,
          minY: globalMinY,
          minZ: globalMinZ,
          maxX: globalMaxX,
          maxY: globalMaxY,
          maxZ: globalMaxZ,
        }
      });

      if (result.success && result.downsampledPoints) {
        // Convert Float32Array to point cloud format
        const downsampledPoints = [];
        for (let i = 0; i < result.downsampledPoints.length; i += 3) {
          downsampledPoints.push({
            position: {
              x: result.downsampledPoints[i],
              y: result.downsampledPoints[i + 1],
              z: result.downsampledPoints[i + 2],
            },
            color: { r: 0, g: 1, b: 0 }, // Green color for WASM C++ Main processed points
            intensity: 1,
            classification: 0,
          });
        }

        // Create point cloud for WASM C++ Main result
        const wasmCppMainPointCloud = {
          points: downsampledPoints,
          metadata: {
            name: 'WASM C++ Main Downsampled Point Cloud',
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
            originalCount: result.originalCount,
            downsampledCount: result.downsampledCount,
            voxelSize: voxelSize,
            processingTime: result.processingTime || 0
          },
        };

        // Add WASM C++ Main result to the scene
        const wasmCppMainId = `wasm_cpp_main_downsampled_${Date.now()}`;
        await serviceManager.pointService?.loadPointCloud(wasmCppMainId, wasmCppMainPointCloud, false);

        if (wasmCppMainPointCloud) {
          // Update benchmark results
          onWasmCppMainResults?.({
            originalCount: result.originalCount || 0,
            downsampledCount: result.downsampledCount || 0,
            processingTime: result.processingTime || 0
          });

          Log.Info('Tools', 'WASM C++ Main voxel downsampling completed', {
            originalCount: result.originalCount,
            downsampledCount: result.downsampledCount,
            processingTime: result.processingTime
          });
        }
      } else {
        Log.Error('Tools', 'WASM C++ Main voxel downsampling failed', result.error);
      }
    } catch (error) {
      Log.Error('Tools', 'WASM C++ Main voxel downsampling error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleWasmCppMainPointCloudSmoothing = async () => {
    console.log('🔧 Tools: handleWasmCppMainPointCloudSmoothing called');
    const results = await processPointCloudSmoothing('WASM_CPP_MAIN');
    console.log('🔧 Tools: processPointCloudSmoothing WASM_CPP_MAIN result:', results);
    if (results) {
      onWasmCppMainResults?.(results);
    }
  };


  const handleWasmRustVoxelDownsampling = async () => {
    console.log('🔧 Tools: handleWasmRustVoxelDownsampling called');
    
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    // Set processing state immediately
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      // Get all point cloud IDs
      const allPointCloudIds = serviceManager.pointService?.pointCloudIds || [];
      
      if (allPointCloudIds.length === 0) {
        Log.Error('Tools', 'No point clouds found in scene');
        return;
      }

      // Collect all points from all point clouds
      const allPositions: number[] = [];
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

      for (const pointCloudId of allPointCloudIds) {
        const pointCloud = serviceManager.pointService?.getPointCloud(pointCloudId);
        if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
          for (const point of pointCloud.points) {
            allPositions.push(point.position.x, point.position.y, point.position.z);
            
            globalMinX = Math.min(globalMinX, point.position.x);
            globalMinY = Math.min(globalMinY, point.position.y);
            globalMinZ = Math.min(globalMinZ, point.position.z);
            globalMaxX = Math.max(globalMaxX, point.position.x);
            globalMaxY = Math.max(globalMaxY, point.position.y);
            globalMaxZ = Math.max(globalMaxZ, point.position.z);
          }
        }
      }

      if (allPositions.length === 0) {
        Log.Error('Tools', 'No valid points found for WASM Rust processing');
        return;
      }

      const pointCloudData = new Float32Array(allPositions);
      const globalBounds = {
        minX: globalMinX,
        minY: globalMinY,
        minZ: globalMinZ,
        maxX: globalMaxX,
        maxY: globalMaxY,
        maxZ: globalMaxZ
      };

      // Clear the scene
      serviceManager.pointService?.clearAllPointClouds();

      // Set current tool for benchmark display
      onCurrentToolChange?.('voxel');

      // Process with WASM Rust worker for fair benchmarking - NO FALLBACKS
      if (!workerManager.current) {
        Log.Error('Tools', 'Worker manager not available for Rust WASM');
        throw new Error('Worker manager not available for Rust WASM');
      }

      if (!workerManager.current.isReady) {
        Log.Error('Tools', 'Workers not initialized - FAILING');
        throw new Error('Workers not initialized - Rust WASM worker system failed');
      }

      Log.Info('Tools', 'Calling worker for WASM Rust voxel downsampling');
      const workerResult = await workerManager.current.processVoxelDownsampling(
        'WASM_RUST',
        pointCloudData,
        voxelSize,
        globalBounds
      );

      if (workerResult.type !== 'SUCCESS' || !workerResult.data?.downsampledPoints) {
        Log.Error('Tools', 'WASM Rust voxel downsampling failed in worker', workerResult.error);
        throw new Error(`WASM Rust voxel downsampling failed: ${workerResult.error}`);
      }
      
      // Convert worker result to service result format
      const result = {
        success: true,
        downsampledPoints: workerResult.data.downsampledPoints,
        originalCount: workerResult.data.originalCount,
        downsampledCount: workerResult.data.downsampledCount,
        processingTime: workerResult.data.processingTime
      };

      console.log('🔧 Tools: processVoxelDownsampling result:', result);

      if (result.success && result.downsampledPoints) {
          // Convert downsampled points to PointCloudPoint array
          const downsampledPoints = [];
          for (let i = 0; i < result.downsampledPoints.length; i += 3) {
            downsampledPoints.push({
              position: {
                x: result.downsampledPoints[i],
                y: result.downsampledPoints[i + 1],
                z: result.downsampledPoints[i + 2],
              },
              color: { r: 1, g: 0.4, b: 0.28 }, // Orange/red color for WASM Rust processed points
              intensity: 1,
              classification: 0,
            });
          }

          // Create point cloud for WASM Rust result
          const wasmRustPointCloud = {
            points: downsampledPoints,
            metadata: {
              name: 'WASM Rust Downsampled Point Cloud',
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
              originalCount: result.originalCount,
              downsampledCount: result.downsampledCount,
              voxelSize: voxelSize,
              processingTime: result.processingTime || 0
            },
          };

          // Add WASM Rust result to the scene
          const wasmRustId = `wasm_rust_downsampled_${Date.now()}`;
          await serviceManager.pointService?.loadPointCloud(wasmRustId, wasmRustPointCloud, false);

          Log.Info('Tools', 'WASM Rust voxel downsampling completed', {
            originalCount: result.originalCount || 0,
            downsampledCount: result.downsampledCount || 0,
            reduction: result.originalCount && result.downsampledCount ? ((result.originalCount - result.downsampledCount) / result.originalCount * 100).toFixed(2) + '%' : '--',
            processingTime: result.processingTime ? result.processingTime.toFixed(2) + 'ms' : '--'
          });

          // Emit results to parent component
          if (onWasmRustResults) {
            console.log('🔧 Tools: Calling onWasmRustResults with:', {
              originalCount: result.originalCount || 0,
              downsampledCount: result.downsampledCount || 0,
              processingTime: result.processingTime || 0,
              reductionRatio: result.originalCount && result.downsampledCount ? result.originalCount / result.downsampledCount : 1,
              voxelCount: result.downsampledCount || 0
            });
            onWasmRustResults({
              originalCount: result.originalCount || 0,
              downsampledCount: result.downsampledCount || 0,
              processingTime: result.processingTime || 0,
              reductionRatio: result.originalCount && result.downsampledCount ? result.originalCount / result.downsampledCount : 1,
              voxelCount: result.downsampledCount || 0
            });
          }
        }
    } catch (error) {
      Log.Error('Tools', 'WASM Rust voxel downsampling error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleWasmRustPointCloudSmoothing = async () => {
    console.log('🔧 Tools: handleWasmRustPointCloudSmoothing called');
    const results = await processPointCloudSmoothing('WASM_RUST');
    console.log('🔧 Tools: processPointCloudSmoothing WASM_RUST result:', results);
    if (results) {
      onWasmRustResults?.(results);
    }
  };

  const handleTsPointCloudSmoothing = async () => {
    const results = await processPointCloudSmoothing('TS');
    if (results) {
      onTsResults?.(results);
    }
  };

  const handleBePointCloudSmoothing = async () => {
    const results = await processPointCloudSmoothing('BE');
    if (results) {
      onBeResults?.(results);
    }
  };

  const tools = [
    {
      name: 'Voxel Downsampling',
      description: 'Reduce point count by averaging points in grid cells',
    },
    {
      name: 'Point Cloud Smoothing',
      description: 'Smooth point cloud using Gaussian filtering',
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
                <div className="tools-col-3">TS</div>
                <div className="tools-col-4">C++ Main</div>
                <div className="tools-col-5">C++ Worker</div>
                <div className="tools-col-6">Rust Main</div>
                <div className="tools-col-7">Rust Worker</div>
                <div className="tools-col-8">BE C++</div>
              </div>

              {tools.map((tool, index) => (
                <React.Fragment key={index}>
                  <div className="tools-table-row">
                    <div className="tools-col-1">
                      <div className="tool-name">{tool.name}</div>
                      <div className="tool-description">{tool.description}</div>
                    </div>
                    <div className="tools-col-2">
                      {tool.name === 'Voxel Downsampling' && (
                        <div className="tool-control">
                          {/* <div className="tool-batch-size">
                            <label>WASM Batch Size:</label>
                            <input
                              type="range"
                              min="100"
                              max="5000"
                              step="500"
                              value={wasmBatchSize}
                              onChange={e => handleWasmBatchSizeChange(parseInt(e.target.value))}
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <span style={{ marginLeft: '8px', fontSize: '12px' }}>
                              {wasmBatchSize}
                            </span>
                          </div> */}
                        </div>
                      )}
                      {tool.name === 'Point Cloud Smoothing' && (
                        <div className="tool-control">
                          <div className="tool-slider-container">
                            <label>Smoothing Radius:</label>
                            <input
                              type="range"
                              min="0.1"
                              max="2.0"
                              step="0.1"
                              value={smoothingRadius}
                              onChange={e => setSmoothingRadius(parseFloat(e.target.value))}
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <div className="tool-value" style={{ marginLeft: '8px', fontSize: '12px' }}>
                              {smoothingRadius.toFixed(1)}m
                            </div>
                          </div>
                          <div className="tool-slider-container">
                            <label>Iterations:</label>
                            <input
                              type="range"
                              min="1"
                              max="10"
                              step="1"
                              value={smoothingIterations}
                              onChange={e => setSmoothingIterations(parseInt(e.target.value))}
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <div className="tool-value" style={{ marginLeft: '8px', fontSize: '12px' }}>
                              {smoothingIterations}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="tools-col-3">
                      <button
                        className="tools-ts-btn"
                        onClick={
                          tool.name === 'Voxel Downsampling'
                            ? handleTsVoxelDownsampling
                            : tool.name === 'Point Cloud Smoothing'
                            ? handleTsPointCloudSmoothing
                            : undefined
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing')
                          ? 'Processing...'
                          : 'TS'}
                      </button>
                    </div>
                    <div className="tools-col-4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="tools-wasm-main-btn"
                          onClick={
                            tool.name === 'Voxel Downsampling'
                              ? handleWasmCppMainVoxelDownsampling
                              : tool.name === 'Point Cloud Smoothing'
                              ? handleWasmCppMainPointCloudSmoothing
                              : undefined
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing')
                            ? 'Processing...'
                            : 'C++ Main'}
                        </button>
                        {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing') && (
                          <button
                            className="tools-cancel-btn"
                            onClick={handleCancelProcessing}
                            style={{
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="tools-col-5">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="tools-wasm-btn"
                          onClick={
                            tool.name === 'Voxel Downsampling'
                              ? handleWasmVoxelDownsampling
                              : tool.name === 'Point Cloud Smoothing'
                              ? handleWasmPointCloudSmoothing
                              : undefined
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing')
                            ? 'Processing...'
                            : 'C++ Worker'}
                        </button>
                        {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing') && (
                          <button
                            className="tools-cancel-btn"
                            onClick={handleCancelProcessing}
                            style={{
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="tools-col-6">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="tools-rust-wasm-main-btn"
                          onClick={
                            tool.name === 'Voxel Downsampling'
                              ? handleRustWasmMainVoxelDownsampling
                              : tool.name === 'Point Cloud Smoothing'
                              ? handleRustWasmMainPointCloudSmoothing
                              : undefined
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing')
                            ? 'Processing...'
                            : 'Rust Main'}
                        </button>
                        {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing') && (
                          <button
                            className="tools-cancel-btn"
                            onClick={handleCancelProcessing}
                            style={{
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="tools-col-7">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="tools-wasm-rust-btn"
                          onClick={
                            tool.name === 'Voxel Downsampling'
                              ? handleWasmRustVoxelDownsampling
                              : tool.name === 'Point Cloud Smoothing'
                              ? handleWasmRustPointCloudSmoothing
                              : undefined
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing')
                            ? 'Processing...'
                            : 'Rust Worker'}
                        </button>
                        {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing') && (
                          <button
                            className="tools-cancel-btn"
                            onClick={handleCancelProcessing}
                            style={{
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="tools-col-8">
                      <button
                        className="tools-be-btn"
                        onClick={
                          tool.name === 'Voxel Downsampling'
                            ? handleBeVoxelDownsampling
                            : tool.name === 'Point Cloud Smoothing'
                            ? handleBePointCloudSmoothing
                            : undefined
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing && (tool.name === 'Voxel Downsampling' || tool.name === 'Point Cloud Smoothing')
                          ? 'Processing...'
                          : 'BE C++'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Debug Voxels Row - Show after Voxel Downsampling */}
                  {tool.name === 'Voxel Downsampling' && (
                    <div className="tools-table-row">
                      <div className="tools-col-1">
                        <div className="tool-name">Debug Voxels</div>
                        <div className="tool-description">Visualize voxel grid for debugging</div>
                      </div>
                      <div className="tools-col-2">
                        <div className="tool-control">
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
                          <div className="tool-slider-container">
                            <label>Debug Voxel Size:</label>
                            <input
                              type="range"
                              min="0.01"
                              max="2.0"
                              step="0.01"
                              value={voxelSize}
                              onChange={e => handleVoxelSizeChange(parseFloat(e.target.value))}
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <div className="tool-value" style={{ marginLeft: '8px', fontSize: '12px' }}>
                              {voxelSize.toFixed(2)}m
                            </div>
                          </div>
                          {/* Max Voxels slider commented out - not providing performance benefits
                          <div className="tool-slider-container">
                            <label>Max Voxels:</label>
                            <input
                              type="range"
                              min="100"
                              max="10000"
                              step="100"
                              value={maxVoxels}
                              onChange={e => setMaxVoxels(parseInt(e.target.value))}
                              className="tool-slider"
                              style={{ width: '120px', marginLeft: '8px' }}
                            />
                            <div className="tool-value" style={{ marginLeft: '8px', fontSize: '12px' }}>
                              {maxVoxels.toLocaleString()}
                            </div>
                          </div>
                          */}
                        </div>
                      </div>
                      <div className="tools-col-3">
                        <button
                          className="tools-ts-btn"
                          onClick={handleTsVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'TS'}
                        </button>
                      </div>
                      <div className="tools-col-4">
                        <button
                          className="tools-wasm-main-btn"
                          onClick={handleWasmCppMainVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'C++ Main'}
                        </button>
                      </div>
                      <div className="tools-col-5">
                        <button
                          className="tools-wasm-btn"
                          disabled={true}
                          style={{ opacity: 0.5, cursor: 'not-allowed' }}
                          title="Worker threads not applicable for debug visualization"
                        >
                          N/A
                        </button>
                      </div>
                      <div className="tools-col-6">
                        <button
                          className="tools-rust-wasm-main-btn"
                          onClick={handleRustWasmMainVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'Rust Main'}
                        </button>
                      </div>
                      <div className="tools-col-7">
                        <button
                          className="tools-wasm-rust-btn"
                          disabled={true}
                          style={{ opacity: 0.5, cursor: 'not-allowed' }}
                          title="Worker threads not applicable for debug visualization"
                        >
                          N/A
                        </button>
                      </div>
                      <div className="tools-col-8">
                        <button
                          className="tools-be-btn"
                          onClick={handleBeVoxelDebug}
                          disabled={!showVoxelDebug || isProcessing}
                        >
                          {isProcessing ? 'Processing...' : 'BE C++'}
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
