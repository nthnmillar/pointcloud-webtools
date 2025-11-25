import { Log } from '../../utils/Log';
import type { ToolHandlers } from './ToolsTypes';
import { collectAllPoints } from './ToolsUtils';

/**
 * Factory function that creates all voxel debug handlers
 * Takes dependencies and returns an object with all handler functions
 */
export function createVoxelDebugHandlers(handlers: ToolHandlers) {
  const {
    serviceManager,
    callbacks,
    debugVoxelSize,
    workerManager,
  } = handlers;

  const handleTsVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    // Check if point clouds are available
    const pointData = collectAllPoints(serviceManager);
    if (!pointData) {
      Log.Error('Tools', 'No point clouds available for TS debug visualization');
      return;
    }
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(debugVoxelSize, 'TS', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'TS Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      callbacks.onTsResults?.({
        originalCount: 0,
        processingTime: processingTime,
        voxelCount: result?.voxelCount || 0,
      });
    } catch (error) {
      Log.Error('Tools', 'TS Debug Voxel generation failed', error);
    }
  };

  const handleWasmCppMainVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    // Check if point clouds are available
    const pointData = collectAllPoints(serviceManager);
    if (!pointData) {
      Log.Error('Tools', 'No point clouds available for WASM C++ Main debug visualization');
      return;
    }
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(debugVoxelSize, 'WASM_MAIN', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'WASM C++ Main Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      callbacks.onWasmCppMainResults?.({
        originalCount: 0,
        processingTime: processingTime,
        voxelCount: result?.voxelCount || 0,
      });
    } catch (error) {
      Log.Error('Tools', 'WASM C++ Main Debug Voxel generation failed', error);
    }
  };

  const handleRustWasmMainVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    // Check if point clouds are available
    const pointData = collectAllPoints(serviceManager);
    if (!pointData) {
      Log.Error('Tools', 'No point clouds available for Rust WASM Main debug visualization');
      return;
    }
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(debugVoxelSize, 'RUST_WASM_MAIN', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'Rust WASM Main Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      callbacks.onRustWasmMainResults?.({
        originalCount: 0,
        processingTime: processingTime,
        voxelCount: result?.voxelCount || 0,
      });
    } catch (error) {
      Log.Error('Tools', 'Rust WASM Main Debug Voxel generation failed', error);
    }
  };

  const handleCppWasmWorkerVoxelDebug = async () => {
    if (!serviceManager?.toolsService || !workerManager.current) return;
    
    if (!workerManager.current.isReady) {
      Log.Error('Tools', 'Workers not initialized - cannot process debug voxels');
      return;
    }

    const startTime = performance.now();
    try {
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      const workerResult = await workerManager.current.processVoxelDebug(
        'WASM_CPP',
        pointData.pointCloudData,
        debugVoxelSize,
        {
          minX: pointData.globalBounds.minX,
          minY: pointData.globalBounds.minY,
          minZ: pointData.globalBounds.minZ,
          maxX: pointData.globalBounds.maxX,
          maxY: pointData.globalBounds.maxY,
          maxZ: pointData.globalBounds.maxZ
        }
      );

      if (workerResult.type !== 'SUCCESS' || !workerResult.data?.voxelCenters) {
        Log.Error('Tools', 'C++ WASM Worker debug voxel generation failed', workerResult.error);
        return;
      }

      const voxelCenters = workerResult.data.voxelCenters;
      const voxelCount = workerResult.data.voxelCount || voxelCenters.length / 3;

      if (serviceManager.toolsService?.voxelDownsampleService?.voxelDownsampleDebug) {
        serviceManager.toolsService.voxelDownsampleService.voxelDownsampleDebug.showVoxelDebugWithCenters(
          voxelCenters,
          debugVoxelSize,
          { r: 0, g: 0.4, b: 1 },
          2000
        );
      }

      const processingTime = performance.now() - startTime;

      callbacks.onWasmResults?.({
        originalCount: 0,
        processingTime: processingTime,
        voxelCount: voxelCount,
      });
    } catch (error) {
      Log.Error('Tools', 'C++ WASM Worker Debug Voxel generation failed', error);
    }
  };

  const handleRustWasmWorkerVoxelDebug = async () => {
    if (!serviceManager?.toolsService || !workerManager.current) return;
    
    if (!workerManager.current.isReady) {
      Log.Error('Tools', 'Workers not initialized - cannot process debug voxels');
      return;
    }

    const startTime = performance.now();
    try {
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      const workerResult = await workerManager.current.processVoxelDebug(
        'WASM_RUST',
        pointData.pointCloudData,
        debugVoxelSize,
        {
          minX: pointData.globalBounds.minX,
          minY: pointData.globalBounds.minY,
          minZ: pointData.globalBounds.minZ,
          maxX: pointData.globalBounds.maxX,
          maxY: pointData.globalBounds.maxY,
          maxZ: pointData.globalBounds.maxZ
        }
      );

      if (workerResult.type !== 'SUCCESS' || !workerResult.data?.voxelCenters) {
        Log.Error('Tools', 'Rust WASM Worker debug voxel generation failed', workerResult.error);
        return;
      }

      const voxelCenters = workerResult.data.voxelCenters;
      const voxelCount = workerResult.data.voxelCount || voxelCenters.length / 3;

      if (serviceManager.toolsService?.voxelDownsampleService?.voxelDownsampleDebug) {
        serviceManager.toolsService.voxelDownsampleService.voxelDownsampleDebug.showVoxelDebugWithCenters(
          voxelCenters,
          debugVoxelSize,
          { r: 1, g: 0.4, b: 0.28 },
          2000
        );
      }

      const processingTime = performance.now() - startTime;

      callbacks.onWasmRustResults?.({
        originalCount: 0,
        processingTime: processingTime,
        voxelCount: voxelCount,
      });
    } catch (error) {
      Log.Error('Tools', 'Rust WASM Worker Debug Voxel generation failed', error);
    }
  };

  const handleBeVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    // Check if point clouds are available
    const pointData = collectAllPoints(serviceManager);
    if (!pointData) {
      Log.Error('Tools', 'No point clouds available for BE debug visualization');
      return;
    }
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(debugVoxelSize, 'BE', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'BE Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      callbacks.onBeResults?.({
        originalCount: 0,
        processingTime: processingTime,
        voxelCount: result?.voxelCount || 0,
      });
    } catch (error) {
      Log.Error('Tools', 'BE Debug Voxel generation failed', error);
    }
  };

  const handleBeRustVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    // Check if point clouds are available
    const pointData = collectAllPoints(serviceManager);
    if (!pointData) {
      Log.Error('Tools', 'No point clouds available for BE Rust debug visualization');
      return;
    }
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(debugVoxelSize, 'BE_RUST', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'BE Rust Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      callbacks.onBeRustResults?.({
        originalCount: 0,
        processingTime: processingTime,
        voxelCount: result?.voxelCount || 0
      });
    } catch (error) {
      Log.Error('Tools', 'BE Rust Debug Voxel generation failed', error);
    }
  };

  const handleBePythonVoxelDebug = async () => {
    if (!serviceManager?.toolsService) return;
    
    // Check if point clouds are available
    const pointData = collectAllPoints(serviceManager);
    if (!pointData) {
      Log.Error('Tools', 'No point clouds available for BE Python debug visualization');
      return;
    }
    
    const startTime = performance.now();
    try {
      const result = await serviceManager.toolsService.showVoxelDebug(debugVoxelSize, 'BE_PYTHON', 2000);
      const processingTime = performance.now() - startTime;
      
      Log.Info('Tools', 'BE Python Debug Voxel generation completed', {
        processingTime: processingTime.toFixed(2) + 'ms',
        voxelCount: result?.voxelCount || 0
      });

      callbacks.onBePythonResults?.({
        originalCount: 0,
        processingTime: processingTime,
        voxelCount: result?.voxelCount || 0
      });
    } catch (error) {
      Log.Error('Tools', 'BE Python Debug Voxel generation failed', error);
    }
  };

  return {
    handleTsVoxelDebug,
    handleWasmCppMainVoxelDebug,
    handleRustWasmMainVoxelDebug,
    handleCppWasmWorkerVoxelDebug,
    handleRustWasmWorkerVoxelDebug,
    handleBeVoxelDebug,
    handleBeRustVoxelDebug,
    handleBePythonVoxelDebug,
  };
}

