import { Log } from '../../utils/Log';
import type { ToolHandlers } from './ToolsTypes';
import { collectAllPoints } from './ToolsUtils';

/**
 * Factory function that creates all voxel downsampling handlers
 * Takes dependencies and returns an object with all handler functions
 */
export function createVoxelDownsamplingHandlers(handlers: ToolHandlers) {
  const {
    serviceManager,
    callbacks,
    voxelSize,
    debugVoxelSize,
    showVoxelDebug,
    setIsProcessing,
    isProcessingRef,
    workerManager,
  } = handlers;

  const handleRustWasmMainVoxelDownsampling = async () => {
    Log.Info(
      'Tools',
      '=== Starting Rust WASM Main Thread Voxel Downsampling ==='
    );

    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    const startTime = performance.now();
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      Log.Info('Tools', 'Starting Rust WASM Main voxel downsampling', {
        pointCount: pointData.pointCloudData.length / 3,
        voxelSize,
        bounds: pointData.globalBounds,
      });

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('voxel');

      const result =
        await serviceManager.toolsService.performVoxelDownsamplingRustWasmMain({
          pointCloudData: pointData.pointCloudData,
          colors: pointData.colors,
          intensities: pointData.intensities,
          classifications: pointData.classifications,
          voxelSize: showVoxelDebug ? debugVoxelSize : voxelSize,
          globalBounds: pointData.globalBounds,
        });

      if (result.success && result.downsampledPoints) {
        const rustWasmMainId = `rust_wasm_main_downsampled_${Date.now()}`;
        const pointCount = result.downsampledPoints.length / 3;
        const colors =
          result.downsampledColors != null &&
          result.downsampledColors.length === pointCount * 3
            ? new Float32Array(result.downsampledColors)
            : undefined;
        const intensities =
          result.downsampledIntensities != null &&
          result.downsampledIntensities.length === pointCount
            ? new Float32Array(result.downsampledIntensities)
            : undefined;
        const classifications =
          result.downsampledClassifications != null &&
          result.downsampledClassifications.length === pointCount
            ? new Uint8Array(result.downsampledClassifications)
            : undefined;
        await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
          rustWasmMainId,
          new Float32Array(result.downsampledPoints),
          undefined,
          {
            name: 'Rust WASM Main Downsampled Point Cloud',
            hasColor: colors != null,
            hasIntensity: intensities != null,
            hasClassification: classifications != null,
          },
          colors,
          intensities,
          classifications
        );

        const endToEndTime = performance.now() - startTime;
        const originalCount = result.originalCount || 0;
        const downsampledCount = result.downsampledCount || 0;
        const reductionRatio =
          originalCount > 0 && downsampledCount > 0
            ? downsampledCount / originalCount
            : 0;

        callbacks.onRustWasmMainResults?.({
          originalCount,
          downsampledCount,
          processingTime: endToEndTime,
          reductionRatio,
          voxelCount: downsampledCount,
        });
      } else {
        Log.Error(
          'Tools',
          'Rust WASM Main voxel downsampling failed',
          result.error
        );
      }
    } catch (error) {
      Log.Error('Tools', 'Rust WASM Main voxel downsampling error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleWasmVoxelDownsampling = async () => {
    Log.Info('Tools', '=== Starting WASM Voxel Downsampling ===');

    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    const startTime = performance.now();
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      Log.Info('Tools', 'Starting WASM voxel downsampling', {
        pointCount: pointData.pointCloudData.length / 3,
        voxelSize,
        bounds: pointData.globalBounds,
      });

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('voxel');

      if (!workerManager.current) {
        Log.Error('Tools', 'Worker manager not available for C++ WASM');
        throw new Error('Worker manager not available for C++ WASM');
      }

      if (!workerManager.current.isReady) {
        Log.Error('Tools', 'Workers not initialized - FAILING');
        throw new Error(
          'Workers not initialized - C++ WASM worker system failed'
        );
      }

      Log.Info('Tools', 'Calling worker for WASM C++ voxel downsampling');
      const workerResult = await workerManager.current.processVoxelDownsampling(
        'WASM_CPP',
        pointData.pointCloudData,
        showVoxelDebug ? debugVoxelSize : voxelSize,
        {
          minX: pointData.globalBounds.minX,
          minY: pointData.globalBounds.minY,
          minZ: pointData.globalBounds.minZ,
          maxX: pointData.globalBounds.maxX,
          maxY: pointData.globalBounds.maxY,
          maxZ: pointData.globalBounds.maxZ,
        },
        pointData.colors,
        pointData.intensities,
        pointData.classifications
      );

      if (
        workerResult.type !== 'SUCCESS' ||
        !workerResult.data?.downsampledPoints
      ) {
        Log.Error(
          'Tools',
          'WASM C++ voxel downsampling failed in worker',
          workerResult.error
        );
        throw new Error(
          `WASM C++ voxel downsampling failed: ${workerResult.error}`
        );
      }

      const data = workerResult.data as {
        downsampledPoints?: Float32Array;
        downsampledColors?: Float32Array;
        downsampledIntensities?: Float32Array;
        downsampledClassifications?: Uint8Array;
        originalCount?: number;
        downsampledCount?: number;
        processingTime?: number;
      };
      const result = {
        success: true,
        downsampledPoints: data.downsampledPoints,
        downsampledColors: data.downsampledColors,
        downsampledIntensities: data.downsampledIntensities,
        downsampledClassifications: data.downsampledClassifications,
        originalCount: data.originalCount,
        downsampledCount: data.downsampledCount,
        processingTime: data.processingTime,
        voxelCount: data.downsampledCount,
      };

      if (result.success && result.downsampledPoints) {
        const wasmId = `wasm_downsampled_${Date.now()}`;
        const pointCount = result.downsampledPoints.length / 3;
        // Use copies so we own the buffers and lengths are correct after worker transfer
        const positions = new Float32Array(result.downsampledPoints);
        const colors =
          result.downsampledColors != null &&
          result.downsampledColors.length === pointCount * 3
            ? new Float32Array(result.downsampledColors)
            : undefined;
        const intensities =
          result.downsampledIntensities != null &&
          result.downsampledIntensities.length === pointCount
            ? new Float32Array(result.downsampledIntensities)
            : undefined;
        const classifications =
          result.downsampledClassifications != null &&
          result.downsampledClassifications.length === pointCount
            ? new Uint8Array(result.downsampledClassifications)
            : undefined;
        await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
          wasmId,
          positions,
          undefined,
          {
            name: 'WASM Downsampled Point Cloud',
            hasColor: colors != null,
            hasIntensity: intensities != null,
            hasClassification: classifications != null,
          },
          colors,
          intensities,
          classifications
        );

        const endToEndTime = performance.now() - startTime;
        const originalCount = result.originalCount || 0;
        const downsampledCount = result.downsampledCount || 0;

        callbacks.onWasmResults?.({
          originalCount,
          downsampledCount,
          processingTime: endToEndTime,
          reductionRatio:
            originalCount > 0 && downsampledCount > 0
              ? downsampledCount / originalCount
              : 0,
          voxelCount: downsampledCount,
        });
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

    const startTime = performance.now();

    try {
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      Log.Info('Tools', 'Starting BE voxel downsampling', {
        pointCount: pointData.pointCloudData.length / 3,
        voxelSize,
        bounds: pointData.globalBounds,
      });

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('voxel');

      const result = await serviceManager.toolsService.voxelDownsampleBackend({
        pointCloudData: pointData.pointCloudData,
        colors: pointData.colors,
        intensities: pointData.intensities,
        classifications: pointData.classifications,
        voxelSize: showVoxelDebug ? debugVoxelSize : voxelSize,
        globalBounds: pointData.globalBounds,
      });

      if (result.success && result.downsampledPoints) {
        const backendId = `backend_downsampled_${Date.now()}`;
        const n = result.downsampledPoints.length / 3;
        const colors =
          result.downsampledColors &&
          result.downsampledColors.length === n * 3
            ? result.downsampledColors
            : undefined;
        const intensities =
          result.downsampledIntensities &&
          result.downsampledIntensities.length === n
            ? result.downsampledIntensities
            : undefined;
        const classifications =
          result.downsampledClassifications &&
          result.downsampledClassifications.length === n
            ? result.downsampledClassifications
            : undefined;
        await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
          backendId,
          result.downsampledPoints,
          undefined,
          {
            name: 'Backend Downsampled Point Cloud',
            hasIntensity: Boolean(intensities),
            hasClassification: Boolean(classifications),
          },
          colors,
          intensities,
          classifications
        );

        const endToEndTime = performance.now() - startTime;
        const originalCount = result.originalCount || 0;
        const downsampledCount = result.downsampledCount || 0;

        callbacks.onBeResults?.({
          originalCount,
          downsampledCount,
          processingTime: endToEndTime,
          reductionRatio:
            originalCount > 0 && downsampledCount > 0
              ? downsampledCount / originalCount
              : 0,
          voxelCount: downsampledCount,
        });
      } else {
        Log.Error('Tools', 'Backend voxel downsampling failed', result.error);
      }
    } catch (error) {
      Log.Error('Tools', 'Backend voxel downsampling error', error);
    }
  };

  const handleBeRustVoxelDownsampling = async () => {
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    try {
      const startTime = performance.now();
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('voxel');

      const result = await serviceManager.toolsService.voxelDownsampleBERust({
        pointCloudData: pointData.pointCloudData,
        colors: pointData.colors,
        intensities: pointData.intensities,
        classifications: pointData.classifications,
        voxelSize: showVoxelDebug ? debugVoxelSize : voxelSize,
        globalBounds: pointData.globalBounds,
      });

      if (result.success && result.downsampledPoints) {
        const n = result.downsampledPoints.length / 3;
        const colors =
          result.downsampledColors &&
          result.downsampledColors.length === n * 3
            ? result.downsampledColors
            : undefined;
        const intensities =
          result.downsampledIntensities &&
          result.downsampledIntensities.length === n
            ? result.downsampledIntensities
            : undefined;
        const classifications =
          result.downsampledClassifications &&
          result.downsampledClassifications.length === n
            ? result.downsampledClassifications
            : undefined;
        await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
          'BE Rust Voxel Downsampled',
          result.downsampledPoints,
          undefined,
          {
            name: 'Rust BE Downsampled Point Cloud',
            hasIntensity: Boolean(intensities),
            hasClassification: Boolean(classifications),
          },
          colors,
          intensities,
          classifications
        );

        const endToEndTime = performance.now() - startTime;
        const originalCount = result.originalCount || 0;
        const downsampledCount = result.downsampledCount || 0;
        const reductionRatio =
          originalCount > 0 ? downsampledCount / originalCount : 0;
        const voxelCount = result.voxelCount || downsampledCount;

        callbacks.onBeRustResults?.({
          originalCount,
          downsampledCount,
          processingTime: endToEndTime,
          reductionRatio,
          voxelCount,
        });
      } else {
        Log.Error(
          'Tools',
          'Backend Rust voxel downsampling failed',
          result.error
        );
      }
    } catch (error) {
      Log.Error('Tools', 'Backend Rust voxel downsampling error', error);
    }
  };

  const handleBePythonVoxelDownsampling = async () => {
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      const startTime = performance.now();
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('voxel');

      const result = await serviceManager.toolsService.voxelDownsampleBEPython({
        pointCloudData: pointData.pointCloudData,
        voxelSize: showVoxelDebug ? debugVoxelSize : voxelSize,
        globalBounds: pointData.globalBounds,
      });

      if (result.success && result.downsampledPoints) {
        await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
          'BE Python Voxel Downsampled',
          result.downsampledPoints,
          undefined,
          {
            name: 'Python BE Downsampled Point Cloud',
            hasIntensity: true,
            hasClassification: true,
          }
        );

        const endToEndTime = performance.now() - startTime;
        const originalCount = result.originalCount || 0;
        const downsampledCount = result.downsampledCount || 0;
        const voxelCount = result.voxelCount || downsampledCount;
        const reductionRatio =
          originalCount > 0 && downsampledCount > 0
            ? downsampledCount / originalCount
            : 0;

        callbacks.onBePythonResults?.({
          originalCount,
          downsampledCount,
          processingTime: endToEndTime,
          reductionRatio,
          voxelCount,
        });
      } else {
        Log.Error(
          'Tools',
          'Backend Python voxel downsampling failed',
          result.error
        );
      }
    } catch (error) {
      Log.Error('Tools', 'Backend Python voxel downsampling error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleTsVoxelDownsampling = async () => {
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    const startTime = performance.now();

    try {
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      Log.Info('Tools', 'Starting TS voxel downsampling', {
        pointCount: pointData.pointCloudData.length / 3,
        voxelSize,
        bounds: pointData.globalBounds,
      });

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('voxel');

      const result = await serviceManager.toolsService.voxelDownsampleTS({
        pointCloudData: pointData.pointCloudData,
        colors: pointData.colors,
        intensities: pointData.intensities,
        classifications: pointData.classifications,
        voxelSize: showVoxelDebug ? debugVoxelSize : voxelSize,
        globalBounds: pointData.globalBounds,
      });

      if (result.success && result.downsampledPoints) {
        const tsId = `ts_downsampled_${Date.now()}`;
        const pointCount = result.downsampledPoints.length / 3;
        const colors =
          result.downsampledColors != null &&
          result.downsampledColors.length === pointCount * 3
            ? new Float32Array(result.downsampledColors)
            : undefined;
        const intensities =
          result.downsampledIntensities != null &&
          result.downsampledIntensities.length === pointCount
            ? new Float32Array(result.downsampledIntensities)
            : undefined;
        const classifications =
          result.downsampledClassifications != null &&
          result.downsampledClassifications.length === pointCount
            ? new Uint8Array(result.downsampledClassifications)
            : undefined;
        await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
          tsId,
          new Float32Array(result.downsampledPoints),
          undefined,
          {
            name: 'TypeScript Downsampled Point Cloud',
            hasColor: colors != null,
            hasIntensity: intensities != null,
            hasClassification: classifications != null,
          },
          colors,
          intensities,
          classifications
        );

        const endToEndTime = performance.now() - startTime;
        const originalCount = result.originalCount || 0;
        const downsampledCount = result.downsampledCount || 0;

        callbacks.onTsResults?.({
          originalCount,
          downsampledCount,
          processingTime: endToEndTime,
          reductionRatio:
            originalCount > 0 && downsampledCount > 0
              ? downsampledCount / originalCount
              : 0,
          voxelCount: downsampledCount,
        });
      } else {
        Log.Error(
          'Tools',
          'TypeScript voxel downsampling failed',
          result.error
        );
      }
    } catch (error) {
      Log.Error('Tools', 'TypeScript voxel downsampling error', error);
    }
  };

  const handleWasmCppMainVoxelDownsampling = async () => {
    Log.Info(
      'Tools',
      '=== Starting WASM C++ Main Thread Voxel Downsampling ==='
    );

    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    const startTime = performance.now();
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      Log.Info('Tools', 'Starting WASM C++ Main voxel downsampling', {
        pointCount: pointData.pointCloudData.length / 3,
        voxelSize,
        bounds: pointData.globalBounds,
      });

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('voxel');

      const result =
        await serviceManager.toolsService.performVoxelDownsamplingWASMCPP({
          pointCloudData: pointData.pointCloudData,
          colors: pointData.colors,
          voxelSize: showVoxelDebug ? debugVoxelSize : voxelSize,
          globalBounds: pointData.globalBounds,
        });

      if (result.success && result.downsampledPoints) {
        const wasmCppMainId = `wasm_cpp_main_downsampled_${Date.now()}`;
        await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
          wasmCppMainId,
          result.downsampledPoints,
          undefined,
          {
            name: 'WASM C++ Main Downsampled Point Cloud',
            hasColor: result.downsampledColors != null,
            hasIntensity: true,
            hasClassification: true,
          },
          result.downsampledColors
        );

        const endToEndTime = performance.now() - startTime;
        const originalCount = result.originalCount || 0;
        const downsampledCount = result.downsampledCount || 0;
        const reductionRatio =
          originalCount > 0 && downsampledCount > 0
            ? downsampledCount / originalCount
            : 0;

        callbacks.onWasmCppMainResults?.({
          originalCount,
          downsampledCount,
          processingTime: endToEndTime,
          reductionRatio,
          voxelCount: downsampledCount,
        });
      } else {
        Log.Error(
          'Tools',
          'WASM C++ Main voxel downsampling failed',
          result.error
        );
      }
    } catch (error) {
      Log.Error('Tools', 'WASM C++ Main voxel downsampling error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleWasmRustVoxelDownsampling = async () => {
    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    const startTime = performance.now();
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      const pointData = collectAllPoints(serviceManager);
      if (!pointData) return;

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('voxel');

      if (!workerManager.current) {
        Log.Error('Tools', 'Worker manager not available for Rust WASM');
        throw new Error('Worker manager not available for Rust WASM');
      }

      if (!workerManager.current.isReady) {
        Log.Error('Tools', 'Workers not initialized - FAILING');
        throw new Error(
          'Workers not initialized - Rust WASM worker system failed'
        );
      }

      Log.Info('Tools', 'Calling worker for WASM Rust voxel downsampling');
      const workerResult = await workerManager.current.processVoxelDownsampling(
        'WASM_RUST',
        pointData.pointCloudData,
        showVoxelDebug ? debugVoxelSize : voxelSize,
        {
          minX: pointData.globalBounds.minX,
          minY: pointData.globalBounds.minY,
          minZ: pointData.globalBounds.minZ,
          maxX: pointData.globalBounds.maxX,
          maxY: pointData.globalBounds.maxY,
          maxZ: pointData.globalBounds.maxZ,
        },
        pointData.colors,
        pointData.intensities,
        pointData.classifications
      );

      if (
        workerResult.type !== 'SUCCESS' ||
        !workerResult.data?.downsampledPoints
      ) {
        Log.Error(
          'Tools',
          'WASM Rust voxel downsampling failed in worker',
          workerResult.error
        );
        throw new Error(
          `WASM Rust voxel downsampling failed: ${workerResult.error}`
        );
      }

      const data = workerResult.data as {
        downsampledPoints?: Float32Array;
        downsampledColors?: Float32Array;
        downsampledIntensities?: Float32Array;
        downsampledClassifications?: Uint8Array;
        originalCount?: number;
        downsampledCount?: number;
        processingTime?: number;
      };
      const result = {
        success: true,
        downsampledPoints: data.downsampledPoints,
        downsampledColors: data.downsampledColors,
        downsampledIntensities: data.downsampledIntensities,
        downsampledClassifications: data.downsampledClassifications,
        originalCount: data.originalCount,
        downsampledCount: data.downsampledCount,
        processingTime: data.processingTime,
      };

      if (result.success && result.downsampledPoints) {
        const wasmRustId = `wasm_rust_downsampled_${Date.now()}`;
        const pointCount = result.downsampledPoints.length / 3;
        const colors =
          result.downsampledColors != null &&
          result.downsampledColors.length === pointCount * 3
            ? new Float32Array(result.downsampledColors)
            : undefined;
        const intensities =
          result.downsampledIntensities != null &&
          result.downsampledIntensities.length === pointCount
            ? new Float32Array(result.downsampledIntensities)
            : undefined;
        const classifications =
          result.downsampledClassifications != null &&
          result.downsampledClassifications.length === pointCount
            ? new Uint8Array(result.downsampledClassifications)
            : undefined;
        await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
          wasmRustId,
          new Float32Array(result.downsampledPoints),
          undefined,
          {
            name: 'WASM Rust Downsampled Point Cloud',
            hasColor: colors != null,
            hasIntensity: intensities != null,
            hasClassification: classifications != null,
          },
          colors,
          intensities,
          classifications
        );

        const endToEndTime = performance.now() - startTime;
        const originalCount = result.originalCount || 0;
        const downsampledCount = result.downsampledCount || 0;

        callbacks.onWasmRustResults?.({
          originalCount,
          downsampledCount,
          processingTime: endToEndTime,
          reductionRatio:
            originalCount > 0 && downsampledCount > 0
              ? downsampledCount / originalCount
              : 0,
          voxelCount: downsampledCount,
        });
      }
    } catch (error) {
      Log.Error('Tools', 'WASM Rust voxel downsampling error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  return {
    handleRustWasmMainVoxelDownsampling,
    handleWasmVoxelDownsampling,
    handleBeVoxelDownsampling,
    handleBeRustVoxelDownsampling,
    handleBePythonVoxelDownsampling,
    handleTsVoxelDownsampling,
    handleWasmCppMainVoxelDownsampling,
    handleWasmRustVoxelDownsampling,
  };
}
